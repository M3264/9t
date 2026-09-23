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
import { PinnedItems } from "./PinnedItems";
import Link from "next/link";
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
  ArrowUpRight,
  ChevronRight,
  HardDrive,
  Settings2,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import type {
  Theme,
  WorkspaceConfig as Config,
  WorkspaceObject as Obj,
  WorkspaceShare as Share,
  WorkspaceView as View,
} from "../../types/workspace";
import { ApiError, formatBytes, workspaceApi as api } from "../../lib/client/workspace";
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
  const [library, setLibrary] = useState<Obj[]>([]);
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
        const [items, links, trashItems] = await Promise.all([
          api("/api/objects"),
          api("/api/shares"),
          currentView === "trash" ? api("/api/objects?trash=true") : Promise.resolve(null),
        ]);
        if (currentRequest !== requestId.current) return;
        setObjects((trashItems ?? items).objects ?? []);
        setLibrary(items.objects ?? []);
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
    const active = library.filter(
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
  }, [library, config]);

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
    setLibrary((items) => items.map((x) => x.id === o.id ? { ...x, ...body } : x));
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
    setLibrary((items) => items.filter((x) => x.id !== o.id));
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
    all: LayoutGrid,
    snippet: Code2,
    file: FileText,
    link: Link2,
    board: Layers,
  };
  const title = pinnedOnly
    ? "Pinned"
    : view === "all"
      ? "Workspace"
      : view === "shares"
        ? "Shared links"
        : view === "trash"
          ? "Trash"
          : tabs.find((t) => t.id === view)?.label || "Workspace";
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
              await loadObjects("trash");
              flash("Item restored");
            }
          }}
        />
      )}
    </>
  );

  const home = view === "all" && !pinnedOnly && !query;
  const pinned = library.filter((o) => o.pinned && config?.modules[`${o.type}s` as "files" | "snippets" | "links"]);
  const fileBytes = library.reduce((sum, o) => sum + (o.sizeBytes || 0), 0);

  return (
    <div className={styles.app}>
      <a className="skip-link" href="#collection">Skip to items</a>

      <aside className={styles.sidebar}>
        <button className={styles.logo} onClick={() => navigate("all")} aria-label="9t home">
          <img src="/9t-mark.svg" alt="9t" />
          <span>your little cloud<span className={styles.brandDot}>.</span></span>
        </button>
        <div className={styles.workspaceLabel}><span className={styles.workspaceInitial}>{(username || "P")[0].toUpperCase()}</span><div>{username ? `${username}’s workspace` : "Personal workspace"}<small>Personal · Just you</small></div><ChevronRight /></div>
        <span className={styles.navLabel}>WORKSPACE</span>
        <nav className={styles.navigation} aria-label="Workspace views">
          {tabs.filter((t) => t.show).map((t) => {
            const Icon = navIcons[t.id as keyof typeof navIcons];
            return <button key={t.id} className={styles.navItem} aria-pressed={view === t.id && !pinnedOnly} onClick={() => navigate(t.id)}><Icon /><span>{t.label}</span>{typeof t.count === "number" && <small>{t.count}</small>}</button>;
          })}
          <div className={styles.navDivider} />
          <button className={styles.navItem} aria-pressed={pinnedOnly} onClick={() => navigate("all", true)}><Pin /><span>Pinned</span>{pinned.length > 0 && <small>{pinned.length}</small>}</button>
          <button className={styles.navItem} aria-pressed={view === "shares"} onClick={() => navigate("shares")}><Share2 /><span>Shared links</span>{shares.length > 0 && <small>{shares.length}</small>}</button>
          <button className={styles.navItem} aria-pressed={view === "trash"} onClick={() => navigate("trash")}><Trash2 /><span>Trash</span></button>
        </nav>
        <div className={styles.sidebarBottom}>
          <Link className={styles.navItem} href="/devices"><Smartphone /><span>Your devices</span><ArrowUpRight /></Link>
          <button className={styles.navItem} onClick={() => setModal("settings")}><Settings2 /><span>Settings</span></button>
          <div className={styles.serverCard}><span><HardDrive /> Your space. Your server.</span><p>{formatBytes(fileBytes)} in files <span>·</span> {counts.all} items</p><small><ShieldCheck /> Privately stored</small></div>
          <button className={styles.profile} onClick={() => setModal("settings")} aria-label="Workspace settings"><span className={styles.avatar}>{(username || "P")[0].toUpperCase()}</span><span>{username || "Personal workspace"}<small>Make yourself at home</small></span><Settings2 /></button>
        </div>
      </aside>

      <div className={styles.canvas}>
        <header className={styles.topbar}>
          <button className={styles.mobileLogo} onClick={() => navigate("all")} aria-label="9t home"><img src="/9t-mark.svg" alt="9t" /></button>
          <div className={styles.breadcrumb}><LayoutGrid /><span>Personal</span><ChevronRight /><b>{title}</b></div>
          <label className={styles.search}>
            <Search /><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your workspace…" aria-label="Search items" />
            {query ? <button className={styles.searchClear} onClick={() => setQuery("")} aria-label="Clear search"><X /></button> : <kbd>/</kbd>}
          </label>
          <div className={styles.actions}>
            <button className={styles.iconBtn} aria-label="Commands (Ctrl K)" title="Commands · Ctrl K" onClick={() => setModal("commands")}><Command /></button>
            <button className={styles.iconBtn} aria-label="Toggle theme" title="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{resolvedTheme === "dark" ? <Sun /> : <Moon />}</button>
          </div>
        </header>

        <main className={styles.main}>
          <div className={styles.hero}>
            <div><div className={styles.eyebrow}>{home ? "A PLACE FOR YOUR EVERYDAY" : "YOUR PERSONAL SPACE"}</div><h1>{query ? "Find your things" : title}<span className={styles.titleDot}>.</span></h1><p>{query ? `Results for “${query}”` : home ? "A little less scattered. A little more together." : pinnedOnly ? "The things you reach for, always within reach." : view === "trash" ? `Deleted items stay here for ${config?.trashRetentionDays ?? 7} days.` : view === "shares" ? "A handoff to someone else. Still in your control." : view === "board" ? "A space to arrange your thoughts. Make it yours." : "Everything you saved, right where you left it."}</p></div>
            <button className={styles.addBtn} onClick={() => setModal(activeModules ? "create" : "settings")}><Plus />{activeModules ? "New item" : "Enable modules"}<kbd>N</kbd></button>
          </div>

          {home && config && <QuickAdd config={config} saved={async () => { await loadObjects(view); }} notify={flash} />}

          {home && pinned.length > 0 && !loadingObjects && <section className={styles.pinnedSection} aria-label="Pinned items"><div className={styles.sectionHead}><h2><Pin />Within reach<span className={styles.count}>{pinned.length}</span></h2><button className={styles.textButton} onClick={() => navigate("all", true)}>View pinned <ArrowUpRight /></button></div><PinnedItems objects={pinned} open={setSelected} /></section>}

          <nav className={styles.mobileTabs} aria-label="Filter items">{tabs.filter((t) => t.show).map((t) => <button key={t.id} aria-pressed={view === t.id && !pinnedOnly} onClick={() => navigate(t.id)}>{t.label}{typeof t.count === "number" && <small>{t.count}</small>}</button>)}<button aria-pressed={view === "trash"} onClick={() => navigate("trash")}><Trash2 />Trash</button></nav>

          <section className={styles.collectionSection} aria-label="Your items">
            <div className={styles.sectionHead}><h2 id="collection" tabIndex={-1}>{query ? "Search results" : home ? "All items" : title}<span className={styles.count}>{view === "shares" ? shares.length : visible.length}</span></h2><div className={styles.controls}>{view !== "shares" && view !== "board" && <><label className={styles.sort}><ArrowDownUp /><select aria-label="Sort items" value={sort} onChange={(e) => setSort(e.target.value as "recent" | "name")}><option value="recent">Last updated</option><option value="name">Name A–Z</option></select></label><div className={styles.layoutSwitch} role="group" aria-label="Layout"><button aria-label="List view" aria-pressed={layout === "list"} onClick={() => changeLayout("list")}><List /></button><button aria-label="Grid view" aria-pressed={layout === "grid"} onClick={() => changeLayout("grid")}><LayoutGrid /></button></div></>}</div></div>
            {collection}
          </section>

          <footer className={styles.footer}><span><ShieldCheck />A small corner of the internet, just for you.</span><button onClick={() => setModal("commands")}>Keyboard shortcuts <kbd>⌘ K</kbd></button></footer>
        </main>
      </div>

      <nav className={styles.dock} aria-label="Mobile navigation">
        <button data-active={view === "all" && !pinnedOnly} onClick={() => navigate("all")}><LayoutGrid /><span>Workspace</span></button>
        <button data-active={pinnedOnly} onClick={() => navigate("all", true)}><Pin /><span>Pinned</span></button>
        <button className={styles.dockAdd} aria-label="New item" onClick={() => setModal(activeModules ? "create" : "settings")}><Plus /></button>
        <button data-active={view === "shares"} onClick={() => navigate("shares")}><Share2 /><span>Shared</span></button>
        <button onClick={() => setModal("settings")}><Settings2 /><span>Settings</span></button>
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
