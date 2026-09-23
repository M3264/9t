"use client";

import { ArrowUpRight, Code2, FileText, Link2, Pin } from "lucide-react";
import type { WorkspaceObject } from "../../types/workspace";
import { formatBytes } from "../../lib/client/workspace";
import styles from "./Workspace.module.css";

export function PinnedItems({ objects, open }: {
  objects: WorkspaceObject[];
  open: (object: WorkspaceObject) => void;
}) {
  return <div className={styles.pinnedGrid}>
    {objects.slice(0, 3).map((object) => {
      const Icon = object.type === "snippet" ? Code2 : object.type === "file" ? FileText : Link2;
      let domain = "Saved link";
      try { domain = new URL(object.url || "").hostname.replace(/^www\./, ""); } catch {}
      return <button key={object.id} className={styles.pinnedCard} data-type={object.type} onClick={() => open(object)} aria-label={`Open pinned ${object.name}`}>
        <span className={styles.pinnedTop}><span><Icon />{object.type === "snippet" ? object.language || "Snippet" : object.type === "file" ? "File" : "Link"}</span><Pin /></span>
        {object.type === "snippet" ? <pre>{object.content?.split("\n").filter(Boolean).slice(0, 3).join("\n") || "Empty snippet"}</pre>
          : object.type === "link" ? <span className={styles.pinnedLink}><span>{domain[0]?.toUpperCase()}</span><span>{domain}<small>Saved to your workspace</small></span></span>
          : <span className={styles.pinnedFile}><FileText /><span>{object.name.split(".").pop()?.toUpperCase() || "FILE"}<small>{formatBytes(object.sizeBytes)}</small></span></span>}
        <span className={styles.pinnedBottom}><strong>{object.name}</strong><ArrowUpRight /></span>
      </button>;
    })}
  </div>;
}
