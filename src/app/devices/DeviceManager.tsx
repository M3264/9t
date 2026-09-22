"use client";
import { useCallback, useEffect, useState } from "react";
type Device = {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt?: string;
};
type PairRequest = {
  id: string;
  name: string;
  sessionNumber: string;
  createdAt: string;
  expiresAt: string;
};
const card: React.CSSProperties = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 24,
  margin: "20px 0",
};
const primary: React.CSSProperties = {
  padding: "12px 20px",
  background: "var(--blue)",
  color: "var(--on-accent)",
  borderRadius: 10,
  fontWeight: 700,
};
export default function DeviceManager() {
  const [devices, setDevices] = useState<Device[]>([]),
    [name, setName] = useState("My Android phone");
  const [requests, setRequests] = useState<PairRequest[]>([]);
  const [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [handling, setHandling] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [d, r] = await Promise.all([
      fetch("/api/devices").then((res) => {
        if (!res.ok) throw new Error("Could not load devices. Sign in and try again.");
        return res.json();
      }),
      fetch("/api/pair-requests").then((res) => (res.ok ? res.json() : { requests: [] })),
    ]);
    setDevices(d.devices);
    setRequests(r.requests ?? []);
  }, []);
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
    const t = setInterval(() => load().catch(() => {}), 5000);
    return () => clearInterval(t);
  }, [load]);
  async function pair() {
    setBusy(true);
    setMessage("");
    setCode("");
    try {
      const r = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      setCode("9t1:" + btoa(JSON.stringify({ ...body, url: location.origin })));
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Pairing failed.");
    } finally {
      setBusy(false);
    }
  }
  async function handleRequest(id: string, action: "approve" | "deny") {
    setHandling(id);
    setMessage("");
    try {
      const r = await fetch("/api/pair-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Request failed.");
      setMessage(
        action === "approve"
          ? "Phone approved — it will connect within seconds."
          : "Request declined.",
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setHandling(null);
    }
  }
  async function revoke(id: string) {
    if (!confirm("Disconnect this device? Its saved files stay on the phone."))
      return;
    setBusy(true);
    try {
      const r = await fetch("/api/devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error("Could not disconnect device.");
      setCode("");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 80px" }}>
      <a href="/" style={{ color: "var(--blue-ink)", fontWeight: 600 }}>← Workspace</a>
      <p style={{ marginTop: 32, color: "var(--blue-ink)", fontSize: 12, letterSpacing: "0.1em" }}>
        9t / CONNECTED DEVICES
      </p>
      <h1 style={{ fontSize: "clamp(32px, 6vw, 48px)", margin: "12px 0", letterSpacing: "-0.04em" }}>
        Your workspace. In your pocket.
      </h1>
      <p style={{ lineHeight: 1.7, color: "var(--muted)" }}>
        Two ways to pair: ask from the phone and approve here, or create a
        code here and paste it into the app. Either way, check the 5-digit
        session number matches the phone screen.
      </p>

      {requests.length > 0 && (
        <section
          aria-live="polite"
          style={{
            ...card,
            border: "2px solid var(--blue)",
            boxShadow: "0 0 0 3px var(--blue-ring)",
          }}
        >
          <h2 style={{ margin: "0 0 4px" }}>
            🔔 {requests.length} phone{requests.length > 1 ? "s" : ""} asking to connect
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 8px" }}>
            Only approve a request whose 5-digit number matches the screen of
            the phone in your hand.
          </p>
          {requests.map((q) => (
            <article
              key={q.id}
              style={{
                display: "flex",
                gap: 16,
                alignItems: "center",
                flexWrap: "wrap",
                borderTop: "1px solid var(--line)",
                padding: "16px 0",
              }}
            >
              <div
                aria-label={`Session number ${q.sessionNumber}`}
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 32,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  background: "var(--blue-soft)",
                  color: "var(--blue-ink)",
                  borderRadius: 12,
                  padding: "8px 16px",
                }}
              >
                {q.sessionNumber}
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <strong>{q.name}</strong>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
                  Requested {new Date(q.createdAt).toLocaleTimeString()} · expires{" "}
                  {new Date(q.expiresAt).toLocaleTimeString()}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={handling === q.id}
                  onClick={() => handleRequest(q.id, "approve")}
                  style={primary}
                >
                  {handling === q.id ? "…" : "Approve"}
                </button>
                <button
                  disabled={handling === q.id}
                  onClick={() => handleRequest(q.id, "deny")}
                  style={{
                    padding: "12px 16px",
                    background: "transparent",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    color: "var(--danger)",
                    fontWeight: 600,
                  }}
                >
                  Deny
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section style={card}>
        <h2 style={{ margin: "0 0 4px" }}>Pair from the phone</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 8px", lineHeight: 1.6 }}>
          In the app: Connect → <b>Request connection</b> → enter this
          server&apos;s address → send. A card like the one above appears here
          with the same 5-digit number.
        </p>
        <ol style={{ lineHeight: 1.9, fontSize: 14, paddingLeft: 20, margin: "8px 0 0" }}>
          <li>Phone shows a 5-digit session number.</li>
          <li>You approve the matching number here.</li>
          <li>Phone connects — no codes to copy.</li>
        </ol>
      </section>

      <p style={{ marginTop: 20 }}>
        <a
          href="/downloads/9t-android-0.6.0.apk"
          download
          style={{ color: "var(--blue-ink)", fontWeight: 700 }}
        >
          Download 9t for Android · v0.6.0
        </a>
        <br />
        <small style={{ color: "var(--muted)" }}>
          Android 5 or newer. Native receiving; the full workspace needs a current WebView.
        </small>
      </p>

      <section style={card}>
        <h2 style={{ margin: "0 0 4px" }}>Pair from the web</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 8px" }}>
          Classic flow: create a code here, paste it into the app.
        </p>
        <label style={{ display: "block", margin: "16px 0" }}>
          Device name
          <input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            style={{
              display: "block",
              padding: 12,
              width: "100%",
              marginTop: 8,
              border: "1px solid var(--line)",
              borderRadius: 10,
              background: "var(--bg)",
              color: "var(--ink)",
              fontSize: 16,
            }}
          />
        </label>
        <button disabled={busy} onClick={pair} style={primary}>
          Create pairing code
        </button>
        {code && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 13, lineHeight: 1.6 }}>
              This code grants access to your files and text. Paste it into the
              9t Android app; it is only displayed now. Use HTTPS or a trusted
              local connection when creating it.
            </p>
            <textarea
              readOnly
              aria-label="Device pairing code"
              value={code}
              rows={5}
              style={{
                width: "100%",
                margin: "12px 0",
                padding: 12,
                wordBreak: "break-all",
                border: "1px solid var(--line)",
                borderRadius: 10,
                background: "var(--bg)",
                color: "var(--ink)",
              }}
            />
            <button
              onClick={() =>
                navigator.clipboard
                  .writeText(code)
                  .then(() => setMessage("Pairing code copied."))
                  .catch(() => setMessage("Select and copy the code manually."))
              }
              style={primary}
            >
              Copy pairing code
            </button>
            <button
              onClick={() => setCode("")}
              style={{ marginLeft: 12, background: "transparent", color: "var(--muted)" }}
            >
              Hide code
            </button>
          </div>
        )}
      </section>

      <p role="status" style={{ minHeight: 24 }}>{message}</p>

      <h2>Paired devices</h2>
      {!devices.length && <p style={{ color: "var(--muted)" }}>No devices paired yet.</p>}
      {devices.map((d) => (
        <section
          key={d.id}
          style={{
            background: "var(--paper)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: "16px 20px",
            margin: "10px 0",
            display: "flex",
            gap: 20,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <strong>{d.name}</strong>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted)" }}>
              {d.lastSeenAt
                ? `Last connected ${new Date(d.lastSeenAt).toLocaleString()}`
                : "Waiting for first connection"}
            </p>
          </div>
          <button
            disabled={busy}
            onClick={() => revoke(d.id)}
            style={{ background: "transparent", color: "var(--danger)", fontWeight: 600 }}
          >
            Disconnect
          </button>
        </section>
      ))}
      <p style={{ marginTop: 28, lineHeight: 1.7, color: "var(--muted)", fontSize: 13 }}>
        The LAN address must reach the same 9t installation as your public
        address. A cloud server is not on your home Wi-Fi: use a local
        installation or a private VPN route to it. The app encrypts transfer
        contents on both routes.
      </p>
    </main>
  );
}
