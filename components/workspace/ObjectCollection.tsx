"use client";

import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Download,
  FolderOpen,
  Search,
  RotateCcw,
  Globe,
  Code2,
  Copy,
  FileText,
  Link2,
  Move,
  PanelRight,
  Pin,
  Trash2,
  X,
} from "lucide-react";
import type {
  WorkspaceObject as Obj,
  WorkspaceShare as Share,
} from "../../types/workspace";
import {
  formatBytes as bytes,
  timeAgo as ago,
  timeUntil as until,
} from "../../lib/client/workspace";
import styles from "./Cards.module.css";

const iconFor = { snippet: Code2, file: FileText, link: Link2 };

function previewOf(o: Obj): string {
  if (o.type === "snippet") return (o.content || "empty snippet").slice(0, 140);
  if (o.type === "link") return o.url || "";
  return `${o.mimeType || "file"} · ${bytes(o.sizeBytes)}`;
}

export function ObjectList({
  objects,
  trash,
  open,
  patch,
  remove,
  restore,
  layout,
  searching,
  create,
  notify,
}: {
  objects: Obj[];
  trash: boolean;
  open: (o: Obj) => void;
  patch: (o: Obj, b: Record<string, unknown>) => void;
  remove: (o: Obj, p?: boolean) => void;
  restore: (o: Obj) => void;
  layout: "grid" | "list";
  searching: boolean;
  create: () => void;
  notify: (message: string) => void;
}) {
  if (!objects.length)
    return (
      <div className={styles.zero}>
        <div className={styles.zeroBadge}>
          {searching ? <Search /> : trash ? <Trash2 /> : <FolderOpen />}
        </div>
        <h2>
          {searching
            ? "Nothing found."
            : trash
              ? "All clear."
              : "A little space for everything."}
        </h2>
        <p>
          {searching
            ? "Try a different name, a word from a snippet, or a link."
            : trash
              ? "Items you delete will appear here."
              : "Save a file, snippet or link. Find it here whenever you need it."}
        </p>
        {!trash && !searching && (
          <button className={styles.zeroCta} onClick={create}>
            Add your first item <ArrowUpRight />
          </button>
        )}
      </div>
    );
  return (
    <ul className={`${styles.grid} ${layout === "list" ? styles.list : ""}`}>
      {objects.map((o) => {
        const Icon = iconFor[o.type];
        const extension = o.name.includes(".")
          ? o.name.split(".").pop()!.slice(0, 5).toUpperCase()
          : "FILE";
        let domain = "Saved link";
        try {
          domain = new URL(o.url || "").hostname.replace(/^www\./, "");
        } catch {}
        return (
          <li key={o.id}>
            <article className={styles.card}>
              <div className={styles.top}>
                <span className={styles.kind} data-t={o.type}>
                  <Icon />
                  {o.type === "snippet"
                    ? o.language || "Snippet"
                    : o.type === "file"
                      ? "File"
                      : "Link"}
                </span>
                <button
                  className={styles.pin}
                  data-on={!!o.pinned}
                  aria-label={`${o.pinned ? "Unpin" : "Pin"} ${o.name}`}
                  aria-pressed={!!o.pinned}
                  onClick={() => patch(o, { pinned: !o.pinned })}
                >
                  <Pin />
                </button>
              </div>
              <button
                className={styles.preview}
                data-t={o.type}
                onClick={() => open(o)}
                aria-label={`Open ${o.name}`}
              >
                {o.type === "snippet" ? (
                  <pre>
                    {(o.content || "Empty snippet")
                      .slice(0, 650)
                      .split("\n")
                      .slice(0, 7)
                      .map((line, i) => (
                        <span key={i}>
                          <i>{i + 1}</i>
                          <code>{line || " "}</code>
                        </span>
                      ))}
                  </pre>
                ) : o.type === "file" ? (
                  <div className={styles.fileInner}>
                    <div className={styles.sheet}>
                      <FileText />
                      <b>{extension}</b>
                    </div>
                    <span>{bytes(o.sizeBytes)}</span>
                  </div>
                ) : (
                  <div className={styles.linkInner}>
                    <span className={styles.mono}>
                      {domain[0]?.toUpperCase() || "↗"}
                    </span>
                    <strong>{domain}</strong>
                    <small>
                      <Globe /> View link <ArrowUpRight />
                    </small>
                  </div>
                )}
              </button>
              <div className={styles.body}>
                <button className={styles.title} onClick={() => open(o)}>{o.name}</button>
                <p className={styles.sub}>
                  {o.type === "link"
                    ? domain
                    : o.type === "file"
                      ? `${bytes(o.sizeBytes)} · ${o.mimeType || "File"}`
                      : `${o.content?.split("\n").length || 0} lines · ${o.language || "Plain text"}`}
                </p>
              </div>
              <div className={styles.foot}>
                <span className={styles.age}>
                  {o.expiresAt
                    ? `${until(o.expiresAt)} left`
                    : ago(o.updatedAt) === "now" ? "Just now" : `${ago(o.updatedAt)} ago`}
                </span>
                <div className={styles.actionsRow}>
                  {trash ? (
                    <>
                      <button
                        className={styles.act}
                        onClick={() => restore(o)}
                        aria-label={`Restore ${o.name}`}
                      >
                        <RotateCcw />
                        <span>Restore</span>
                      </button>
                      <button
                        className={styles.act}
                        onClick={() => remove(o, true)}
                        aria-label={`Permanently delete ${o.name}`}
                      >
                        <Trash2 />
                      </button>
                    </>
                  ) : (
                    <>
                      {o.type === "file" ? (
                        <a
                          className={styles.act}
                          href={`/api/files/${o.id}`}
                          aria-label={`Download ${o.name}`}
                        >
                          <Download />
                          <span>Download</span>
                        </a>
                      ) : o.type === "link" ? (
                        <a
                          className={styles.act}
                          href={o.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Visit ${o.name}`}
                        >
                          <ArrowUpRight />
                          <span>Open</span>
                        </a>
                      ) : (
                        <button
                          className={styles.act}
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                o.content || "",
                              );
                              notify("Copied. Go paste it.");
                            } catch {
                              notify(
                                "Couldn’t copy. Open it to grab the text.",
                              );
                            }
                          }}
                          aria-label={`Copy ${o.name}`}
                        >
                          <Copy />
                          <span>Copy</span>
                        </button>
                      )}
                      <button
                        className={styles.act}
                        onClick={() => open(o)}
                        aria-label={`Details for ${o.name}`}
                      >
                        <PanelRight />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

export function Board({
  objects,
  move,
  open,
}: {
  objects: Obj[];
  move: (o: Obj, b: Record<string, unknown>) => void;
  open: (o: Obj) => void;
}) {
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  if (!objects.length)
    return (
      <div className={styles.zero}>
        <div className={styles.zeroBadge}><Move /></div>
        <h2>Throw things around.</h2>
        <p>
          Add stuff to your stash, then drag it anywhere here. This board is yours.
        </p>
      </div>
    );
  return (
    <div
      className={styles.board}
      ref={board}
      aria-label="Board. Drag items or use arrow keys to arrange them."
    >
      {objects.map((o, index) => {
        const pos = positions[o.id] ||
          o.board || {
            x: 8 + (index % 3) * 30,
            y: 8 + ((Math.floor(index / 3) * 28) % 75),
          };
        const Icon = iconFor[o.type];
        return (
          <button
            className={styles.note}
            key={o.id}
            aria-label={`Open ${o.name}. Arrow keys move this item.`}
            style={{
              left: `calc(${clamp(pos.x)}% - ${clamp(pos.x) * 1.8}px)`,
              top: `calc(${clamp(pos.y)}% - ${clamp(pos.y) * 1.4}px)`,
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                id: o.id,
                startX: event.clientX,
                startY: event.clientY,
                x: pos.x,
                y: pos.y,
                moved: false,
              };
            }}
            onPointerMove={(event) => {
              const current = drag.current,
                rect = board.current?.getBoundingClientRect();
              if (!current || current.id !== o.id || !rect) return;
              const dx = event.clientX - current.startX,
                dy = event.clientY - current.startY;
              if (Math.abs(dx) + Math.abs(dy) > 6) current.moved = true;
              if (current.moved)
                setPositions((p) => ({
                  ...p,
                  [o.id]: {
                    x: clamp(
                      current.x + (dx / Math.max(1, rect.width - 180)) * 100,
                    ),
                    y: clamp(
                      current.y + (dy / Math.max(1, rect.height - 140)) * 100,
                    ),
                  },
                }));
            }}
            onPointerUp={() => {
              const current = drag.current;
              if (current?.id === o.id && current.moved)
                move(o, { board: positions[o.id] || pos });
            }}
            onPointerCancel={() => {
              drag.current = null;
              setPositions((p) => {
                const next = { ...p };
                delete next[o.id];
                return next;
              });
            }}
            onClick={() => {
              if (!drag.current?.moved) open(o);
              drag.current = null;
            }}
            onKeyDown={(event) => {
              const vectors: Record<string, [number, number]> = {
                ArrowLeft: [-3, 0],
                ArrowRight: [3, 0],
                ArrowUp: [0, -3],
                ArrowDown: [0, 3],
              };
              const delta = vectors[event.key];
              if (!delta) return;
              event.preventDefault();
              const next = {
                x: clamp(pos.x + delta[0]),
                y: clamp(pos.y + delta[1]),
              };
              setPositions((p) => ({ ...p, [o.id]: next }));
              move(o, { board: next });
            }}
          >
            <Move />
            <small style={{ font: "9px var(--mono)", color: "var(--muted)" }}>{o.type}</small>
            <Icon />
            <b>{o.name}</b>
            <span>{previewOf(o)}</span>
          </button>
        );
      })}
      <div className="board-help">
        Drag to arrange · Tap to open · Arrow keys to move
      </div>
    </div>
  );
}

export function ShareList({
  shares,
  revoke,
  notify,
}: {
  shares: Share[];
  revoke: (s: Share) => void;
  notify: (msg: string) => void;
}) {
  if (!shares.length)
    return (
      <div className={styles.zero}>
        <div className={styles.zeroBadge}>↗</div>
        <h2>No beams out</h2>
        <p>Open anything and beam it as a public link with expiry + QR.</p>
      </div>
    );

  return (
    <ul className={styles.shareList}>
      {shares.map((s) => (
        <li key={s.id}>
          <article className={styles.shareCard}>
            <ArrowUpRight aria-hidden="true" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <small style={{ font: "9px var(--mono)", color: "var(--muted)" }}>{s.object.type.toUpperCase()} · BEAM</small>
              <h3 style={{ margin: "6px 0", fontSize: 15 }}>{s.object.name}</h3>
              <code>/s/{s.token.slice(0, 9)}••••</code>
            </div>
            <dl style={{ display: "flex", gap: 14, fontSize: 11, margin: 0 }}>
              <div><dt style={{ fontSize: 9, color: "var(--muted)" }}>HITS</dt><dd style={{ margin: 0, fontWeight: 800 }}>{s.accessCount}×</dd></div>
              <div><dt style={{ fontSize: 9, color: "var(--muted)" }}>LEFT</dt><dd style={{ margin: 0, fontWeight: 800 }}>{s.expiresAt ? until(s.expiresAt) : "∞"}</dd></div>
            </dl>
            <button
              className={styles.act}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${location.origin}/s/${s.token}`,
                  );
                  notify("Beam copied");
                } catch {
                  notify("Copy failed");
                }
              }}
            >
              <Copy aria-hidden="true" />
              COPY
            </button>
            <button
              className={styles.act}
              onClick={() => revoke(s)}
              aria-label={`Revoke ${s.object.name}`}
            >
              <X aria-hidden="true" />
              CUT
            </button>
          </article>
        </li>
      ))}
    </ul>
  );
}
