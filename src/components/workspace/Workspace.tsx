"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brand as Logo,
  ErrorBoundary,
  LoadingScreen as Boot,
} from "../ui/Brand";
import {
  LoginScreen as Login,
  SetupScreen as Setup,
} from "../access/AccessScreens";
import {
  Board,
  ObjectList as Stream,
  ShareList as ShareLog,
} from "./ObjectCollection";
import QuickAdd from "./UniversalInbox";
import {
  CommandsDialog as Commands,
  CreateDialog as Create,
  Inspector,
  SettingsDialog as SettingsPanel,
  ShareDialog as ShareModal,
} from "./WorkspaceDialogs";
import {
  Command,
  LayoutGrid,
  Code2,
  FileText,
  Link2,
  Layers,
  Pin,
  X,
  List,
  ArrowDownUp,
  Check,
  Moon,
  Plus,
  Search,
  Share2,
  Sun,
  Trash2,
} from "lucide-react";
import type {
  Theme,
  WorkspaceConfig as Config,
  WorkspaceObject as Obj,
  WorkspaceShare as Share,
  WorkspaceView as View,
} from "../../types/workspace";
import { ApiError, workspaceApi as api } from "../../lib/client/workspace";
import styles from "./Workspace.module.css";

type Phase = "loading" | "setup" | "login" | "desk";

function useToast() {
  const [toast, setToast] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const flash = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(""), 2200);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { toast, flash };
}

