"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Clock3,
  Copy,
  File,
  Infinity as InfinityIcon,
  Monitor,
  LogOut,
  Moon,
  Pin,
  Plus,
  Share2,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  ObjectType,
  Theme,
  WorkspaceConfig as Config,
  WorkspaceObject as Obj,
} from "../../types/workspace";
import {
  ApiError,
  formatBytes as bytes,
  workspaceApi as api,
} from "../../lib/client/workspace";
import { expiryFromLifetime } from "../../lib/shared/lifetimes";
import styles from "./Dialogs.module.css";

function useDialogFocus(
  ref: React.RefObject<HTMLElement | null>,
  close: () => void,
) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    if (!node) return;
    const focusables = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea, select, a[href], [tabindex="0"]',
        ),
      ).filter((el) => el.getClientRects().length > 0);
    (focusables()[0] || node).focus();
    const key = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      const dialog = node.closest('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const items = focusables(),
          first = items[0],
          last = items[items.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key, true);
      document.body.style.overflow = oldOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [ref]);
}

function Qr({ path, label }: { path: string; label: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(new URL(path, location.origin).toString(), {
      width: 220,
      margin: 1,
      color: { dark: "#17202d", light: "#ffffff" },
    })
      .then((url) => {
        if (live) setSrc(url);
      })
      .catch(() => {
        /* The link remains available if QR generation fails. */
      });
    return () => {
      live = false;
    };
  }, [path]);
  return src ? (
    <div className="qr">
      <img src={src} alt={`QR code for ${label}`} width={170} height={170} />
      <span>Scan to open on another device</span>
    </div>
  ) : null;
}

