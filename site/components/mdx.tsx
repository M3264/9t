import Link from "next/link";
import type { ReactNode } from "react";

// Rich docs primitives (Card / Accordion / Callout / Diagram), usable as JSX
// inside any content/*.md file. Server components — no client JS needed.

export function CardGroup({ cols = 2, children }: { cols?: number; children: ReactNode }) {
  return (
    <div className="doc-cards" style={{ ["--doc-card-cols" as string]: cols }}>
      {children}
    </div>
  );
}

export function Card({ title, href, children }: { title: string; href: string; children: ReactNode }) {
  const inner = (
    <>
      <strong>{title}</strong>
      <span className="doc-card-body">{children}</span>
      <span className="doc-card-go" aria-hidden="true">
        →
      </span>
    </>
  );
  return href.startsWith("/") ? (
    <Link className="doc-card" href={href}>
      {inner}
    </Link>
  ) : (
    <a className="doc-card" href={href}>
      {inner}
    </a>
  );
}

export function Accordion({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="doc-accordion">
      <summary>
        <span className="doc-accordion-caret" aria-hidden="true">
          ›
        </span>
        <span>{title}</span>
      </summary>
      <div className="doc-accordion-body">{children}</div>
    </details>
  );
}

export function AccordionGroup({ children }: { children: ReactNode }) {
  return <div className="doc-accordions">{children}</div>;
}

export function Callout({ type = "note", children }: { type?: "note" | "warn"; children: ReactNode }) {
  return (
    <div className={`doc-callout ${type}`}>
      <span className="doc-callout-icon" aria-hidden="true">
        {type === "warn" ? "!" : "i"}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function Diagram({
  rows,
  caption,
}: {
  rows: Array<{ from: string; label: string; to: string }>;
  caption?: string;
}) {
  return (
    <div className="doc-diagram">
      {rows.map((r, i) => (
        <div className="doc-diagram-row" key={i}>
          <span className="doc-diagram-node">{r.from}</span>
          <span className="doc-diagram-arrow">
            <em>{r.label}</em>
            <span aria-hidden="true">→</span>
          </span>
          <span className="doc-diagram-node">{r.to}</span>
        </div>
      ))}
      {caption && <p className="doc-diagram-caption">{caption}</p>}
    </div>
  );
}

export const mdxComponents = { CardGroup, Card, Accordion, AccordionGroup, Callout, Diagram };
