"use client";

import { createContext, useContext, useEffect, useRef, useState, type ComponentProps } from "react";

const InCodeBlock = createContext(false);

function useCopy() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  };

  return { state, copy };
}

export function CopyablePre({ children, ...props }: ComponentProps<"pre">) {
  const pre = useRef<HTMLPreElement>(null);
  const { state, copy } = useCopy();
  return (
    <div className="doc-code-block">
      <button
        className="doc-code-copy"
        type="button"
        onClick={() => copy(pre.current?.textContent?.replace(/\n$/, "") ?? "")}
        aria-label="Copy code block"
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Try again" : "Copy"}
      </button>
      <InCodeBlock.Provider value={true}>
        <pre ref={pre} {...props}>{children}</pre>
      </InCodeBlock.Provider>
    </div>
  );
}

export function CopyableCode({ children, ...props }: ComponentProps<"code">) {
  const inBlock = useContext(InCodeBlock);
  const code = useRef<HTMLElement>(null);
  const { state, copy } = useCopy();
  if (inBlock) return <code ref={code} {...props}>{children}</code>;
  return (
    <span className="doc-inline-code">
      <code ref={code} {...props}>{children}</code>
      <button
        className="doc-inline-copy"
        type="button"
        onClick={() => copy(code.current?.textContent ?? "")}
        aria-label={state === "copied" ? "Copied inline code" : "Copy inline code"}
        title={state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy code"}
      >
        {state === "copied" ? "✓" : "⧉"}
      </button>
    </span>
  );
}
