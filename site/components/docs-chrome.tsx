"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGES, neighbors } from "../lib/docs";

function slugOf(pathname: string) {
  const m = pathname.match(/^\/docs\/([^/]+)\/?$/);
  return m ? m[1] : "index";
}

export function SearchBox() {
  useEffect(() => {
    let cancelled = false;
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/pagefind/pagefind-ui.css";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "/pagefind/pagefind-ui.js";
    script.onload = () => {
      if (cancelled) return;
      const UI = (window as unknown as { PagefindUI?: new (o: object) => void }).PagefindUI;
      const el = document.getElementById("docs-search");
      if (UI && el && !el.dataset.ready) {
        el.dataset.ready = "1";
        new UI({ element: el, showSubResults: true, showImages: false });
      }
    };
    document.body.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <span className="searchbox">
      <span id="docs-search" />
    </span>
  );
}

export function DocsChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const slug = slugOf(pathname || "/docs/");
  const { prev, next } = neighbors(slug);
  useEffect(() => {
    document.getElementById("docs-menu-btn")?.addEventListener("click", () => {
      document.getElementById("docs-shell")?.classList.toggle("open");
    });
  }, []);
  const href = (s: string) => (s === "index" ? "/docs/" : `/docs/${s}/`);
  return (
    <div className="docs" id="docs-shell">
      <aside className="docs-side" aria-label="Documentation sections">
        <h2>Documentation</h2>
        <ul>
          {PAGES.map((p) => (
            <li key={p.slug}>
              <Link href={href(p.slug)} aria-current={p.slug === slug ? "page" : undefined}>
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <div>
        <button id="docs-menu-btn" className="ghostbtn menubtn" aria-label="Open sections menu">
          Sections
        </button>
        <article className="prose">{children}</article>
        <nav className="pager" aria-label="Previous and next">
          {prev ? (
            <Link href={href(prev.slug)}>
              <small>← Previous</small>
              {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link className="next" href={href(next.slug)}>
              <small>Next →</small>
              {next.title}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </div>
  );
}
