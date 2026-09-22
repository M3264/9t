#!/usr/bin/env node
// 9t database migrations — applies db/migrations/*.sql in order.
// Needs NINE_T_DATABASE_URL (e.g. postgresql://9t:secret@db:5432/9t).
// Safe to re-run: each file applies once, tracked in schema_migrations.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.NINE_T_DATABASE_URL;
if (!url) {
  console.error(
    "9t: set NINE_T_DATABASE_URL first (see .env.example / compose.yaml). Nothing was changed.",
  );
  process.exitCode = 1;
} else {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
  const files = (await readdir(dir))
    .filter((n) => /^\d+_.*\.sql$/.test(n))
    .sort();
  if (!files.length) throw new Error("No migration files found.");
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const applied = new Set(
      (await pool.query("SELECT version FROM schema_migrations")).rows.map(
        (r) => r.version,
      ),
    );
    for (const file of files) {
      const version = Number(file.split("_")[0]);
      if (applied.has(version)) {
        console.log(`migrate: ${file} already applied`);
        continue;
      }
      const sql = await readFile(join(dir, file), "utf8");
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [version],
        );
        await pool.query("COMMIT");
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
      console.log(`migrate: ${file} applied`);
    }
  } finally {
    await pool.end();
  }
}
