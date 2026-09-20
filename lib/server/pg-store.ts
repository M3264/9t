import { randomUUID } from "crypto";
import { unlink } from "fs/promises";
import path from "path";
import type { PoolClient } from "pg";
import { pgPool } from "./pg";
import { uploadDir } from "./store";
import { delBlob, validStorageKey } from "./storage";
import type { ApiToken, Data, NineTObject, Share } from "./store";

// Postgres backend for the document store. It implements the same
// readData/mutate contract as the JSON store so routes need no changes;
// selection happens in lib/server/db.ts via NINE_T_DATABASE_URL.
// File blobs stay on the filesystem (uploadDir) — only metadata moves to SQL.

// Single-user release: the owner row uses a fixed id so the schemaless
// JSON user object maps 1:1 without inventing identities.
const OWNER_ID = "00000000-0000-0000-0000-000000000001";
// Serializes mutations across processes the way the JSON queue serializes
// them in-process.
const STORE_LOCK = 727542287;

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v);
const isoOrUndefined = (v: unknown): string | undefined =>
  v === null || v === undefined ? undefined : iso(v);

type DbConfig = Data["config"];

async function readAll(client: PoolClient): Promise<Data> {
  const [
    configRows,
    userRows,
    sessionRows,
    tokenRows,
    deviceRows,
    objectRows,
    snippetRows,
    fileRows,
    linkRows,
    boardRows,
    shareRows,
  ] = await Promise.all([
    client.query("SELECT * FROM app_config WHERE id = 1"),
    client.query("SELECT * FROM users WHERE id = $1", [OWNER_ID]),
    client.query("SELECT * FROM sessions"),
    client.query("SELECT * FROM api_tokens"),
    client.query("SELECT * FROM devices"),
    client.query("SELECT * FROM objects ORDER BY created_at DESC"),
    client.query("SELECT * FROM snippet_details"),
    client.query("SELECT * FROM file_details"),
    client.query("SELECT * FROM link_details"),
    client.query("SELECT * FROM board_layout"),
    client.query("SELECT * FROM shares"),
  ]);

  const snippets = new Map(snippetRows.rows.map((r) => [r.object_id, r]));
  const files = new Map(fileRows.rows.map((r) => [r.object_id, r]));
  const links = new Map(linkRows.rows.map((r) => [r.object_id, r]));
  const boards = new Map(boardRows.rows.map((r) => [r.object_id, r]));

  const objects: NineTObject[] = objectRows.rows.map((r) => {
    const o: NineTObject = {
      id: r.id,
      type: r.type,
      name: r.name,
      pinned: r.pinned,
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
    };
    const s = snippets.get(r.id);
    if (s) {
      o.content = s.content;
      if (s.language) o.language = s.language;
    }
    const f = files.get(r.id);
    if (f) {
      o.mimeType = f.mime_type;
      o.sizeBytes = Number(f.size_bytes);
      o.storageKey = f.storage_key;
    }
    const l = links.get(r.id);
    if (l) o.url = l.url;
    const b = boards.get(r.id);
    if (b) o.board = { x: Number(b.x), y: Number(b.y) };
    const expires = isoOrUndefined(r.expires_at);
    if (expires) o.expiresAt = expires;
    const deleted = isoOrUndefined(r.deleted_at);
    if (deleted) o.deletedAt = deleted;
    return o;
  });

  const sessions: Data["sessions"] = {};
  for (const r of sessionRows.rows)
    sessions[r.hash] = {
      expiresAt: iso(r.expires_at),
      ...(r.device_id ? { deviceId: r.device_id } : {}),
    };

  const apiTokens: Record<string, ApiToken> = {};
  for (const r of tokenRows.rows)
    apiTokens[r.name] = {
      name: r.name,
      hash: r.hash,
      createdAt: iso(r.created_at),
      ...(r.last_used_at ? { lastUsedAt: iso(r.last_used_at) } : {}),
    };

  const devices: NonNullable<Data["devices"]> = {};
  for (const r of deviceRows.rows)
    devices[r.id] = {
      name: r.name,
      key: r.key,
      createdAt: iso(r.created_at),
      ...(r.last_seen_at ? { lastSeenAt: iso(r.last_seen_at) } : {}),
    };

  const shares: Record<string, Share> = {};
  for (const r of shareRows.rows)
    shares[r.id] = {
      id: r.id,
      token: r.token,
      objectId: r.object_id,
      createdAt: iso(r.created_at),
      ...(r.expires_at ? { expiresAt: iso(r.expires_at) } : {}),
      accessCount: Number(r.access_count),
      ...(r.password_hash ? { passwordHash: r.password_hash } : {}),
      ...(r.password_salt ? { passwordSalt: r.password_salt } : {}),
    };

  const c = configRows.rows[0];
  const config: DbConfig = c
    ? {
        initialized: c.initialized,
        modules: c.modules,
        exposure: c.exposure,
        domain: c.domain,
        theme: c.theme,
        maxSizeMb: Number(c.max_size_mb),
        trashRetentionDays: Number(c.trash_retention_days),
      }
    : {
        initialized: false,
        modules: { snippets: true, files: true, links: true, board: false },
        exposure: "public",
        domain: null,
        theme: "system",
        maxSizeMb: 500,
        trashRetentionDays: 7,
      };

  const u = userRows.rows[0];
  return {
    ...(c?.instance_id ? { instanceId: c.instance_id } : {}),
    ...(Object.keys(devices).length ? { devices } : {}),
    config,
    ...(u
      ? {
          user: {
            username: u.username,
            passwordHash: u.password_hash,
            salt: u.password_salt,
          },
        }
      : {}),
    sessions,
    apiTokens,
    objects,
    shares,
  };
}

