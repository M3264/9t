"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GROUPS, PAGES, neighbors, type TocItem } from "../lib/docs";

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

export function DocsChrome({
  slug,
  toc,
  children,
}: {
  slug?: string;
  toc?: TocItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const current = slug || slugOf(pathname || "/docs/");
  const title = PAGES.find((p) => p.slug === current)?.title || "Docs";
  const { prev, next } = neighbors(current);
  const [active, setActive] = useState("");
  useEffect(() => {
    document.getElementById("docs-menu-btn")?.addEventListener("click", () => {
      document.getElementById("docs-shell")?.classList.toggle("open");
    });
  }, []);
  useEffect(() => {
    const headings = Array.from(
      document.querySelectorAll<HTMLElement>(".prose h2[id], .prose h3[id]"),
    );
    if (!headings.length) return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    headings.forEach((h) => seen.observe(h));
    return () => seen.disconnect();
  }, [current]);
  const href = (s: string) => (s === "index" ? "/docs/" : `/docs/${s}/`);
  return (
    <div className="docs" id="docs-shell">
      <aside className="docs-side" aria-label="Documentation sections">
        {GROUPS.map((g) => (
          <div key={g.label} className="docs-group">
            <h2>{g.label}</h2>
            <ul>
              {g.pages.map((p) => (
                <li key={p.slug}>
                  <Link href={href(p.slug)} aria-current={p.slug === current ? "page" : undefined}>
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
      <div className="docs-main">
        <button id="docs-menu-btn" className="ghostbtn menubtn" aria-label="Open sections menu">
          Sections
        </button>
        <p className="crumbs">
          <Link href="/docs/">Docs</Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{title}</span>
        </p>
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
      {toc && toc.length > 0 && (
        <aside className="docs-toc" aria-label="On this page">
          <h2>On this page</h2>
          <ul>
            {toc.map((t) => (
              <li key={t.id} data-depth={t.depth}>
                <a href={`#${t.id}`} aria-current={active === t.id ? "true" : undefined}>
                  {t.text}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
