"use client";

import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Clock3,
  FileUp,
  LoaderCircle,
  Paperclip,
  Plus,
  Smartphone,
} from "lucide-react";
import { ApiError, workspaceApi as api } from "../../lib/client/workspace";
import type { WorkspaceConfig } from "../../types/workspace";

export default function UniversalInbox({
  config,
  saved,
  notify,
}: {
  config: WorkspaceConfig;
  saved: () => void | Promise<void>;
  notify: (message: string) => void;
}) {
  const [value, setValue] = useState("");
  const [lifetime, setLifetime] = useState("forever");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const canText = config.modules.snippets || config.modules.links;
  const parseUrl = (text: string) => {
    try {
      const url = new URL(text.trim());
      return ["http:", "https:"].includes(url.protocol) ? url : null;
    } catch {
      return null;
    }
  };
  const addText = async () => {
    if (!value.trim() || inFlight.current) return;
    const url = parseUrl(value);
    const type = url && config.modules.links ? "link" : "snippet";
    if (type === "snippet" && !config.modules.snippets) {
      setError(
        "Enter an http or https link. Snippets are disabled in this workspace.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("type", type);
      form.set("lifetime", lifetime);
      form.set(
        "name",
        type === "link"
          ? url!.hostname
          : value.trim().split("\n")[0].slice(0, 80),
      );
      if (type === "link") form.set("url", url!.toString());
      else {
        form.set("content", value.trim());
        form.set("language", "text");
      }
      await api("/api/objects", { method: "POST", body: form });
      setValue("");
      await saved();
      notify(
        type === "link"
          ? "Link saved. Ready on your other devices."
          : "Snippet saved. Ready on your other devices.",
      );
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Couldn’t save this. Please try again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const addFiles = async (files: FileList | File[] | null) => {
    if (!files?.length || inFlight.current || !config.modules.files) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setDragging(false);
    let added = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.size > config.maxSizeMb * 1024 * 1024)
          throw new Error(
            `${file.name} exceeds the ${config.maxSizeMb} MB limit.`,
          );
        setProgress(`Uploading ${added + 1} of ${files.length}…`);
        const form = new FormData();
        form.set("type", "file");
        form.set("name", (file.name || `pasted-image-${Date.now()}.png`).slice(0, 200));
        form.set("file", file);
        form.set("lifetime", lifetime);
        await api("/api/objects", { method: "POST", body: form });
        added++;
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Upload failed. Please try again.",
      );
    } finally {
      if (added) {
        await saved();
        notify(`${added} ${added === 1 ? "file" : "files"} uploaded.`);
      }
      inFlight.current = false;
      setBusy(false);
      setProgress("");
    }
  };
  if (!canText && !config.modules.files)
    return (
      <div className="modules-empty">
        <h2>Make room for what you use.</h2>
        <p>
          Enable Files, Snippets, or Links in Settings to start your collection.
        </p>
      </div>
    );
  return (
    <section
      className={`capture-zone ${dragging ? "is-dragging" : ""} ${!canText ? "files-only" : ""}`}
      aria-label="Quick capture"
      onDragOver={(e) => {
        if (config.modules.files) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        void addFiles(e.dataTransfer.files);
      }}
    >
      <div className="capture-editor">
        <div className="capture-label">
          <span>
            <Plus /> QUICK CAPTURE
          </span>
          <span className="capture-tag">Less friction. More flow.</span>
        </div>
        {canText ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addText();
            }}
          >
            <textarea
              aria-label="Text or link to save"
              value={value}
              maxLength={500000}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                config.modules.snippets
                  ? "What do you want to keep?"
                  : "Paste a link worth keeping…"
              }
              rows={2}
              onPaste={(event) => {
                if (!config.modules.files || busy) return;
                const image = Array.from(event.clipboardData.items)
                  .find((item) => item.kind === "file" && item.type.startsWith("image/"))
                  ?.getAsFile();
                if (!image) return;
                event.preventDefault();
                void addFiles([image]);
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void addText();
                }
              }}
            />
            <div className="capture-bottom">
              <div className="capture-tools">
                {config.modules.files && (
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Attach files"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Paperclip />
                  </button>
                )}
                <label className="keep-select">
                  <Clock3 />
                  <select
                    aria-label="Keep captured items for"
                    value={lifetime}
                    onChange={(e) => setLifetime(e.target.value)}
                  >
                    <option value="forever">Keep forever</option>
                    <option value="1h">Keep 1 hour</option>
                    <option value="1d">Keep 1 day</option>
                    <option value="7d">Keep 7 days</option>
                  </select>
                </label>
              </div>
              <button className="capture-save" disabled={busy || !value.trim()}>
                {busy ? <LoaderCircle className="spin" /> : <ArrowUpRight />}
                <span>{busy ? "Saving" : "Save"}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="capture-file-intro">
            <h2>
              From this device.
              <br />
              To your next.
            </h2>
            <p>Upload a file and take it with you.</p>
            <label className="keep-select">
              <Clock3 />
              <select
                aria-label="Keep captured items for"
                value={lifetime}
                onChange={(e) => setLifetime(e.target.value)}
              >
                <option value="forever">Keep forever</option>
                <option value="1h">Keep 1 hour</option>
                <option value="1d">Keep 1 day</option>
                <option value="7d">Keep 7 days</option>
              </select>
            </label>
          </div>
        )}
      </div>
      {config.modules.files ? (
        <button
          className="capture-drop"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <span className="upload-emblem">
            {busy ? <LoaderCircle className="spin" /> : <FileUp />}
          </span>
          <strong>
            {progress ||
              (dragging
                ? "Let it go. We’ve got it."
                : "Drop a file. Take it anywhere.")}
          </strong>
          <span>
            or <u>browse files</u> <ArrowUpRight />
          </span>
          <small>Up to {config.maxSizeMb} MB per file</small>
        </button>
      ) : (
        <div className="capture-handoff">
          <Smartphone />
          <strong>Pick it up on your next device.</strong>
          <p>Open your workspace to find everything you’ve saved.</p>
        </div>
      )}
      <input
        hidden
        type="file"
        multiple
        ref={fileRef}
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {error && (
        <p className="capture-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