async function writeConfig(client: PoolClient, d: Data) {
  const c = d.config;
  await client.query(
    `INSERT INTO app_config (id, instance_id, initialized, modules, exposure, domain, theme, max_size_mb, trash_retention_days)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       instance_id = EXCLUDED.instance_id, initialized = EXCLUDED.initialized,
       modules = EXCLUDED.modules, exposure = EXCLUDED.exposure,
       domain = EXCLUDED.domain, theme = EXCLUDED.theme,
       max_size_mb = EXCLUDED.max_size_mb,
       trash_retention_days = EXCLUDED.trash_retention_days`,
    [
      d.instanceId ?? null,
      c.initialized,
      JSON.stringify(c.modules),
      c.exposure,
      c.domain ?? null,
      c.theme,
      c.maxSizeMb,
      c.trashRetentionDays,
    ],
  );
}

async function writeUser(
  client: PoolClient,
  before?: Data["user"],
  after?: Data["user"],
) {
  const a = JSON.stringify(after ?? null),
    b = JSON.stringify(before ?? null);
  if (a === b) return;
  if (!after) {
    await client.query("DELETE FROM users WHERE id = $1", [OWNER_ID]);
    return;
  }
  await client.query(
    `INSERT INTO users (id, username, password_hash, password_salt)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       username = EXCLUDED.username, password_hash = EXCLUDED.password_hash,
       password_salt = EXCLUDED.password_salt`,
    [OWNER_ID, after.username, after.passwordHash, after.salt],
  );
}

async function writeKeyed<V>(
  client: PoolClient,
  table: "sessions" | "api_tokens" | "devices",
  before: Record<string, V>,
  after: Record<string, V>,
  upsert: (key: string, value: V) => Promise<void>,
) {
  for (const key of Object.keys(before))
    if (!(key in after)) {
      const col = table === "sessions" ? "hash" : table === "devices" ? "id" : "name";
      await client.query(`DELETE FROM ${table} WHERE ${col} = $1`, [key]);
    }
  for (const [key, value] of Object.entries(after))
    if (JSON.stringify(value) !== JSON.stringify(before[key]))
      await upsert(key, value);
}

