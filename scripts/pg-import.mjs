#!/usr/bin/env node
// 9t pg-import — one-time copy of data/9t.json into Postgres.
// Run `npm run migrate` first. Refuses to overwrite a non-empty database
// unless --force is given. File blobs stay in NINE_T_DATA_DIR/objects;
// only metadata moves. JSON files are left untouched.
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import pg from "pg";

const force = process.argv.includes("--force");
const url = process.env.NINE_T_DATABASE_URL;
if (!url) {
  console.error("9t: set NINE_T_DATABASE_URL first. Nothing was changed.");
  process.exitCode = 1;
} else {
  const root = process.env.NINE_T_DATA_DIR
    ? resolve(process.env.NINE_T_DATA_DIR)
    : join(process.cwd(), "data");
  const data = JSON.parse(await readFile(join(root, "9t.json"), "utf8"));
  const pool = new pg.Pool({ connectionString: url });
  const OWNER = "00000000-0000-0000-0000-000000000001";
  try {
    const { rows } = await pool.query(
      "SELECT (SELECT count(*) FROM objects) AS objects, (SELECT count(*) FROM users) AS users",
    );
    if ((Number(rows[0].objects) || Number(rows[0].users)) && !force)
      throw new Error(
        "Postgres already holds data. Re-run with --force to overwrite.",
      );
    await pool.query("BEGIN");
    try {
      await pool.query("DELETE FROM shares");
      await pool.query("DELETE FROM objects");
      await pool.query("DELETE FROM sessions");
      await pool.query("DELETE FROM api_tokens");
      await pool.query("DELETE FROM devices");
      await pool.query("DELETE FROM users WHERE id = $1", [OWNER]);
      const c = data.config;
      await pool.query(
        `INSERT INTO app_config (id, instance_id, initialized, modules, exposure, domain, theme, max_size_mb, trash_retention_days)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET instance_id = EXCLUDED.instance_id, initialized = EXCLUDED.initialized,
           modules = EXCLUDED.modules, exposure = EXCLUDED.exposure, domain = EXCLUDED.domain,
           theme = EXCLUDED.theme, max_size_mb = EXCLUDED.max_size_mb,
           trash_retention_days = EXCLUDED.trash_retention_days`,
        [
          data.instanceId ?? null,
          c.initialized,
          JSON.stringify(c.modules),
          c.exposure,
          c.domain ?? null,
          c.theme,
          c.maxSizeMb,
          c.trashRetentionDays,
        ],
      );
      if (data.user)
        await pool.query(
          "INSERT INTO users (id, username, password_hash, password_salt) VALUES ($1, $2, $3, $4)",
          [OWNER, data.user.username, data.user.passwordHash, data.user.salt],
        );
      for (const [hash, s] of Object.entries(data.sessions || {}))
        await pool.query(
          "INSERT INTO sessions (hash, device_id, expires_at) VALUES ($1, $2, $3)",
          [hash, s.deviceId ?? null, s.expiresAt],
        );
      for (const [name, t] of Object.entries(data.apiTokens || {}))
        await pool.query(
          "INSERT INTO api_tokens (name, hash, created_at, last_used_at) VALUES ($1, $2, $3, $4)",
          [name, t.hash, t.createdAt, t.lastUsedAt ?? null],
        );
      for (const [id, dv] of Object.entries(data.devices || {}))
        await pool.query(
          "INSERT INTO devices (id, name, key, created_at, last_seen_at) VALUES ($1, $2, $3, $4, $5)",
          [id, dv.name, dv.key, dv.createdAt, dv.lastSeenAt ?? null],
        );
      for (const o of data.objects || []) {
        await pool.query(
          "INSERT INTO objects (id, type, name, pinned, expires_at, deleted_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
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
        if (o.type === "snippet")
          await pool.query(
            "INSERT INTO snippet_details (object_id, language, content) VALUES ($1, $2, $3)",
            [o.id, o.language ?? null, o.content ?? ""],
          );
        else if (o.type === "file")
          await pool.query(
            "INSERT INTO file_details (object_id, mime_type, size_bytes, storage_key) VALUES ($1, $2, $3, $4)",
            [o.id, o.mimeType ?? null, o.sizeBytes ?? 0, o.storageKey ?? ""],
          );
        else if (o.type === "link")
          await pool.query("INSERT INTO link_details (object_id, url) VALUES ($1, $2)", [
            o.id,
            o.url ?? "",
          ]);
        if (o.board)
          await pool.query("INSERT INTO board_layout (object_id, x, y) VALUES ($1, $2, $3)", [
            o.id,
            o.board.x,
            o.board.y,
          ]);
      }
      for (const [id, s] of Object.entries(data.shares || {}))
        await pool.query(
          "INSERT INTO shares (id, object_id, token, password_hash, password_salt, access_count, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
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
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
    console.log(
      `imported ${(data.objects || []).length} objects, ${Object.keys(data.shares || {}).length} shares`,
    );
  } finally {
    await pool.end();
  }
}
