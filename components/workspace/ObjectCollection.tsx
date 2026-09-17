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
      <div className="zero-state">
        <div className="empty-illustration">
          {searching ? <Search /> : trash ? <Trash2 /> : <FolderOpen />}
        </div>
        <span className="eyebrow">
          {searching ? "KEEP LOOKING" : "A LITTLE ROOM FOR POSSIBILITY"}
        </span>
        <h2>
          {searching
            ? "Nothing matched that search."
            : trash
              ? "All clear here."
              : "Your next useful thing starts here."}
        </h2>
        <p>
          {searching
            ? "Try a different name, a word from a snippet, or a link."
            : trash
              ? "Deleted items will appear here. You can restore them before they expire."
              : "Save a thought. Drop a file. Keep a link. It’ll be waiting on your other devices."}
        </p>
        {!trash && !searching && (
          <button className="primary-button" onClick={create}>
            Add your first item <ArrowUpRight />
          </button>
        )}
      </div>
    );
  return (
    <ul className={`object-collection ${layout}`}>
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
            <article className={`object-card ${o.type}`}>
              <div className="card-top">
                <span className={`object-kind ${o.type}`}>
                  <Icon />
                  {o.type === "snippet"
                    ? o.language || "Snippet"
                    : o.type === "file"
                      ? "File"
                      : "Link"}
                </span>
                <button
                  className={`icon-button pin-button ${o.pinned ? "is-pinned" : ""}`}
                  aria-label={`${o.pinned ? "Unpin" : "Pin"} ${o.name}`}
                  aria-pressed={!!o.pinned}
                  onClick={() => patch(o, { pinned: !o.pinned })}
                >
                  <Pin />
                </button>
              </div>
              <button
                className={`object-preview ${o.type}`}
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
                  <div className="file-preview">
                    <div className="file-sheet">
                      <FileText />
                      <b>{extension}</b>
                    </div>
                    <span>{bytes(o.sizeBytes)}</span>
                  </div>
                ) : (
                  <div className="link-preview">
                    <span className="link-monogram">
                      {domain[0].toUpperCase()}
                    </span>
                    <strong>{domain}</strong>
                    <span>
                      <Globe /> Saved for a little later <ArrowUpRight />
                    </span>
                  </div>
                )}
              </button>
              <div className="card-description">
                <button onClick={() => open(o)}>{o.name}</button>
                <p>
                  {o.type === "link"
                    ? domain
                    : o.type === "file"
                      ? `${bytes(o.sizeBytes)} · ${o.mimeType || "File"}`
                      : `${o.content?.split("\n").length || 0} lines · ${o.language || "Plain text"}`}
                </p>
              </div>
              <div className="card-footer">
                <span className="item-age">
                  {o.expiresAt
                    ? `${until(o.expiresAt)} left`
                    : `Updated ${ago(o.updatedAt)}`}
                </span>
                <div className="card-actions">
                  {trash ? (
                    <>
                      <button
                        onClick={() => restore(o)}
                        aria-label={`Restore ${o.name}`}
                      >
                        <RotateCcw />
                        <span>Restore</span>
                      </button>
                      <button
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
                          href={`/api/files/${o.id}`}
                          aria-label={`Download ${o.name}`}
                        >
                          <Download />
                          <span>Download</span>
                        </a>
                      ) : o.type === "link" ? (
                        <a
                          href={o.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Visit ${o.name}`}
                        >
                          <ArrowUpRight />
                          <span>Open link</span>
                        </a>
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                o.content || "",
                              );
                              notify("Snippet copied");
                            } catch {
                              notify(
                                "Couldn’t copy. Open the item to select its text.",
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
      <div className="zero-state">
        <Move />
        <h2>A place to see it your way.</h2>
        <p>
          Add items to your workspace, then arrange them here. Board uses your
          existing collection.
        </p>
      </div>
    );
  return (
    <div
      className="spatial-board"
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
            className={`board-note ${o.type}`}
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
            <small>{o.type}</small>
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
      <div className="zero-state">
        <div aria-hidden="true">↗</div>
        <h2>No shared links</h2>
        <p>Open an item to create an expiring public link.</p>
      </div>
    );

  return (
    <ul className="share-log">
      {shares.map((s) => (
        <li key={s.id}>
          <article>
            <ArrowUpRight aria-hidden="true" />
            <div>
              <small>{s.object.type.toUpperCase()} · SHARED LINK</small>
              <h3>{s.object.name}</h3>
              <code>/s/{s.token.slice(0, 9)}••••</code>
            </div>
            <dl>
              <dt>OPENED</dt>
              <dd>{s.accessCount}×</dd>
              <dt>EXPIRES</dt>
              <dd>{s.expiresAt ? until(s.expiresAt) : "∞"}</dd>
            </dl>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${location.origin}/s/${s.token}`,
                  );
                  notify("Link copied");
                } catch {
                  notify("Copy failed");
                }
              }}
            >
              <Copy aria-hidden="true" />
              COPY
            </button>
            <button
              onClick={() => revoke(s)}
              aria-label={`Revoke ${s.object.name}`}
            >
              <X aria-hidden="true" />
              REVOKE
            </button>
          </article>
        </li>
      ))}
    </ul>
  );
}
