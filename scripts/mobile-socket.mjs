import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { watch } from "node:fs";
import { dirname, basename } from "node:path";
import { WebSocketServer, WebSocket } from "ws";

// Separate AAD namespace from HTTP RPC; a fresh challenge binds every socket session.
export function sealSocket(key, aad, value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]);
  return { iv: iv.toString("base64"), data: data.toString("base64") };
}
export function openSocket(key, aad, envelope) {
  if (typeof envelope?.iv !== "string" || typeof envelope?.data !== "string") throw Error("Envelope");
  const iv = Buffer.from(envelope.iv, "base64"), data = Buffer.from(envelope.data, "base64");
  if (iv.length !== 12 || data.length < 16) throw Error("Envelope");
  const cipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  cipher.setAAD(Buffer.from(aad));
  cipher.setAuthTag(data.subarray(-16));
  return JSON.parse(Buffer.concat([cipher.update(data.subarray(0, -16)), cipher.final()]).toString());
}

// Read-only observer of the store's atomic renames. Never keeps a second mutable database.
// Runs in the custom server, independent of Next's route module/bundling boundaries.
export function attachMobileSocket(server, dbPath, { heartbeatMs = 20000, authTimeoutMs = 10000 } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  const clients = new Map();
  let observer, timer, reading = false, dirty = false, closed = false;

  const read = async () => JSON.parse(await readFile(dbPath, "utf8"));
  const revision = (data) => createHash("sha256")
    .update(JSON.stringify([data.objects, data.config?.modules])).digest("hex");
  const send = (ws, state, type, rev) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 16384) { ws.terminate(); return; }
    ws.send(JSON.stringify(sealSocket(state.key, `${state.aad}:event:${state.clientNonce}`, {
      type, sequence: ++state.sequence, revision: rev, serverTime: Date.now(),
    })));
    state.revision = rev;
  };
  async function refresh(heartbeat = false) {
    if (closed) return;
    if (reading) { dirty = true; return; }
    reading = true;
    try {
      const data = await read(), rev = revision(data);
      for (const [ws, state] of clients) {
        if (!state.key) continue;
        if (data.instanceId !== state.instance || data.devices?.[state.id]?.key !== state.key) {
          ws.close(4003, "Pairing revoked");
        } else if (state.revision !== rev || heartbeat) {
          send(ws, state, state.revision !== rev ? "changed" : "heartbeat", rev);
        }
      }
    } catch {
      // Fail closed if the authoritative database becomes unavailable/corrupt.
      for (const [ws, state] of clients) if (state.key) ws.close(1011, "Store unavailable");
    } finally {
      reading = false;
      if (dirty) { dirty = false; queueMicrotask(() => refresh()); }
    }
  }
  function observe() {
    if (observer || closed) return;
    try {
      observer = watch(dirname(dbPath), (event, file) => {
        if (file && file.toString() !== basename(dbPath)) return;
        clearTimeout(timer);
        timer = setTimeout(() => refresh(), 25);
      });
      observer.on("error", () => { observer.close(); observer = undefined; });
    } catch { /* Initial manual setup may not have created its data directory yet. */ }
  }
  observe();
  const heartbeat = setInterval(() => {
    observe();
    for (const [ws, state] of clients) {
      if (!state.alive) { ws.terminate(); continue; }
      state.alive = false;
      ws.ping();
    }
    // Also detects changes missed by OS file watching, without phone-side HTTP polling.
    void refresh(true);
  }, heartbeatMs);
  heartbeat.unref();
  const upgrade = (req, socket, head) => {
    if (req.url !== "/api/mobile/socket") return;
    if (closed || wss.clients.size >= 128) {
      socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n"); return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  };
  server.on("upgrade", upgrade);
  wss.on("connection", (ws) => {
    const challenge = randomBytes(32).toString("base64url");
    const state = { challenge, sequence: 0, alive: true, authenticating: false };
    clients.set(ws, state);
    const timeout = setTimeout(() => ws.terminate(), authTimeoutMs);
    ws.on("error", () => {});
    ws.on("pong", () => { state.alive = true; });
    ws.on("close", () => { clearTimeout(timeout); clients.delete(ws); });
    ws.send(JSON.stringify({ type: "challenge", v: 1, challenge }));
    ws.on("message", async (raw, binary) => {
      // Exactly one bounded client auth message. Subsequent traffic is control ping/pong only.
      if (binary || state.key || state.authenticating) { ws.close(1008, "Protocol"); return; }
      state.authenticating = true;
      try {
        const envelope = JSON.parse(raw.toString());
        if (typeof envelope.id !== "string" || !/^[a-f0-9-]{36}$/i.test(envelope.id)) throw Error("ID");
        const data = await read(), device = data.devices?.[envelope.id];
        if (!device || !data.instanceId) throw Error("Pairing");
        const aad = `9t:socket:v1:${data.instanceId}:${envelope.id}:${challenge}`;
        const body = openSocket(device.key, `${aad}:subscribe`, envelope);
        if (body.action !== "subscribe" || body.challenge !== challenge
            || typeof body.clientNonce !== "string" || !/^[a-f0-9-]{36}$/i.test(body.clientNonce)) throw Error("Challenge");
        if ([...clients.values()].filter(s => s.id === envelope.id).length >= 3) throw Error("Limit");
        if (ws.readyState !== WebSocket.OPEN) return;
        Object.assign(state, { key: device.key, id: envelope.id, instance: data.instanceId, aad, clientNonce: body.clientNonce });
        clearTimeout(timeout);
        send(ws, state, "ready", revision(data));
        // Covers a revoke/change racing the asynchronous authentication read.
        void refresh();
      } catch { ws.close(4003, "Authentication failed"); }
    });
  });
  return async () => {
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(timer);
    observer?.close();
    server.off("upgrade", upgrade);
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
  };
}
