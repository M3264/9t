"use client";
import { useRef, useState } from "react";
import { ArrowRight, Paperclip } from "lucide-react";
import { workspaceApi as api } from "../../lib/client/workspace";

export default function UniversalInbox({ saved }: { saved: () => void }) {
  const [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [dragging, setDragging] = useState(false),
    fileRef = useRef<HTMLInputElement>(null);
  const add = async (file?: File) => {
    if (!file && !value.trim()) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("lifetime", "forever");
      if (file) {
        form.set("type", "file");
        form.set("name", file.name);
        form.set("file", file);
      } else {
        const text = value.trim();
        let parsed: URL | null = null;
        try {
          const candidate = new URL(text);
          if (["http:", "https:"].includes(candidate.protocol))
            parsed = candidate;
        } catch {}
        if (parsed) {
          form.set("type", "link");
          form.set("name", parsed.hostname.replace(/^www\./, ""));
          form.set("url", parsed.toString());
        } else {
          form.set("type", "snippet");
          form.set(
            "name",
            text.split("\n")[0].slice(0, 52) || "Untitled snippet",
          );
          form.set("content", text);
          form.set("language", "text");
        }
      }
      await api("/api/objects", { method: "POST", body: form });
      setValue("");
      saved();
    } finally {
      setBusy(false);
      setDragging(false);
    }
  };
  return (
    <form
      className={dragging ? "quick-add dragging" : "quick-add"}
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        add(event.dataTransfer.files[0]);
      }}
    >
      <div className="quick-mark">
        <img src="/9t-mark.svg" alt="" />
      </div>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={
          dragging ? "Drop it here" : "Drop, paste, or type anything…"
        }
      />
      <button
        type="button"
        className="attach"
        title="Choose a file"
        onClick={() => fileRef.current?.click()}
      >
        <Paperclip />
      </button>
      <input
        ref={fileRef}
        hidden
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) add(file);
        }}
      />
      <button className="quick-submit" disabled={busy || !value.trim()}>
        {busy ? "Adding" : "Add"}
        <ArrowRight />
      </button>
      <small>Links and text are recognized automatically</small>
    </form>
  );
}