function Modal({
  title,
  code,
  close,
  children,
}: {
  title: string;
  code: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  useDialogFocus(panelRef, close);
  return (
    <div
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) close();
      }}
    >
      <section className={styles.modal} ref={panelRef}>
        <header className={styles.head}>
          <span className={styles.headCode}>{code}</span>
          <h2>{title}</h2>
          <button className={styles.close} onClick={close} aria-label="Close">
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function Inspector({
  object,
  close,
  save,
  share,
  pin,
  remove,
}: {
  object: Obj;
  close: () => void;
  save: (body: Record<string, unknown>) => void | Promise<void>;
  share: () => void;
  pin: () => void;
  remove: () => void;
}) {
  const [name, setName] = useState(object.name);
  const [content, setContent] = useState(object.content || "");
  const [url, setUrl] = useState(object.url || "");
  const [lifetime, setLifetime] = useState(
    object.expiresAt ? "keep" : "forever",
  );
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useDialogFocus(panelRef, close);

  const expiry =
    lifetime === "keep"
      ? undefined // keep current — omit from patch
      : lifetime === "forever"
        ? null
        : expiryFromLifetime(lifetime);

  return (
    <div
      className={styles.inspScrim}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        className={styles.insp}
        role="dialog"
        aria-modal="true"
        aria-label={object.name}
      >
        <header className={styles.inspHead}>
          <span>
            {object.type} · {object.id.slice(0, 8)}
          </span>
          <button className={styles.close} onClick={close} aria-label="Close inspector">
            <X />
          </button>
        </header>
        <div className={styles.type}>
          {object.type} ● stuck
        </div>
        <label className={styles.field}>
          NAME
          <input
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {object.type === "snippet" && (
          <label className={styles.field}>
            CONTENT
            <textarea
              rows={15}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
        )}
        {object.type === "link" && (
          <label className={styles.field}>
            URL
            <input
              value={url}
              inputMode="url"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
        )}
        {object.type === "file" && (
          <div className="file-readout">
            <File aria-hidden="true" />
            <span>
              <b>{object.mimeType}</b>
              <small>{bytes(object.sizeBytes)} · Stored locally</small>
            </span>
            <a href={`/api/files/${object.id}`}>
              <ArrowDownToLine aria-hidden="true" />
              Download
            </a>
          </div>
        )}
        <label className={styles.field}>
          LIFETIME
          <select
            value={lifetime}
            onChange={(e) => setLifetime(e.target.value)}
          >
            <option value="keep">Keep current</option>
            <option value="forever">Permanent</option>
            <option value="1h">1 hour from now</option>
            <option value="1d">1 day from now</option>
            <option value="7d">7 days from now</option>
          </select>
        </label>
        <div className={styles.meta}>
          <div>
            <span>CREATED</span> <b>{new Date(object.createdAt).toLocaleString()}</b>
          </div>
          <div>
            <span>LIFETIME</span>{" "}
            <b>
              {object.expiresAt
                ? new Date(object.expiresAt).toLocaleString()
                : "PERMANENT"}
            </b>
          </div>
        </div>
        <div className={styles.actionsGrid}>
          <a href={`/o/${object.id}`} target="_blank" rel="noreferrer">
            <ArrowUpRight aria-hidden="true" />
            OPEN
          </a>
          <button onClick={pin}>
            <Pin aria-hidden="true" />
            {object.pinned ? "UNPIN" : "PIN"}
          </button>
          <button onClick={share}>
            <Share2 aria-hidden="true" />
            BEAM
          </button>
          <button className="destructive" onClick={remove}>
            <Trash2 aria-hidden="true" />
            TRASH
          </button>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <details className="device-handoff">
          <summary>Beam to another device</summary>
          <Qr path={`/o/${object.id}`} label={object.name} />
          <p>Sign in on the other device, then scan. Gone in seconds.</p>
        </details>
        <button
          className={styles.primary}
          disabled={saving || !name.trim()}
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              const body: Record<string, unknown> = { name: name.trim() };
              if (expiry !== undefined) body.expiresAt = expiry;
              if (object.type === "snippet") body.content = content;
              if (object.type === "link") body.url = url;
              await save(body);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Couldn’t save changes.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Sticking…" : "Stick changes"}{" "}
          <ArrowUpRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function CreateDialog({
  config,
  close,
  saved,
}: {
  config: Config;
  close: () => void;
  saved: () => void;
}) {
  const types = Object.entries(config.modules)
    .filter(([key, value]) => value && key !== "board")
    .map(([key]) => key.slice(0, -1)) as ObjectType[];
  const [type, setType] = useState<ObjectType>(types[0] || "snippet");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/objects", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      saved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add item.");
      setBusy(false);
    }
  };

  return (
    <Modal title="Stick something" code="NEW STICK" close={close}>
      <div className={styles.modeRow} role="tablist" aria-label="Item type">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={type === t}
            data-on={type === t}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <form className={styles.form} onSubmit={submit}>
        <input type="hidden" name="type" value={type} />
        <label>
          NAME
          <input
            name="name"
            required
            autoFocus
            maxLength={200}
            placeholder="Something you will recognize"
          />
        </label>
        {type === "snippet" && (
          <>
            <label>
              LANGUAGE
              <select name="language">
                <option>text</option>
                <option>javascript</option>
                <option>typescript</option>
                <option>python</option>
                <option>bash</option>
                <option>json</option>
                <option>css</option>
                <option>sql</option>
              </select>
            </label>
            <label>
              CONTENT
              <textarea
                name="content"
                rows={9}
                required
                placeholder="Paste code, a command, note, or configuration…"
              />
            </label>
          </>
        )}
        {type === "link" && (
          <label>
            URL
            <input name="url" type="url" required placeholder="https://" />
          </label>
        )}
        {type === "file" && (
          <label className="file-drop">
            <Upload aria-hidden="true" />
            <b>Choose a file</b>
            <span>Up to {config.maxSizeMb} MB</span>
            <input
              name="file"
              type="file"
              required
              aria-label="Choose a file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                const nameInput = e.currentTarget.form?.elements.namedItem(
                  "name",
                ) as HTMLInputElement | null;
                if (file && nameInput && !nameInput.value)
                  nameInput.value = file.name;
              }}
            />
          </label>
        )}
        <label>
          KEEP FOR
          <select name="lifetime" defaultValue="forever">
            <option value="forever">Forever</option>
            <option value="1h">1 hour</option>
            <option value="1d">1 day</option>
            <option value="7d">7 days</option>
          </select>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="transmit" disabled={busy}>
          <Plus aria-hidden="true" />
          {busy ? "Adding…" : "Add item"}
        </button>
      </form>
    </Modal>
  );
}

