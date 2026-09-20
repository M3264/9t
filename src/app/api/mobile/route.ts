import { createHash, randomBytes, randomUUID } from "crypto";
import { mkdir, readdir, stat, unlink } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { readData, mutate } from "@/lib/server/db";
import { seal, unseal, type Envelope } from "@/lib/server/mobile-crypto";
import { getBlobStore, putBlob, validStorageKey } from "@/lib/server/storage";
import { rateLimit, rateLimitResponse } from "@/lib/server/security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const replay = new Map<string, number>();
const CHUNK = 256 * 1024;
const noStore = { "Cache-Control": "no-store" };
export async function POST(req: Request) {
  // A bounded body avoids unbounded JSON allocation before authentication.
  const reader = req.body?.getReader();
  if (!reader) return new Response("Missing body", { status: 400 });
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 1_000_000) {
      await reader.cancel();
      return new Response("Too large", { status: 413 });
    }
    chunks.push(part.value);
  }
  let envelope: Envelope & { id: string };
  try {
    envelope = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return new Response("Invalid request", { status: 400 });
  }
  if (
    typeof envelope.id !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.data !== "string"
  )
    return new Response("Invalid request", { status: 400 });
  const d = await readData(),
    device = d.devices?.[envelope.id];
  if (!device || !d.instanceId)
    return new Response("Pair this device again", { status: 401 });
  const limit = rateLimit(`mobile:${envelope.id}`, 600, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
  const aad = `9t:v1:${d.instanceId}:${envelope.id}`;
  let body: Record<string, any>;
  try {
    body = unseal(device.key, `${aad}:request`, envelope) as Record<
      string,
      any
    >;
  } catch {
    return new Response("Authentication failed", { status: 401 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.requestId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(body.requestId) ||
    typeof body.timestamp !== "number" ||
    Math.abs(Date.now() - body.timestamp) > 300_000
  )
    return new Response("Check phone date and time", { status: 401 });
  const now = Date.now();
  for (const [k, expiry] of replay) if (expiry < now) replay.delete(k);
  const replayKey = `${envelope.id}:${body.requestId}`;
  if (replay.has(replayKey))
    return new Response("Replay rejected", { status: 409 });
  if (replay.size > 20000) return new Response("Busy", { status: 503 });
  replay.set(replayKey, now + 600_000);
  const reply = (value: unknown) =>
    Response.json(
      seal(device.key, `${aad}:response:${body.requestId}`, value),
      { headers: noStore },
    );
  if (!device.lastSeenAt || now - Date.parse(device.lastSeenAt) > 60_000) {
    await mutate((data) => {
      if (data.devices?.[envelope.id])
        data.devices[envelope.id].lastSeenAt = new Date().toISOString();
    });
  }
  const visible = d.objects.filter(
    (o) =>
      !o.deletedAt &&
      (!o.expiresAt || Date.parse(o.expiresAt) > now) &&
      d.config.modules[
        o.type === "snippet"
          ? "snippets"
          : o.type === "file"
            ? "files"
            : "links"
      ],
  );
  if (body.action === "webSession") {
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const valid = await mutate((data) => {
      if (!data.devices?.[envelope.id]) return false;
      for (const [id, session] of Object.entries(data.sessions))
        if (Date.parse(session.expiresAt) <= now) delete data.sessions[id];
      data.sessions[hash] = {
        expiresAt: new Date(now + 3600_000).toISOString(),
        deviceId: envelope.id,
      };
      return true;
    });
    if (!valid) return new Response("Device revoked", { status: 401 });
    return reply({ token });
  }
  if (body.action === "sync") {
    // ID pagination is stable across inserts. Every pass starts at the beginning;
    // the client keeps durable per-object revisions, not a lossy timestamp cursor.
    const items = visible
      .filter((o) => typeof body.after !== "string" || o.id > body.after)
      .sort((a, b) => a.id.localeCompare(b.id));
    const page = items
      .slice(0, 100)
      .map(({ storageKey: _key, content: _content, ...o }) => o);
    return reply({
      objects: page,
      next: items.length > 100 ? page[page.length - 1].id : null,
      serverTime: new Date().toISOString(),
    });
  }
  if (body.action === "text") {
    const o = visible.find((o) => o.id === body.objectId && o.type !== "file");
    if (!o) return reply({ error: "Item no longer available", code: 404 });
    return reply({
      id: o.id,
      revision: o.updatedAt,
      content: o.type === "link" ? o.url : o.content,
      type: o.type,
    });
  }
  if (body.action === "file") {
    const o = visible.find((o) => o.id === body.objectId && o.type === "file");
    if (!o?.storageKey)
      return reply({ error: "File no longer available", code: 404 });
    if (body.revision !== o.updatedAt)
      return reply({ error: "File changed; sync again", code: 409 });
    const offset = body.offset;
    if (!Number.isSafeInteger(offset) || offset < 0)
      return reply({ error: "Invalid offset", code: 400 });
    if (!validStorageKey(o.storageKey))
      return reply({ error: "File unavailable", code: 404 });
    // Blobs are immutable after upload, so the stored size bounds offsets
    // before touching the blob store (either driver).
    if (typeof o.sizeBytes === "number" && offset > o.sizeBytes)
      return reply({ error: "Invalid offset", code: 400 });
    try {
      const { body: buffer, total } = await getBlobStore().get(o.storageKey, {
        offset,
        length: CHUNK,
      });
      return reply({
        offset,
        total,
        data: buffer.toString("base64"),
        done: offset + buffer.length === total,
      });
    } catch {
      return reply({ error: "File unavailable", code: 404 });
    }
  }
  if (body.action === "sendText") {
    if (body.kind !== "link" && !d.config.modules.snippets)
      return reply({ error: "Snippets are disabled", code: 403 });
    if (
      typeof body.content !== "string" ||
      !body.content.trim() ||
      body.content.length > 100_000 ||
      typeof body.transferId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(body.transferId)
    )
      return reply({ error: "Invalid text transfer", code: 400 });
    // A deterministic UUID makes retries idempotent across response loss/restarts.
    const hash = createHash("sha256")
      .update(`${envelope.id}:${body.transferId}`)
      .digest("hex");
    const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    if (body.kind === "link") {
      if (!d.config.modules.links)
        return reply({ error: "Links are disabled", code: 403 });
      const rawUrl = typeof body.url === "string" ? body.url : "";
      if (rawUrl.length > 2048)
        return reply({ error: "URL too long", code: 400 });
      let link: string;
      try {
        const parsed = new URL(rawUrl);
        if (!["http:", "https:"].includes(parsed.protocol))
          throw new Error("bad protocol");
        link = parsed.toString();
      } catch {
        return reply({ error: "Enter a valid URL", code: 400 });
      }
      const name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 200)
          : new URL(link).hostname;
      await mutate((data) => {
        if (data.objects.some((o) => o.id === id)) return;
        const date = new Date().toISOString();
        data.objects.unshift({
          id,
          type: "link",
          name,
          url: link,
          pinned: false,
          createdAt: date,
          updatedAt: date,
        });
      });
      return reply({ ok: true, id });
    }
    await mutate((data) => {
      if (data.objects.some((o) => o.id === id)) return;
      const date = new Date().toISOString();
      data.objects.unshift({
        id,
        type: "snippet",
        name: body.content.trim().slice(0, 80),
        content: body.content,
        language: "text",
        pinned: false,
        createdAt: date,
        updatedAt: date,
      });
    });
    return reply({ ok: true, id });
  }
  const transferId =
    typeof body.transferId === "string" &&
    /^[a-f0-9-]{36}$/i.test(body.transferId)
      ? body.transferId
      : null;
  // Phone file uploads are staged locally in chunks, then stored once complete.
  // The object itself is only created at done, so aborted uploads leave no trace.
  const stageDir = path.join(
    process.env.NINE_T_DATA_DIR
      ? path.resolve(process.env.NINE_T_DATA_DIR)
      : path.join(process.cwd(), "data"),
    "tmp",
    "uploads",
  );
  const stagePath = (tid: string) => path.join(stageDir, `${tid}.part`);
  const stagedLength = async (tid: string) => {
    try {
      return (await stat(stagePath(tid))).size;
    } catch {
      return 0;
    }
  };
  const uploadId = (tid: string) => {
    const h = createHash("sha256").update(`${envelope.id}:${tid}`).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };
  if (body.action === "sendFileInit") {
    if (!d.config.modules.files)
      return reply({ error: "Files are disabled", code: 403 });
    if (!transferId)
      return reply({ error: "Invalid transfer", code: 400 });
    const maxBytes = d.config.maxSizeMb * 1024 * 1024;
    const sizeBytes = body.sizeBytes;
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes)
      return reply({ error: `File must be 1–${d.config.maxSizeMb} MB`, code: 400 });
    // Opportunistic cleanup of uploads abandoned over a day ago.
    await mkdir(stageDir, { recursive: true });
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const entry of await readdir(stageDir).catch(() => [] as string[])) {
      if (!/^[a-f0-9-]{36}\.part$/i.test(entry)) continue;
      const full = path.join(stageDir, entry);
      try {
        if ((await stat(full)).mtimeMs < cutoff) await unlink(full).catch(() => {});
      } catch {}
    }
    const id = uploadId(transferId);
    const existing = d.objects.find((o) => o.id === id);
    if (existing)
      return reply({ ok: true, id, offset: existing.sizeBytes ?? 0, done: true });
    return reply({ ok: true, id, offset: await stagedLength(transferId) });
  }
  if (body.action === "sendFileChunk") {
    if (!transferId || !Number.isSafeInteger(body.offset) || body.offset < 0)
      return reply({ error: "Invalid chunk", code: 400 });
    if (typeof body.data !== "string" || body.data.length > 700_000)
      return reply({ error: "Invalid chunk", code: 400 });
    let raw: Buffer;
    try {
      raw = Buffer.from(body.data, "base64");
    } catch {
      return reply({ error: "Invalid chunk", code: 400 });
    }
    if (!raw.length || raw.length > 512 * 1024)
      return reply({ error: "Invalid chunk", code: 400 });
    await mkdir(stageDir, { recursive: true });
    const current = await stagedLength(transferId);
    if (current !== body.offset)
      return reply({ error: "Out-of-order chunk; resume", code: 409, offset: current });
    const { writeFile } = await import("fs/promises");
    await writeFile(stagePath(transferId), raw, { flag: "a" });
    return reply({ ok: true, offset: current + raw.length });
  }
  if (body.action === "sendFileDone") {
    if (!transferId)
      return reply({ error: "Invalid transfer", code: 400 });
    if (!d.config.modules.files)
      return reply({ error: "Files are disabled", code: 403 });
    const maxBytes = d.config.maxSizeMb * 1024 * 1024;
    const sizeBytes = body.sizeBytes;
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes)
      return reply({ error: `File must be 1–${d.config.maxSizeMb} MB`, code: 400 });
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 200)
        : "phone-upload";
    const mimeType =
      typeof body.mimeType === "string" && body.mimeType.length <= 128
        ? body.mimeType
        : "application/octet-stream";
    const id = uploadId(transferId);
    if (d.objects.some((o) => o.id === id)) {
      await unlink(stagePath(transferId)).catch(() => {});
      return reply({ ok: true, id });
    }
    if ((await stagedLength(transferId)) !== sizeBytes)
      return reply({
        error: "Upload incomplete; resume",
        code: 409,
        offset: await stagedLength(transferId),
      });
    const storageKey = randomUUID();
    const { createReadStream } = await import("fs");
    await putBlob(
      storageKey,
      createReadStream(stagePath(transferId)) as unknown as NodeJS.ReadableStream,
      { size: sizeBytes, contentType: mimeType },
    );
    await unlink(stagePath(transferId)).catch(() => {});
    await mutate((data) => {
      if (data.objects.some((o) => o.id === id)) return;
      const date = new Date().toISOString();
      data.objects.unshift({
        id,
        type: "file",
        name,
        mimeType,
        sizeBytes,
        storageKey,
        pinned: false,
        createdAt: date,
        updatedAt: date,
      });
    });
    return reply({ ok: true, id });
  }
  if (body.action === "sendFileAbort") {
    if (!transferId)
      return reply({ error: "Invalid transfer", code: 400 });
    await unlink(stagePath(transferId)).catch(() => {});
    return reply({ ok: true });
  }
  return reply({ error: "Unknown action", code: 400 });
}