function SkeletonList() {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton-row">
          <span />
          <div>
            <i />
            <b />
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkspaceInner() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [username, setUsername] = useState("");
  const [objects, setObjects] = useState<Obj[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [layout, setLayout] = useState<"grid" | "list">("list");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [loadError, setLoadError] = useState("");
  const requestId = useRef(0);
  useEffect(() => {
    try {
      if (localStorage.getItem("9t-layout") === "grid") setLayout("grid");
    } catch {}
  }, []);
  const changeLayout = (next: "grid" | "list") => {
    setLayout(next);
    try {
      localStorage.setItem("9t-layout", next);
    } catch {}
  };
  const [selected, setSelected] = useState<Obj | null>(null);
  const navigate = (next: View, pinned = false) => {
    setView(next);
    setPinnedOnly(pinned);
    setQuery("");
    setSelected(null);
  };
  const [modal, setModal] = useState<
    null | "create" | "share" | "settings" | "commands"
  >(null);
  const { toast, flash } = useToast();
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    let s: {
      initialized?: boolean;
      authenticated?: boolean;
      config?: Config;
      username?: string;
    };
    try {
      s = await api("/api/status");
    } catch {
      setPhase("login");
      return;
    }
    if (!s.initialized) {
      setPhase("setup");
      return;
    }
    if (!s.authenticated || !s.config) {
      setPhase("login");
      return;
    }
    setConfig(s.config);
    setUsername(s.username || "");
    setPhase("desk");
  }, []);

  const loadObjects = useCallback(
    async (currentView: View) => {
      const currentRequest = ++requestId.current;
      setLoadingObjects(true);
      setLoadError("");
      try {
        const [items, links] = await Promise.all([
          api(`/api/objects${currentView === "trash" ? "?trash=true" : ""}`),
          api("/api/shares"),
        ]);
        if (currentRequest !== requestId.current) return;
        setObjects(items.objects ?? []);
        setShares(links.shares ?? []);
      } catch (e) {
        if (currentRequest !== requestId.current) return;
        if (e instanceof ApiError && e.status === 401) setPhase("login");
        else if (currentRequest === requestId.current)
          setLoadError("Your items couldn’t be loaded. Try again.");
      } finally {
        if (currentRequest === requestId.current) setLoadingObjects(false);
      }
    },
    [flash],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (phase === "desk") loadObjects(view);
  }, [phase, view, loadObjects]);

  // Keep an open browser tab current without repeatedly downloading the collection.
  useEffect(() => {
    if (phase !== "desk") return;
    let socket: WebSocket | null = null;
    let stopped = false;
    let retry: number | undefined;
    let delay = 1000;
    const connect = () => {
      if (stopped) return;
      const scheme = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${scheme}//${location.host}/api/mobile/socket`);
      socket.onopen = () => { delay = 1000; };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type?: string };
          if (message.type === "ready" || message.type === "changed") loadObjects(view);
        } catch {}
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (!stopped) {
          retry = window.setTimeout(connect, delay);
          delay = Math.min(30000, delay * 2);
        }
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retry) window.clearTimeout(retry);
      socket?.close();
    };
  }, [phase, view, loadObjects]);

  // Theme
  useEffect(() => {
    if (!config) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        config.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : config.theme;
      document.documentElement.dataset.theme = resolved;
      setResolvedTheme(resolved);
      try {
        localStorage.setItem("9t-theme", config.theme);
      } catch {}
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [config]);

  // Keyboard shortcuts
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (phase !== "desk") return;
      const typing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModal("commands");
      } else if (e.key === "/" && !modal && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (
        e.key.toLowerCase() === "n" &&
        !modal &&
        !selected &&
        !typing
      ) {
        setModal(
          config &&
            (config.modules.snippets ||
              config.modules.files ||
              config.modules.links)
            ? "create"
            : "settings",
        );
      } else if (e.key === "Escape" && selected && !modal) {
        setSelected(null);
      }
    };
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  }, [modal, selected, phase, config]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return objects
      .filter((o) => {
        if (
          config &&
          !config.modules[`${o.type}s` as "snippets" | "files" | "links"]
        )
          return false;
        if (pinnedOnly && !o.pinned) return false;
        if (
          view !== "all" &&
          view !== "board" &&
          view !== "trash" &&
          o.type !== view
        )
          return false;
        if (!q) return true;
        return (o.name + " " + (o.content || "") + " " + (o.url || ""))
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name)
          : +new Date(b.updatedAt) - +new Date(a.updatedAt),
      );
  }, [objects, view, query, pinnedOnly, sort, config]);

  const counts = useMemo(() => {
    const active = objects.filter(
      (o) =>
        !o.deletedAt &&
        (!config ||
          config.modules[`${o.type}s` as "snippets" | "files" | "links"]),
    );
    return {
      all: active.length,
      snippet: active.filter((o) => o.type === "snippet").length,
      file: active.filter((o) => o.type === "file").length,
      link: active.filter((o) => o.type === "link").length,
    };
  }, [objects, config]);

  const patch = async (o: Obj, body: Record<string, unknown>) => {
    try {
      await api(`/api/objects/${o.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      flash(e instanceof ApiError ? e.message : "Couldn't update item.");
      return false;
    }
    setObjects((items) =>
      items.map((x) =>
        x.id === o.id
          ? { ...x, ...body, updatedAt: new Date().toISOString() }
          : x,
      ),
    );
    setSelected((s) => (s?.id === o.id ? { ...s, ...body } : s));
    return true;
  };

  const remove = async (o: Obj, permanent = false) => {
    try {
      await api(`/api/objects/${o.id}${permanent ? "?permanent=true" : ""}`, {
        method: "DELETE",
      });
    } catch (e) {
      flash(e instanceof ApiError ? e.message : "Couldn't delete item.");
      return;
    }
    setObjects((items) => items.filter((x) => x.id !== o.id));
    setSelected(null);
    flash(permanent ? "Item deleted" : "Moved to Trash");
  };

  const setTheme = async (theme: Theme) => {
    try {
      await api("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      setConfig((c) => (c ? { ...c, theme } : c));
    } catch {
      flash("Couldn't change theme.");
    }
  };

  if (phase === "loading") return <Boot />;
  if (phase === "setup") return <Setup done={refresh} />;
  if (phase === "login") return <Login done={refresh} />;

  const tabs: Array<{
    id: View;
    label: string;
    count?: number;
    show: boolean;
  }> = [
    { id: "all", label: "All", count: counts.all, show: true },
    {
      id: "snippet",
      label: "Snippets",
      count: counts.snippet,
      show: !!config?.modules.snippets,
    },
    {
      id: "file",
      label: "Files",
      count: counts.file,
      show: !!config?.modules.files,
    },
    {
      id: "link",
      label: "Links",
      count: counts.link,
      show: !!config?.modules.links,
    },
    { id: "board", label: "Board", show: !!config?.modules.board },
  ];

  const navIcons = {
    all: LayoutGrid,
    snippet: Code2,
    file: FileText,
    link: Link2,
    board: Layers,
  };
  const title = pinnedOnly
    ? "Pinned"
    : view === "all"
      ? "My workspace"
      : view === "shares"
        ? "Shared links"
        : view === "trash"
          ? "Trash"
          : tabs.find((t) => t.id === view)?.label || "My workspace";
  const activeModules =
    config &&
    (config.modules.files || config.modules.snippets || config.modules.links);
  const collection = (
    <>
      {loadError ? (
        <div className="zero-state" role="alert">
          <h2>Let’s try that again.</h2>
          <p>{loadError}</p>
          <button className="primary-button" onClick={() => loadObjects(view)}>
            Reload items
          </button>
        </div>
      ) : loadingObjects ? (
        <SkeletonList />
      ) : view === "board" ? (
        <Board objects={visible} move={patch} open={setSelected} />
      ) : view === "shares" ? (
        <ShareLog
          shares={shares.filter(
            (s) =>
              !query ||
              s.object.name.toLowerCase().includes(query.toLowerCase()),
          )}
          notify={flash}
          revoke={async (share) => {
            try {
              await api(`/api/shares/${share.id}`, { method: "DELETE" });
              setShares((items) => items.filter((s) => s.id !== share.id));
              flash("Share revoked");
            } catch (error) {
              flash(
                error instanceof ApiError
                  ? error.message
                  : "Couldn’t revoke this link.",
              );
            }
          }}
        />
      ) : (
        <Stream
          objects={visible}
          layout={layout}
          searching={!!query}
          trash={view === "trash"}
          open={setSelected}
          patch={patch}
          remove={remove}
          notify={flash}
          create={() => setModal(activeModules ? "create" : "settings")}
          restore={async (object) => {
            if (await patch(object, { restore: true })) {
              setObjects((items) => items.filter((o) => o.id !== object.id));
              flash("Item restored");
            }
          }}
        />
      )}
    </>
  );

  return (
    <div className={styles.app}>
      <a className="skip-link" href="#collection">
        Skip to items
      </a>

      <header className={styles.topbar}>
        <button className={styles.logo} onClick={() => navigate("all")} aria-label="9t home">
          <span className={styles.logoMark}>
            <img src="/9t-mark.svg" alt="" aria-hidden="true" />
          </span>
          <span className={styles.logoText}>
            <b>9t</b>
            <span>Your workspace</span>
          </span>
        </button>

        <label className={styles.search}>
          <Search />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find something…"
            aria-label="Search items"
          />
          {query ? (
            <button className={styles.searchClear} onClick={() => setQuery("")} aria-label="Clear search">
              <X />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </label>

        <div className={styles.actions}>
          <button
            className={styles.iconBtn}
            aria-label="Commands (Ctrl K)"
            title="Commands · Ctrl K"
            onClick={() => setModal("commands")}
          >
            <Command />
          </button>
          <button
            className={styles.iconBtn}
            aria-label="Toggle theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
          </button>
          <button
            className={styles.avatar}
            aria-label="Workspace settings"
            onClick={() => setModal("settings")}
          >
            {(username || "P")[0].toUpperCase()}
          </button>
        </div>
      </header>


      <main className={styles.main}>
        <div className={styles.hero}>
          <div>
            <h1>{pinnedOnly ? "Your essentials." : view === "all" && !query ? "Everything, right here." : query ? "Find your things." : `${title}.`}</h1>
            <p>
              {view === "all" && !pinnedOnly && !query
                ? "A little space for your files, thoughts and links."
                : view === "trash"
                  ? `Deleted items stay here for ${config?.trashRetentionDays || 7} days.`
                  : view === "shares"
                    ? "Manage the links you’ve shared."
                    : pinnedOnly
                      ? "The things you reach for most."
                      : view === "board"
                        ? "Drag it around. Make it yours."
                        : query
                          ? `Results for “${query}”.`
                          : "Less hunting. More finding."}
            </p>
          </div>
          <button
            className={styles.addBtn}
            onClick={() => setModal(activeModules ? "create" : "settings")}
          >
            <Plus />
            {activeModules ? "Add something" : "Enable modules"}
          </button>
        </div>

        {view === "all" && !pinnedOnly && !query && config && (
          <QuickAdd
            config={config}
            saved={async () => {
              await loadObjects(view);
            }}
            notify={flash}
          />
        )}

      <nav className={styles.tabsBar} aria-label="Workspace views">
        {tabs
          .filter((t) => t.show)
          .map((t) => {
            const Icon = navIcons[t.id as keyof typeof navIcons];
            const active = view === t.id && !pinnedOnly;
            return (
              <button
                key={t.id}
                className={`${styles.tab} ${active ? styles.tabActive : ""}`}
                aria-pressed={active}
                onClick={() => navigate(t.id)}
              >
                <Icon />
                {t.label}
              </button>
            );
          })}
        <button
          className={`${styles.tab} ${styles.secondaryTab} ${pinnedOnly ? styles.tabActive : ""}`}
          aria-pressed={pinnedOnly}
          onClick={() => navigate("all", true)}
        >
          <Pin />
          Pinned
        </button>
        <button
          className={`${styles.tab} ${styles.secondaryTab} ${view === "shares" ? styles.tabActive : ""}`}
          aria-pressed={view === "shares"}
          onClick={() => navigate("shares")}
        >
          <Share2 />
          Shared
        </button>
        <button
          className={`${styles.tab} ${styles.secondaryTab} ${view === "trash" ? styles.tabActive : ""}`}
          aria-pressed={view === "trash"}
          onClick={() => navigate("trash")}
        >
          <Trash2 />
          Trash
        </button>
      </nav>

        <section aria-label="Your items">
          <div className={styles.sectionHead}>
            <h2 id="collection" tabIndex={-1}>
              {query ? "Matches" : view === "all" && !pinnedOnly ? "Your items" : title}
              <span className={styles.count}>{view === "shares" ? shares.length : visible.length}</span>
            </h2>
            <div className={styles.controls}>
              {view !== "shares" && view !== "board" && (
                <>
                  <label className={styles.sort}>
                    <ArrowDownUp />
                    <select
                      aria-label="Sort items"
                      value={sort}
                      onChange={(e) => setSort(e.target.value as "recent" | "name")}
                    >
                      <option value="recent">Recent</option>
                      <option value="name">A–Z</option>
                    </select>
                  </label>
                  <div className={styles.layoutSwitch} role="group" aria-label="Layout">
                    <button
                      aria-label="Grid view"
                      aria-pressed={layout === "grid"}
                      onClick={() => changeLayout("grid")}
                    >
                      <LayoutGrid />
                    </button>
                    <button
                      aria-label="List view"
                      aria-pressed={layout === "list"}
                      onClick={() => changeLayout("list")}
                    >
                      <List />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          {collection}
        </section>

        <footer className={styles.footer}>
          <span>Your space. Your server.</span>
          <span>9t</span>
        </footer>
      </main>

      <nav className={styles.dock} aria-label="Mobile navigation">
        <button data-active={view === "all" && !pinnedOnly} onClick={() => navigate("all")}>
          <LayoutGrid />
          <span>Home</span>
        </button>
        <button data-active={pinnedOnly} onClick={() => navigate("all", true)}>
          <Pin />
          <span>Pinned</span>
        </button>
        <button
          className={styles.dockAdd}
          aria-label="Add something"
          onClick={() => setModal(activeModules ? "create" : "settings")}
        >
          <Plus />
        </button>
        <button data-active={view === "shares"} onClick={() => navigate("shares")}>
          <Share2 />
          <span>Shared</span>
        </button>
        <button data-active={view === "trash"} onClick={() => navigate("trash")}>
          <Trash2 />
          <span>Trash</span>
        </button>
      </nav>

      {selected && (
        <Inspector
          key={selected.id}
          object={selected}
          close={() => setSelected(null)}
          save={async (body) => {
            if (!(await patch(selected, body)))
              throw new Error("Changes could not be saved.");
            flash("Item updated");
          }}
          share={() => setModal("share")}
          pin={() => patch(selected, { pinned: !selected.pinned })}
          remove={() => remove(selected)}
        />
      )}
      {modal === "create" && config && (
        <Create
          config={config}
          close={() => setModal(null)}
          saved={async () => {
            setModal(null);
            await loadObjects(view);
            flash("Item saved");
          }}
        />
      )}
      {modal === "share" && selected && (
        <ShareModal
          object={selected}
          close={() => setModal(null)}
          created={async () => {
            await loadObjects(view);
            flash("Share link ready");
          }}
        />
      )}
      {modal === "settings" && config && (
        <SettingsPanel
          signOut={async () => {
            try {
              await api("/api/auth/logout", { method: "POST" });
              setModal(null);
              setPhase("login");
            } catch {
              flash("Couldn’t sign out. Try again.");
            }
          }}
          config={config}
          close={() => setModal(null)}
          saved={async () => {
            setModal(null);
            await refresh();
            navigate("all");
            await loadObjects("all");
            flash("Settings saved");
          }}
        />
      )}
      {modal === "commands" && (
        <Commands
          config={config!}
          close={() => setModal(null)}
          run={(action) => {
            setModal(null);
            if (action === "create") setModal("create");
            else if (action === "settings") setModal("settings");
            else navigate(action as View);
          }}
        />
      )}
      {toast && (
        <div className={styles.toast} role="status" aria-live="polite">
          <Check aria-hidden="true" />
          {toast}
        </div>
      )}
      <div style={{ display: "none" }}>
        <Logo />
      </div>
    </div>
  );
}

export default function Workspace() {
  return (
    <ErrorBoundary>
      <WorkspaceInner />
    </ErrorBoundary>
  );
}
