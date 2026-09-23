"use client";

import { useEffect } from "react";
import Link from "next/link";
import { SearchBox } from "./docs-chrome";

export function SiteHeader({ section }: { section?: "docs" }) {
  useEffect(() => {
    document.getElementById("site-theme-btn")?.addEventListener("click", () => {
      const el = document.documentElement;
      const next = el.dataset.theme === "dark" ? "light" : "dark";
      el.dataset.theme = next;
      try {
        localStorage.setItem("9t-site-theme", next);
      } catch {}
    });
  }, []);
  return (
    <header className="topbar">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Link className="brand" href="/" aria-label="9t home">
        <img src="/9t-mark.svg" alt="" width={44} height={34} />
        <span>
          <b>9t</b>
          <small>SELF-HOSTED WORKSPACE</small>
        </span>
        {section === "docs" && <span className="docs-badge">Docs</span>}
      </Link>
      <nav className="topnav" aria-label="Main navigation">
        <Link href="/docs/" aria-current={section === "docs" ? "page" : undefined}>
          Docs
        </Link>
        <Link href="/docs/android/">Android</Link>
        <Link href="/docs/install/">Install</Link>
        <a href="https://github.com/M3264/9t">GitHub</a>
        {section === "docs" && <SearchBox />}
        <button id="site-theme-btn" className="iconbtn" aria-label="Toggle theme" title="Toggle theme">
          ◐
        </button>
        <Link className="primarybtn small" href="/docs/install/">
          Get started
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <Link className="brand" href="/">
        <img src="/9t-mark.svg" alt="" width={36} height={27} />
        <b>9t</b>
      </Link>
      <nav aria-label="Footer">
        <Link href="/docs/">Docs</Link>
        <a href="https://github.com/M3264/9t">GitHub</a>
        <a href="https://github.com/M3264/9t/releases">Releases</a>
        <a href="https://github.com/M3264/9t/releases/download/v0.6.1/9t-android-0.6.1.apk">APK</a>
      </nav>
      <p>Self-hosted workspace · GPL-3.0 · Your server, your storage, your terms.</p>
    </footer>
  );
}