async function writeObject(client: PoolClient, o: NineTObject) {
  await client.query(
    `INSERT INTO objects (id, type, name, pinned, expires_at, deleted_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       type = EXCLUDED.type, name = EXCLUDED.name, pinned = EXCLUDED.pinned,
       expires_at = EXCLUDED.expires_at, deleted_at = EXCLUDED.deleted_at,
       created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
    [
      o.id,
      o.type,
      o.name,
      o.pinned,
      o.expiresAt ?? null,
      o.deletedAt ?? null,
      o.createdAt,
      o.updatedAt,
    ],
  );
  // Details are rewritten wholesale per object — types never change in place,
  // and this keeps exactly one detail row without cross-table bookkeeping.
  await client.query("DELETE FROM snippet_details WHERE object_id = $1", [o.id]);
  await client.query("DELETE FROM file_details WHERE object_id = $1", [o.id]);
  await client.query("DELETE FROM link_details WHERE object_id = $1", [o.id]);
  await client.query("DELETE FROM board_layout WHERE object_id = $1", [o.id]);
  if (o.type === "snippet")
    await client.query(
      "INSERT INTO snippet_details (object_id, language, content) VALUES ($1, $2, $3)",
      [o.id, o.language ?? null, o.content ?? ""],
    );
  else if (o.type === "file")
    await client.query(
      "INSERT INTO file_details (object_id, mime_type, size_bytes, storage_key) VALUES ($1, $2, $3, $4)",
      [o.id, o.mimeType ?? null, o.sizeBytes ?? 0, o.storageKey ?? ""],
    );
  else if (o.type === "link")
    await client.query("INSERT INTO link_details (object_id, url) VALUES ($1, $2)", [
      o.id,
      o.url ?? "",
    ]);
  if (o.board)
    await client.query("INSERT INTO board_layout (object_id, x, y) VALUES ($1, $2, $3)", [
      o.id,
      o.board.x,
      o.board.y,
    ]);
}

export async function readData(): Promise<Data> {
  const client = await pgPool().connect();
  try {
    return await readAll(client);
  } finally {
    client.release();
  }
}

export async function mutate<T>(fn: (data: Data) => T | Promise<T>): Promise<T> {
  const pool = pgPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [STORE_LOCK]);
    const data = await readAll(client);
    const before: Data = JSON.parse(JSON.stringify(data));
    const result = await fn(data);
    if (JSON.stringify(data.config) !== JSON.stringify(before.config))
      await writeConfig(client, data);
    await writeUser(client, before.user, data.user);
    await writeKeyed(
      client,
      "sessions",
      before.sessions,
      data.sessions,
      async (hash, s) => {
        await client.query(
          `INSERT INTO sessions (hash, device_id, expires_at) VALUES ($1, $2, $3)
           ON CONFLICT (hash) DO UPDATE SET device_id = EXCLUDED.device_id, expires_at = EXCLUDED.expires_at`,
          [hash, s.deviceId ?? null, s.expiresAt],
        );
      },
    );
    await writeKeyed(
      client,
      "api_tokens",
      before.apiTokens || {},
      data.apiTokens || {},
      async (name, t) => {
        await client.query(
          `INSERT INTO api_tokens (name, hash, created_at, last_used_at) VALUES ($1, $2, $3, $4)
           ON CONFLICT (name) DO UPDATE SET hash = EXCLUDED.hash, created_at = EXCLUDED.created_at, last_used_at = EXCLUDED.last_used_at`,
          [name, t.hash, t.createdAt, t.lastUsedAt ?? null],
        );
      },
    );
    await writeKeyed(
      client,
      "devices",
      before.devices || {},
      data.devices || {},
      async (id, dv) => {
        await client.query(
          `INSERT INTO devices (id, name, key, created_at, last_seen_at) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, key = EXCLUDED.key,
             created_at = EXCLUDED.created_at, last_seen_at = EXCLUDED.last_seen_at`,
          [id, dv.name, dv.key, dv.createdAt, dv.lastSeenAt ?? null],
        );
      },
    );
    const beforeObjects = new Map(before.objects.map((o) => [o.id, o]));
    const afterObjects = new Map(data.objects.map((o) => [o.id, o]));
    const deleted = [...beforeObjects.keys()].filter((id) => !afterObjects.has(id));
    if (deleted.length)
      await client.query("DELETE FROM objects WHERE id = ANY($1)", [deleted]);
    for (const [id, o] of afterObjects)
      if (JSON.stringify(o) !== JSON.stringify(beforeObjects.get(id)))
        await writeObject(client, o);
    const beforeShares = before.shares,
      afterShares = data.shares;
    for (const id of Object.keys(beforeShares))
      if (!(id in afterShares)) await client.query("DELETE FROM shares WHERE id = $1", [id]);
    for (const [id, s] of Object.entries(afterShares))
      if (JSON.stringify(s) !== JSON.stringify(beforeShares[id]))
        await client.query(
          `INSERT INTO shares (id, object_id, token, password_hash, password_salt, access_count, expires_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET object_id = EXCLUDED.object_id, token = EXCLUDED.token,
             password_hash = EXCLUDED.password_hash, password_salt = EXCLUDED.password_salt,
             access_count = EXCLUDED.access_count, expires_at = EXCLUDED.expires_at,
             created_at = EXCLUDED.created_at`,
          [
            id,
            s.objectId,
            s.token,
            s.passwordHash ?? null,
            s.passwordSalt ?? null,
            s.accessCount,
            s.expiresAt ?? null,
            s.createdAt,
          ],
        );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function addObject(
  input: Omit<NineTObject, "id" | "createdAt" | "updatedAt" | "pinned">,
) {
  const now = new Date().toISOString();
  const obj: NineTObject = {
    ...input,
    id: randomUUID(),
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
  await mutate((d) => d.objects.unshift(obj));
  return obj;
}

export async function purgeObject(id: string) {
  await mutate(async (d) => {
    const obj = d.objects.find((x) => x.id === id);
    if (obj?.storageKey && validStorageKey(obj.storageKey))
      await delBlob(obj.storageKey).catch(() => {});
    else if (obj?.storageKey)
      await unlink(path.join(uploadDir, path.basename(obj.storageKey))).catch(
        () => {},
      );
    d.objects = d.objects.filter((x) => x.id !== id);
  });
}

export async function sweepExpired() {
  const now = Date.now(),
    d = await readData();
  const expired = d.objects
    .filter(
      (o) =>
        (o.expiresAt && Date.parse(o.expiresAt) <= now) ||
        (o.deletedAt &&
          Date.parse(o.deletedAt) + d.config.trashRetentionDays * 864e5 <= now),
    )
    .map((o) => o.id);
  for (const id of expired) await purgeObject(id);
  await mutate((data) => {
    for (const [key, share] of Object.entries(data.shares))
      if (
        expired.includes(share.objectId) ||
        (share.expiresAt && Date.parse(share.expiresAt) <= now)
      )
        delete data.shares[key];
  });
  return expired.length;
}
