"use client";
import { useEffect, useState } from "react";
type Device = {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt?: string;
};
export default function DeviceManager() {
  const [devices, setDevices] = useState<Device[]>([]),
    [name, setName] = useState("My Android phone");
  const [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch("/api/devices");
    if (!r.ok)
      throw new Error("Could not load devices. Sign in and try again.");
    setDevices((await r.json()).devices);
  }
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
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
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px" }}>
      <a href="/">← Workspace</a>
      <p style={{ marginTop: 40, color: "#5a7567" }}>9t / CONNECTED DEVICES</p>
      <h1 style={{ fontSize: "clamp(32px, 6vw, 48px)", margin: "12px 0" }}>
        Your workspace. In your pocket.
      </h1>
      <p style={{ lineHeight: 1.7 }}>
        Pair the Android app to save incoming files directly to Downloads/9t and
        copy new snippets to your phone. Add a LAN address in the app for
        transfers without internet.
      </p>
      <p style={{ marginTop: 20 }}>
        <a
          href="/downloads/9t-android-0.2.1.apk"
          download
          style={{ color: "#28533f", fontWeight: 700 }}
        >
          Download 9t for Android · v0.2.1
        </a>
        <br />
        <small>
          Android 10 or newer. Includes the full workspace and native receiving.
        </small>
      </p>
      <section
        style={{
          background: "var(--surface, #fff)",
          border: "1px solid #b9c6bc",
          borderRadius: 20,
          padding: 24,
          margin: "28px 0",
        }}
      >
        <h2>Pair a phone</h2>
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
            }}
          />
        </label>
        <button
          disabled={busy}
          onClick={pair}
          style={{
            padding: "12px 20px",
            background: "#244e3c",
            color: "white",
            borderRadius: 12,
          }}
        >
          Create pairing code
        </button>
        {code && (
          <div style={{ marginTop: 20 }}>
            <p>
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
              }}
            />
            <button
              onClick={() =>
                navigator.clipboard
                  .writeText(code)
                  .then(() => setMessage("Pairing code copied."))
                  .catch(() => setMessage("Select and copy the code manually."))
              }
            >
              Copy pairing code
            </button>
            <button onClick={() => setCode("")} style={{ marginLeft: 20 }}>
              Hide code
            </button>
          </div>
        )}
      </section>
      <p role="status">{message}</p>
      <h2>Paired devices</h2>
      {!devices.length && <p>No devices paired yet.</p>}
      {devices.map((d) => (
        <section
          key={d.id}
          style={{
            borderBottom: "1px solid #b9c6bc",
            padding: "20px 0",
            display: "flex",
            gap: 20,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <strong>{d.name}</strong>
            <p style={{ marginTop: 6 }}>
              {d.lastSeenAt
                ? `Last connected ${new Date(d.lastSeenAt).toLocaleString()}`
                : "Waiting for first connection"}
            </p>
          </div>
          <button disabled={busy} onClick={() => revoke(d.id)}>
            Disconnect
          </button>
        </section>
      ))}
      <p style={{ marginTop: 28, lineHeight: 1.7 }}>
        The LAN address must reach the same 9t installation as your public
        address. A cloud server is not on your home Wi-Fi: use a local
        installation or a private VPN route to it. The app encrypts transfer
        contents on both routes.
      </p>
    </main>
  );
}