export function ShareDialog({
  object,
  close,
  created,
}: {
  object: Obj;
  close: () => void;
  created: (path: string) => void;
}) {
  const [life, setLife] = useState("1d");
  const [password, setPassword] = useState("");
  const [path, setPath] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <Modal title="Share this item" code="PUBLIC LINK" close={close}>
      {path ? (
        <div className="share-ready">
          <Qr path={path} label={object.name} />
          <code>{location.origin + path}</code>
          <button
            className="transmit"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(location.origin + path);
                setCopied(true);
                setError("");
              } catch {
                setError(
                  "Couldn’t copy automatically. Select and copy the link above.",
                );
              }
            }}
          >
            <Copy aria-hidden="true" />
            {copied ? "Link copied" : "Copy link"}
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="share-object">
            <Share2 aria-hidden="true" />
            <span>
              <small>ITEM</small>
              <b>{object.name}</b>
            </span>
          </div>
          <div
            className="lifetime-grid"
            role="group"
            aria-label="Link lifetime"
          >
            {[
              ["1h", "1 HOUR"],
              ["1d", "1 DAY"],
              ["7d", "7 DAYS"],
              ["30d", "30 DAYS"],
              ["forever", "NO EXPIRY"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={life === value}
                className={life === value ? "active" : ""}
                onClick={() => setLife(value)}
              >
                {value === "forever" ? (
                  <InfinityIcon aria-hidden="true" />
                ) : (
                  <Clock3 aria-hidden="true" />
                )}
                {label}
              </button>
            ))}
          </div>
          <p className="share-warning">
            <ShieldCheck aria-hidden="true" />
            Anyone with the link can open this item until it expires. The rest
            of your workspace stays private.
          </p>
          <label className="share-password">
            PASSWORD (OPTIONAL, 8+ CHARACTERS)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Optional (8+ characters)"
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p className="form-error share-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="transmit"
            disabled={busy || (password.length > 0 && password.length < 8)}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const data = await api("/api/shares", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    objectId: object.id,
                    lifetime: life,
                    password: password || undefined,
                  }),
                });
                setPath(data.path);
                created(data.path);
              } catch (err) {
                setError(
                  err instanceof ApiError
                    ? err.message
                    : "Couldn't create link.",
                );
                setBusy(false);
              }
            }}
          >
            <Copy aria-hidden="true" />
            {busy ? "Creating…" : "Create link"}
          </button>
        </>
      )}
    </Modal>
  );
}

