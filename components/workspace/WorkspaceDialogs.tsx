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
  formatBytes as bytes,
  workspaceApi as api,
} from "../../lib/client/workspace";

function Qr({ path, label }: { path: string; label: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(new URL(path, location.origin).toString(), {
      width: 220,
      margin: 1,
      color: { dark: "#17202d", light: "#ffffff" },
    }).then(setSrc);
  }, [path]);
  return src ? (
    <div className="qr">
      <img src={src} alt={`QR code for ${label}`} />
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
  return (
    <div
      className="modal-field"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <section className="terminal-modal">
        <header>
          <span>{code}</span>
          <h2>{title}</h2>
          <button onClick={close}>
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
  save: (body: Record<string, unknown>) => void;
  share: () => void;
  pin: () => void;
  remove: () => void;
}) {
  const [name, setName] = useState(object.name),
    [content, setContent] = useState(object.content || ""),
    [url, setUrl] = useState(object.url || ""),
    [lifetime, setLifetime] = useState(object.expiresAt ? "keep" : "forever");
  const expiry =
    lifetime === "keep"
      ? object.expiresAt
      : lifetime === "forever"
        ? null
        : new Date(
            Date.now() +
              ({ "1h": 36e5, "1d": 864e5, "7d": 6048e5 }[lifetime] || 0),
          ).toISOString();
  return (
    <div className="inspector">
      <header>
        <span>
          {object.type} · {object.id.slice(0, 8)}
        </span>
        <button onClick={close}>
          <X />
        </button>
      </header>
      <div className={`inspector-type ${object.type}`}>
        {object.type}
        <i />
      </div>
      <label>
        NAME
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {object.type === "snippet" && (
        <label>
          CONTENT
          <textarea
            rows={15}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
      )}
      {object.type === "link" && (
        <label>
          URL
          <input value={url} onChange={(event) => setUrl(event.target.value)} />
        </label>
      )}
      {object.type === "file" && (
        <div className="file-readout">
          <File />
          <span>
            <b>{object.mimeType}</b>
            <small>{bytes(object.sizeBytes)} · Stored locally</small>
          </span>
          <a href={`/api/files/${object.id}`}>
            <ArrowDownToLine />
            Download
          </a>
        </div>
      )}
      <label>
        LIFETIME
        <select
          value={lifetime}
          onChange={(event) => setLifetime(event.target.value)}
        >
          <option value="keep">Keep current</option>
          <option value="forever">Permanent</option>
          <option value="1h">1 hour from now</option>
          <option value="1d">1 day from now</option>
          <option value="7d">7 days from now</option>
        </select>
      </label>
      <div className="inspect-meta">
        <span>
          CREATED <b>{new Date(object.createdAt).toLocaleString()}</b>
        </span>
        <span>
          LIFETIME{" "}
          <b>
            {object.expiresAt
              ? new Date(object.expiresAt).toLocaleString()
              : "PERMANENT"}
          </b>
        </span>
      </div>
      <div className="inspect-actions">
        <a href={`/o/${object.id}`} target="_blank" rel="noreferrer">
          <ArrowUpRight />
          OPEN
        </a>
        <button onClick={pin}>
          <Pin />
          {object.pinned ? "UNPIN" : "PIN"}
        </button>
        <button onClick={share}>
          <Share2 />
          SHARE
        </button>
        <button className="destructive" onClick={remove}>
          <Trash2 />
          TRASH
        </button>
      </div>
      <button
        className="save-signal"
        onClick={() =>
          save({
            name,
            expiresAt: expiry,
            ...(object.type === "snippet" ? { content } : {}),
            ...(object.type === "link" ? { url } : {}),
          })
        }
      >
        Save changes <ArrowUpRight />
      </button>
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
      .map(([key]) => key.slice(0, -1)) as ObjectType[],
    [type, setType] = useState<ObjectType>(types[0] || "snippet"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/objects", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      saved();
    } catch (value) {
      setError((value as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Add to 9t" code="NEW ITEM" close={close}>
      <div className="mode-switch">
        {types.map((t) => (
          <button
            type="button"
            className={type === t ? "active" : ""}
            onClick={() => setType(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      <form className="signal-form" onSubmit={submit}>
        <input type="hidden" name="type" value={type} />
        <label>
          NAME
          <input
            name="name"
            required
            autoFocus
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
            <Upload />
            <b>Choose a file</b>
            <span>Up to {config.maxSizeMb} MB</span>
            <input
              name="file"
              type="file"
              required
              onChange={(event) => {
                const file = event.target.files?.[0],
                  name = event.currentTarget.form?.elements.namedItem(
                    "name",
                  ) as HTMLInputElement;
                if (file && !name.value) name.value = file.name;
              }}
            />
          </label>
        )}
        <label>
          KEEP FOR
          <select name="lifetime">
            <option value="forever">Forever</option>
            <option value="1h">1 hour</option>
            <option value="1d">1 day</option>
            <option value="7d">7 days</option>
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="transmit" disabled={busy}>
          <Plus />
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
  const [life, setLife] = useState("1d"),
    [password, setPassword] = useState(""),
    [path, setPath] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Share this item" code="PUBLIC LINK" close={close}>
      {path ? (
        <div className="share-ready">
          <Qr path={path} label={object.name} />
          <code>{location.origin + path}</code>
          <button
            className="transmit"
            onClick={async () => {
              await navigator.clipboard.writeText(location.origin + path);
              created(path);
            }}
          >
            <Copy />
            Copy link
          </button>
        </div>
      ) : (
        <>
          <div className="share-object">
            <Share2 />
            <span>
              <small>ITEM</small>
              <b>{object.name}</b>
            </span>
          </div>
          <div className="lifetime-grid">
            {[
              ["1h", "1 HOUR"],
              ["1d", "1 DAY"],
              ["7d", "7 DAYS"],
              ["30d", "30 DAYS"],
              ["forever", "NO EXPIRY"],
            ].map(([value, label]) => (
              <button
                className={life === value ? "active" : ""}
                onClick={() => setLife(value)}
                key={value}
              >
                {value === "forever" ? <InfinityIcon /> : <Clock3 />}
                {label}
              </button>
            ))}
          </div>
          <p className="share-warning">
            <ShieldCheck />
            Anyone with the link can open this item until it expires. The rest
            of your workspace stays private.
          </p>
          <label className="share-password">
            PASSWORD
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Optional (6+ characters)"
              minLength={6}
            />
          </label>
          <button
            className="transmit"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
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
              setBusy(false);
              created(data.path);
            }}
          >
            <Copy />
            {busy ? "Creating…" : "Create link"}
          </button>
        </>
      )}
    </Modal>
  );
}

export function SettingsDialog({
  config,
  close,
  saved,
}: {
  config: Config;
  close: () => void;
  saved: () => void;
}) {
  const [modules, setModules] = useState(config.modules),
    [max, setMax] = useState(config.maxSizeMb),
    [theme, setTheme] = useState<Theme>(config.theme),
    themes = [
      { id: "system" as Theme, label: "System", icon: <Monitor /> },
      { id: "light" as Theme, label: "Light", icon: <Sun /> },
      { id: "dark" as Theme, label: "Dark", icon: <Moon /> },
    ];
  return (
    <Modal title="Settings" code="9T / SETTINGS" close={close}>
      <div className="theme-picker">
        <span>APPEARANCE</span>
        <div>
          {themes.map((item) => (
            <button
              className={theme === item.id ? "active" : ""}
              onClick={() => setTheme(item.id)}
              key={item.id}
            >
              {item.icon}
              <b>{item.label}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-grid">
        {Object.entries(modules).map(([key, value]) => (
          <button
            className={value ? "active" : ""}
            onClick={() =>
              setModules((current) => ({ ...current, [key]: !value }))
            }
            key={key}
          >
            <small>MODULE</small>
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
            min="1"
            onChange={(event) => setMax(+event.target.value)}
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
      <button
        className="transmit"
        onClick={async () => {
          await api("/api/config", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modules, maxSizeMb: max, theme }),
          });
          saved();
        }}
      >
        <Check />
        Save settings
      </button>
    </Modal>
  );
}

export function CommandsDialog({
  close,
  run,
}: {
  close: () => void;
  run: (action: string) => void;
}) {
  const commands = [
    ["create", "Add an item", "N"],
    ["all", "Open everything", "0"],
    ["board", "Open Board", "B"],
    ["shares", "View shared links", "H"],
    ["trash", "Open Trash", "R"],
    ["settings", "Open settings", "S"],
  ];
  return (
    <Modal title="Commands" code="9T / GO" close={close}>
      <div className="command-list">
        {commands.map(([action, label, key], index) => (
          <button
            autoFocus={index === 0}
            onClick={() => run(action)}
            key={action}
          >
            <small>{(index + 1).toString().padStart(2, "0")}</small>
            <span>{label}</span>
            <kbd>{key}</kbd>
          </button>
        ))}
      </div>
    </Modal>
  );
}
