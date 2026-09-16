"use client";
import { useRef } from "react";
import {
  ArrowUpRight,
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
export function ObjectList({
  objects,
  trash,
  open,
  patch,
  remove,
  restore,
}: {
  objects: Obj[];
  trash: boolean;
  open: (o: Obj) => void;
  patch: (o: Obj, b: Record<string, unknown>) => void;
  remove: (o: Obj, p?: boolean) => void;
  restore: (o: Obj) => void;
}) {
  if (!objects.length)
    return (
      <div className="zero-state">
        <div>9t</div>
        <h2>Nothing here yet</h2>
        <p>Add a file, snippet, or link. It will be here on every device.</p>
      </div>
    );
  return (
    <div className="signal-list">
      {objects.map((o) => {
        const Icon = iconFor[o.type];
        return (
          <article className="signal-row" key={o.id} onClick={() => open(o)}>
            <div className="signal-id">
              <span className={o.type}>
                <Icon />
              </span>
            </div>
            <div className="signal-payload">
              <div>
                <em>{o.type}</em>
                {o.pinned && <i>pinned</i>}
                {o.expiresAt && (
                  <i className="expiry">{until(o.expiresAt)} left</i>
                )}
              </div>
              <h3>{o.name}</h3>
              <p>
                {o.type === "snippet"
                  ? (o.content || "empty snippet").slice(0, 120)
                  : o.type === "link"
                    ? o.url
                    : `${o.mimeType || "file"} · ${bytes(o.sizeBytes)}`}
              </p>
            </div>
            <time>{ago(o.updatedAt)}</time>
            <div
              className="signal-actions"
              onClick={(event) => event.stopPropagation()}
            >
              {trash ? (
                <>
                  <button onClick={() => restore(o)}>RESTORE</button>
                  <button onClick={() => remove(o, true)}>DELETE</button>
                </>
              ) : (
                <>
                  <button
                    title="Pin"
                    className={o.pinned ? "active" : ""}
                    onClick={() => patch(o, { pinned: !o.pinned })}
                  >
                    <Pin />
                  </button>
                  <button title="Details" onClick={() => open(o)}>
                    <PanelRight />
                  </button>
                  <button title="Move to trash" onClick={() => remove(o)}>
                    <Trash2 />
                  </button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
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
  const board = useRef<HTMLDivElement>(null),
    drop = (event: React.DragEvent, o: Obj) => {
      const rect = board.current!.getBoundingClientRect();
      move(o, {
        board: {
          x: ((event.clientX - rect.left) / rect.width) * 100,
          y: ((event.clientY - rect.top) / rect.height) * 100,
        },
      });
    };
  return (
    <div
      className="spatial-board"
      ref={board}
      onDragOver={(event) => event.preventDefault()}
    >
      <div className="board-coordinates">
        <span>0,0</span>
        <span>100,0</span>
        <span>0,100</span>
        <span>100,100</span>
      </div>
      {objects.map((o, index) => {
        const pos = o.board || {
            x: 8 + ((index * 23) % 76),
            y: 12 + ((index * 31) % 68),
          },
          Icon = iconFor[o.type];
        return (
          <button
            draggable
            onDragEnd={(event) => drop(event, o)}
            onDoubleClick={() => open(o)}
            className={`board-note ${o.type}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            key={o.id}
          >
            <Move />
            <small>{o.type}</small>
            <Icon />
            <b>{o.name}</b>
            <span>
              {o.type === "snippet"
                ? o.content?.slice(0, 60)
                : o.type === "link"
                  ? o.url
                  : bytes(o.sizeBytes)}
            </span>
          </button>
        );
      })}
      <div className="board-help">DRAG TO ARRANGE · DOUBLE CLICK TO OPEN</div>
    </div>
  );
}
export function ShareList({
  shares,
  revoke,
}: {
  shares: Share[];
  revoke: (s: Share) => void;
}) {
  return shares.length ? (
    <div className="share-log">
      {shares.map((s) => (
        <article key={s.id}>
          <ArrowUpRight />
          <div>
            <small>SHARED LINK</small>
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
            onClick={() =>
              navigator.clipboard.writeText(`${location.origin}/s/${s.token}`)
            }
          >
            <Copy />
            COPY
          </button>
          <button onClick={() => revoke(s)}>
            <X />
            REVOKE
          </button>
        </article>
      ))}
    </div>
  ) : (
    <div className="zero-state">
      <div>↗</div>
      <h2>No shared links</h2>
      <p>Open an item to create an expiring public link.</p>
    </div>
  );
}