export function SettingsDialog({
  signOut,
  config,
  close,
  saved,
}: {
  config: Config;
  close: () => void;
  saved: () => void;
  signOut: () => void;
}) {
  const [modules, setModules] = useState(config.modules);
  const [max, setMax] = useState(config.maxSizeMb);
  const [theme, setTheme] = useState<Theme>(config.theme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const themes = [
    { id: "system" as Theme, label: "System", icon: <Monitor /> },
    { id: "light" as Theme, label: "Light", icon: <Sun /> },
    { id: "dark" as Theme, label: "Dark", icon: <Moon /> },
  ];

  return (
    <Modal title="Settings" code="9T / SETTINGS" close={close}>
      <div className="theme-picker">
        <span>APPEARANCE</span>
        <div role="group" aria-label="Appearance">
          {themes.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={theme === item.id}
              className={theme === item.id ? "active" : ""}
              onClick={() => setTheme(item.id)}
            >
              {item.icon}
              <b>{item.label}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section-heading">
        <h3>Your modules</h3>
        <p>Keep what you use. Hide what you don’t.</p>
      </div>
      <div className="settings-grid">
        {Object.entries(modules).map(([key, value]) => (
          <button
            key={key}
            type="button"
            aria-pressed={!!value}
            className={value ? "active" : ""}
            onClick={() =>
              setModules((current) => ({ ...current, [key]: !value }))
            }
          >
            <small>
              {key === "files"
                ? "Move between devices"
                : key === "snippets"
                  ? "Keep text and code"
                  : key === "links"
                    ? "Save a destination"
                    : "Arrange your items"}
            </small>
            <b>{key}</b>
            <span>{value ? "ON" : "OFF"}</span>
          </button>
        ))}
      </div>
      <div className="settings-line">
        <label>
          MAXIMUM FILE SIZE
          <input
            type="number"
            value={max}
            min={1}
            max={2048}
            onChange={(e) => setMax(+e.target.value)}
          />
          <span>MB</span>
        </label>
        <div>
          <small>ACCESS</small>
          <b>{config.exposure.toUpperCase()}</b>
        </div>
        <div>
          <small>AUTH</small>
          <b>ON</b>
        </div>
      </div>
      {error && (
        <p className="form-error settings-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="transmit"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api("/api/config", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ modules, maxSizeMb: max, theme }),
            });
            saved();
          } catch (err) {
            setError(
              err instanceof ApiError ? err.message : "Couldn't save settings.",
            );
            setBusy(false);
          }
        }}
      >
        <Check aria-hidden="true" />
        {busy ? "Saving…" : "Save settings"}
      </button>
      <button className="signout-button" onClick={signOut}>
        <LogOut /> Sign out of this device
      </button>
      <a
        href="/devices"
        className="secondary-button"
        style={{
          display: "block",
          marginTop: 12,
          textAlign: "center",
          padding: 12,
        }}
      >
        Android devices &amp; pairing
      </a>
    </Modal>
  );
}

export function CommandsDialog({
  config,
  close,
  run,
}: {
  close: () => void;
  run: (action: string) => void;
  config: Config;
}) {
  const [filter, setFilter] = useState("");
  const commands: Array<[string, string, string]> = [
    ["create", "Add an item", "N"],
    ["all", "Open everything", "0"],
    ["snippet", "Snippets only", "1"],
    ["file", "Files only", "2"],
    ["link", "Links only", "3"],
    ["board", "Open Board", "B"],
    ["shares", "View shared links", "H"],
    ["trash", "Open Trash", "R"],
    ["settings", "Open settings", "S"],
  ];
  const visible = commands.filter(([action, label]) => {
    if (
      (action === "snippet" && !config.modules.snippets) ||
      (action === "file" && !config.modules.files) ||
      (action === "link" && !config.modules.links) ||
      (action === "board" && !config.modules.board)
    )
      return false;
    if (
      action === "create" &&
      !config.modules.snippets &&
      !config.modules.files &&
      !config.modules.links
    )
      return false;
    return label.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <Modal title="Commands" code="9T / GO" close={close}>
      <div className="command-search">
        <input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Type to filter…"
          aria-label="Filter commands"
        />
      </div>
      <div className="command-list" aria-label="Commands">
        {visible.map(([action, label, key], index) => (
          <button
            key={action}
            autoFocus={index === 0 && !filter}
            onClick={() => run(action)}
          >
            <small>{(index + 1).toString().padStart(2, "0")}</small>
            <span>{label}</span>
            <kbd>{key}</kbd>
          </button>
        ))}
        {!visible.length && <p className="command-empty">No commands match.</p>}
      </div>
    </Modal>
  );
}
