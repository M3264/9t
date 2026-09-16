"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brand as Logo, LoadingScreen as Boot } from "../ui/Brand";
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
  ArrowUpRight,
  Check,
  LogOut,
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
import { workspaceApi as api } from "../../lib/client/workspace";

export default function Workspace() {
  const [phase, setPhase] = useState<"loading" | "setup" | "login" | "desk">(
    "loading",
  );
  const [config, setConfig] = useState<Config | null>(null),
    [username, setUsername] = useState(""),
    [objects, setObjects] = useState<Obj[]>([]),
    [shares, setShares] = useState<Share[]>([]);
  const [view, setView] = useState<View>("all"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Obj | null>(null),
    [modal, setModal] = useState<
      null | "create" | "share" | "settings" | "commands"
    >(null),
    [toast, setToast] = useState("");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const searchRef = useRef<HTMLInputElement>(null);
  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };
  const refresh = useCallback(async () => {
    const s = await api("/api/status");
    setConfig(s.config);
    setUsername(s.username || "");
    if (!s.initialized) return setPhase("setup");
    if (!s.authenticated) return setPhase("login");
    setPhase("desk");
    const [items, links] = await Promise.all([
      api(`/api/objects${view === "trash" ? "?trash=true" : ""}`),
      api("/api/shares"),
    ]);
    setObjects(items.objects);
    setShares(links.shares);
  }, [view]);
  useEffect(() => {
    refresh().catch(() => setPhase("login"));
  }, [refresh]);
  useEffect(() => {
    if (!config) return;
    const media = matchMedia("(prefers-color-scheme: dark)"),
      apply = () => {
        const resolved =
          config.theme === "system"
            ? media.matches
              ? "dark"
              : "light"
            : config.theme;
        document.documentElement.dataset.theme = resolved;
        setResolvedTheme(resolved);
        localStorage.setItem("9t-theme", config.theme);
      };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [config]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setModal("commands");
      } else if (e.key === "/" && !modal) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (
        e.key.toLowerCase() === "n" &&
        !modal &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
      )
        setModal("create");
    };
    addEventListener("keydown", keys);
    return () => removeEventListener("keydown", keys);
  }, [modal]);
  const visible = useMemo(
    () =>
      objects
        .filter(
          (o) =>
            (view === "all" ||
              view === "board" ||
              view === "trash" ||
              o.type === view) &&
            (o.name + " " + (o.content || "") + " " + (o.url || ""))
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            +new Date(b.updatedAt) - +new Date(a.updatedAt),
        ),
    [objects, view, query],
  );
  const patch = async (o: Obj, body: Record<string, unknown>) => {
    await api(`/api/objects/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setObjects((items) =>
      items.map((x) =>
        x.id === o.id
          ? { ...x, ...body, updatedAt: new Date().toISOString() }
          : x,
      ),
    );
    setSelected((s) => (s?.id === o.id ? { ...s, ...body } : s));
  };
  const remove = async (o: Obj, permanent = false) => {
    await api(`/api/objects/${o.id}${permanent ? "?permanent=true" : ""}`, {
      method: "DELETE",
    });
    setObjects((items) => items.filter((x) => x.id !== o.id));
    setSelected(null);
    flash(permanent ? "Item deleted" : "Moved to Trash");
  };
  const setTheme = async (theme: Theme) => {
    await api("/api/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    });
    setConfig((c) => (c ? { ...c, theme } : c));
  };
  if (phase === "loading") return <Boot />;
  if (phase === "setup") return <Setup done={refresh} />;
  if (phase === "login") return <Login done={refresh} />;
  return (
    <div className="desk">
      <header className="mast">
        <Logo />
        <nav className="primary-nav" aria-label="Workspace">
          <button
            className={view === "all" ? "active" : ""}
            onClick={() => setView("all")}
          >
            Home
          </button>
          {config?.modules.snippets && (
            <button
              className={view === "snippet" ? "active" : ""}
              onClick={() => setView("snippet")}
            >
              Snippets
            </button>
          )}
          {config?.modules.files && (
            <button
              className={view === "file" ? "active" : ""}
              onClick={() => setView("file")}
            >
              Files
            </button>
          )}
          {config?.modules.links && (
            <button
              className={view === "link" ? "active" : ""}
              onClick={() => setView("link")}
            >
              Links
            </button>
          )}
          {config?.modules.board && (
            <button
              className={view === "board" ? "active" : ""}
              onClick={() => setView("board")}
            >
              Board
            </button>
          )}
        </nav>
        <div className="identity">
          <button
            title="Search and commands"
            onClick={() => setModal("commands")}
          >
            <Search />
          </button>
          <button
            title="Toggle theme"
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
          </button>
          <button title="Settings" onClick={() => setModal("settings")}>
            <Settings />
          </button>
          <button
            title="Sign out"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              setPhase("login");
            }}
          >
            <LogOut />
          </button>
        </div>
      </header>
      <main className="desk-body">
        <section className="signal-workspace">
          {view === "all" && (
            <>
              <div className="welcome">
                <small>{username}&apos;s private space</small>
                <h1>
                  Put it here.
                  <br />
                  <span>Get it anywhere.</span>
                </h1>
                <p>
                  Text, links, and files—one quiet place that belongs to you.
                </p>
              </div>
              <QuickAdd
                saved={async () => {
                  await refresh();
                  flash("Added to 9t");
                }}
              />
              {objects.some((o) => o.pinned) && (
                <div className="pinned-row">
                  <span>Pinned</span>
                  {objects
                    .filter((o) => o.pinned)
                    .slice(0, 5)
                    .map((o) => (
                      <button key={o.id} onClick={() => setSelected(o)}>
                        {o.name}
                        <ArrowUpRight />
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
          <div className="collection-head">
            <div>
              <h2>
                {view === "all"
                  ? "Recently added"
                  : view === "shares"
                    ? "Shared links"
                    : view === "trash"
                      ? "Trash"
                      : view[0].toUpperCase() + view.slice(1)}
              </h2>
              <span>
                {view === "shares" ? shares.length : visible.length}{" "}
                {view === "shares" ? "links" : "items"}
              </span>
            </div>
            <label className="inline-search">
              <Search />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
              />
              <kbd>/</kbd>
            </label>
            <div className="collection-actions">
              <button
                className={view === "shares" ? "active" : ""}
                onClick={() => setView("shares")}
              >
                <Share2 />
                <span>Shares</span>
              </button>
              <button
                className={view === "trash" ? "active" : ""}
                onClick={() => setView("trash")}
              >
                <Trash2 />
                <span>Trash</span>
              </button>
              <button className="add-button" onClick={() => setModal("create")}>
                <Plus />
                <span>Add</span>
              </button>
            </div>
          </div>
          {view === "board" ? (
            <Board objects={visible} move={patch} open={setSelected} />
          ) : view === "shares" ? (
            <ShareLog
              shares={shares}
              revoke={async (s) => {
                await api(`/api/shares/${s.id}`, { method: "DELETE" });
                setShares((x) => x.filter((v) => v.id !== s.id));
                flash("Share revoked");
              }}
            />
          ) : (
            <Stream
              objects={visible}
              trash={view === "trash"}
              open={setSelected}
              patch={patch}
              remove={remove}
              restore={async (o) => {
                await patch(o, { restore: true });
                setObjects((x) => x.filter((v) => v.id !== o.id));
                flash("Item restored");
              }}
            />
          )}
        </section>
      </main>
      {selected && (
        <Inspector
          key={selected.id}
          object={selected}
          close={() => setSelected(null)}
          save={async (body) => {
            await patch(selected, body);
            flash("Item updated");
          }}
          share={() => setModal("share")}
          pin={() => patch(selected, { pinned: !selected.pinned })}
          remove={() => remove(selected)}
        />
      )}
      {modal === "create" && (
        <Create
          config={config!}
          close={() => setModal(null)}
          saved={async () => {
            setModal(null);
            await refresh();
            flash("Item added");
          }}
        />
      )}
      {modal === "share" && selected && (
        <ShareModal
          object={selected}
          close={() => setModal(null)}
          created={async () => {
            await refresh();
            flash("Share link ready");
          }}
        />
      )}
      {modal === "settings" && (
        <SettingsPanel
          config={config!}
          close={() => setModal(null)}
          saved={async () => {
            setModal(null);
            await refresh();
            flash("Settings saved");
          }}
        />
      )}
      {modal === "commands" && (
        <Commands
          close={() => setModal(null)}
          run={(action) => {
            setModal(null);
            if (action === "create") setModal("create");
            else if (action === "settings") setModal("settings");
            else setView(action as View);
          }}
        />
      )}
      {toast && (
        <div className="toast">
          <Check />
          {toast}
        </div>
      )}
    </div>
  );
}
