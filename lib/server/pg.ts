import pg from "pg";

// PostgreSQL connection helper. JSON files remain the primary store until the
// repository cutover lands — this only opens a pool when NINE_T_DATABASE_URL
// is set, so unset means zero behavior change.
let pool: pg.Pool | null = null;

export function pgEnabled() {
  return !!process.env.NINE_T_DATABASE_URL;
}

export function pgPool(): pg.Pool {
  const url = process.env.NINE_T_DATABASE_URL;
  if (!url) throw new Error("NINE_T_DATABASE_URL is not set.");
  if (!pool) {
    pool = new pg.Pool({ connectionString: url });
    pool.on("error", () => {
      // Idle-client errors must not crash the server; queries report failures.
    });
  }
  return pool;
}

export async function closePgPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
