"use client";

import { Component, ReactNode } from "react";

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="9t home">
      <img src="/9t-mark.svg" width={44} height={33} />
      <span>
        <b>9t</b>
      </span>
    </a>
  );
}

export function LoadingScreen({ label = "Opening your workspace" }: { label?: string }) {
  return (
    <div className="boot" role="status" aria-live="polite">
      <Brand />
      <div className="boot-line" aria-hidden="true">
        <i />
      </div>
      <span>{label}</span>
    </div>
  );
}

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean; message: string }
> {
  state = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return {
      failed: true,
      message: error instanceof Error ? error.message : "Something broke.",
    };
  }

  componentDidCatch() {
    // Intentionally quiet — surface via UI, not console spam in prod.
  }

  render() {
    if (this.state.failed) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="zero-state" role="alert">
          <div>9t</div>
          <h2>Something broke</h2>
          <p>{this.state.message || "Reload to try again."}</p>
          <p>
            <button
              className="add-button"
              onClick={() => location.reload()}
            >
              Reload
            </button>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
