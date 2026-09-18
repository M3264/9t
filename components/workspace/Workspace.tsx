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
  LayoutGrid,
  Code2,
  FileText,
  Link2,
  Layers,
  LockKeyhole,
  Pin,
  Menu,
  X,
  List,
  ArrowDownUp,
  FolderOpen,
  Check,
  Moon,
  Plus,
  Search,
  Settings,
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
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = matchMedia("(max-width: 700px)");
    const apply = () => setMobile(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    if (!menuOpen || !mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = sidebarRef.current;
    const elements = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>("button, a[href]") || [],
      ).filter((el) => el.getClientRects().length > 0);
    elements()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (event.key === "Tab") {
        const items = elements(),
          first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [menuOpen, mobile]);
  const [loadError, setLoadError] = useState("");
  const requestId = useRef(0);
  useEffect(() => {
    try {
      if (localStorage.getItem("9t-layout") === "list") setLayout("list");
    } catch {}
  }, []);
  const changeLayout = (next: "grid" | "list") => {
    setLayout(next);
    try {
      localStorage.setItem("9t-layout", next);
    } catch {}
  };
  const navigate = (next: View, pinned = false) => {
    setView(next);
    setPinnedOnly(pinned);
    setQuery("");
    setSelected(null);
    setMenuOpen(false);
  };
  const [selected, setSelected] = useState<Obj | null>(null);
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
  // The server socket carries only a revision signal; the normal cookie-authenticated
  // API remains the source of truth for the actual objects.
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
      } catch {
        // private mode — ignore
      }
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
    { id: "all", label: "All items", count: counts.all, show: true },
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
    all: FolderOpen,
    snippet: Code2,
    file: FileText,
    link: Link2,
    board: Layers,
  };
  const title = pinnedOnly
    ? "Pinned items"
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
    <div className="workspace-app">
      <a className="skip-link" href="#collection">
        Skip to items
      </a>
      {menuOpen && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        inert={mobile && !menuOpen}
        className={`app-sidebar ${menuOpen ? "is-open" : ""}`}
      >
        <div className="sidebar-brand">
          <Logo />
          <span>YOUR PERSONAL CLOUD</span>
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          >
            <X />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="avatar">{(username || "P")[0].toUpperCase()}</span>
          <div>
            <strong>{username || "Personal"}’s workspace</strong>
            <small>Just for you</small>
          </div>
          <LockKeyhole />
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          {tabs
            .filter((t) => t.show)
            .map((t) => {
              const Icon = navIcons[t.id as keyof typeof navIcons];
              return (
                <button
                  key={t.id}
                  aria-current={
                    view === t.id && !pinnedOnly ? "page" : undefined
                  }
                  className={view === t.id && !pinnedOnly ? "active" : ""}
                  onClick={() => navigate(t.id)}
                >
                  <Icon />
                  <span>{t.label}</span>
                  {t.count !== undefined && view !== "trash" && (
                    <small>{t.count}</small>
                  )}
                </button>
              );
            })}
          <button
            className={pinnedOnly ? "active" : ""}
            onClick={() => navigate("all", true)}
          >
            <Pin />
            <span>Pinned</span>
          </button>
          <div className="sidebar-label">HANDOFF & ORGANIZE</div>
          <button
            className={view === "shares" ? "active" : ""}
            onClick={() => navigate("shares")}
          >
            <Share2 />
            <span>Shared links</span>
          </button>
          <button
            className={view === "trash" ? "active" : ""}
            onClick={() => navigate("trash")}
          >
            <Trash2 />
            <span>Trash</span>
          </button>
        </nav>
        <div className="sidebar-foot">
          <div className="private-note">
            <LockKeyhole />
            <div>
              <strong>On your own terms.</strong>
              <p>
                Your files live on your server.
                <br />
                You decide what gets shared.
              </p>
            </div>
          </div>
          <button
            className="sidebar-settings"
            onClick={() => {
              setMenuOpen(false);
              setModal("settings");
            }}
          >
            <Settings />
            <span>Settings</span>
            <span className="settings-dot" />
          </button>
          <div className="sidebar-signature">
            9t <span>A little space of your own.</span>
          </div>
        </div>
      </aside>
      <div className="app-surface">
        <header className="app-topbar">
          <button
            className="mobile-brand"
            onClick={() => navigate("all")}
            aria-label="My workspace"
          >
            <img src="/9t-mark.svg" alt="9t" />
          </button>
          <div className="breadcrumb">
            Personal <span>/</span>
            <strong>{title}</strong>
          </div>
          <label className="global-search">
            <Search />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find something…"
              aria-label="Search items"
            />
            <kbd>/</kbd>
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search">
                <X />
              </button>
            )}
          </label>
          <div className="topbar-actions">
            <button
              className="icon-button"
              aria-label="Search and commands"
              title="Commands · Ctrl K"
              onClick={() => setModal("commands")}
            >
              <Search />
            </button>
            <button
              className="icon-button"
              aria-label="Toggle theme"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            </button>
            <button
              className="avatar"
              aria-label="Workspace settings"
              onClick={() => setModal("settings")}
            >
              {(username || "P")[0].toUpperCase()}
            </button>
          </div>
        </header>
        <main className="workspace-main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> A SPACE THAT GOES WITH YOU
              </div>
              <h1>
                {title}
                <span>.</span>
              </h1>
              <p>
                {view === "all" && !pinnedOnly
                  ? "A file, a thought, a link. Keep it here. Pick it up anywhere."
                  : view === "trash"
                    ? `Deleted items stay here for ${config?.trashRetentionDays || 7} days before removal.`
                    : view === "shares"
                      ? "A small handoff. Only the things you choose to share."
                      : pinnedOnly
                        ? "The things you reach for, always close by."
                        : view === "board"
                          ? "Your own arrangement of the things that matter."
                          : "Less searching. More right where you left it."}
              </p>
            </div>
            <button
              className="primary-button new-item-button"
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
          <section className="collection-section" aria-label="Your items">
            <div className="collection-toolbar">
              <div className="collection-title">
                <h2 id="collection" tabIndex={-1}>
                  {query
                    ? "Search results"
                    : view === "all" && !pinnedOnly
                      ? "Your collection"
                      : title}
                </h2>
                <span>
                  {view === "shares" ? shares.length : visible.length}
                </span>
              </div>
              <div className="collection-controls">
                {view !== "shares" && view !== "board" && (
                  <>
                    <label className="sort-control">
                      <ArrowDownUp />
                      <select
                        aria-label="Sort items"
                        value={sort}
                        onChange={(e) =>
                          setSort(e.target.value as "recent" | "name")
                        }
                      >
                        <option value="recent">Recently updated</option>
                        <option value="name">Name A–Z</option>
                      </select>
                    </label>
                    <div
                      className="layout-switch"
                      role="group"
                      aria-label="Collection layout"
                    >
                      <button
                        className={layout === "grid" ? "active" : ""}
                        aria-label="Grid view"
                        aria-pressed={layout === "grid"}
                        onClick={() => changeLayout("grid")}
                      >
                        <LayoutGrid />
                      </button>
                      <button
                        className={layout === "list" ? "active" : ""}
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
            {(view === "all" || ["file", "snippet", "link"].includes(view)) &&
              !pinnedOnly && (
                <nav className="type-filters" aria-label="Filter collection">
                  {tabs
                    .filter((t) => t.show && t.id !== "board")
                    .map((t) => {
                      const Icon = navIcons[t.id as keyof typeof navIcons];
                      return (
                        <button
                          key={t.id}
                          aria-pressed={view === t.id}
                          className={view === t.id ? "active" : ""}
                          onClick={() => navigate(t.id)}
                        >
                          <Icon />
                          {t.label}
                        </button>
                      );
                    })}
                </nav>
              )}
            {collection}
          </section>
          <footer className="workspace-footer">
            <span>
              <LockKeyhole /> Your server. Your things.
            </span>
            <span>Put it in 9t. Get it anywhere.</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-dock" aria-label="Mobile navigation">
        <button
          className={view === "all" && !pinnedOnly ? "active" : ""}
          onClick={() => navigate("all")}
        >
          <FolderOpen />
          <span>Workspace</span>
        </button>
        <button
          className={pinnedOnly ? "active" : ""}
          onClick={() => navigate("all", true)}
        >
          <Pin />
          <span>Pinned</span>
        </button>
        <button
          className="dock-add"
          aria-label="Add something"
          onClick={() => setModal(activeModules ? "create" : "settings")}
        >
          <Plus />
        </button>
        <button
          className={view === "shares" ? "active" : ""}
          onClick={() => navigate("shares")}
        >
          <Share2 />
          <span>Shared</span>
        </button>
        <button
          aria-label="More navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Menu />
          <span>More</span>
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
            flash("Item added");
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
        <div className="toast" role="status" aria-live="polite">
          <Check aria-hidden="true" />
          {toast}
        </div>
      )}
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
