-- 9t 001_init — PostgreSQL schema (whitepaper §10 + runtime needs).
-- Single-user release uses atomic JSON today; this schema is the migration
-- target. Devices/sessions/tokens/config all live here so a future cutover
-- moves the whole store, not just objects.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Singleton row (id = 1): workspace config + instance identity.
CREATE TABLE IF NOT EXISTS app_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  instance_id TEXT,
  initialized BOOLEAN NOT NULL DEFAULT false,
  modules JSONB NOT NULL DEFAULT '{"snippets":true,"files":true,"links":true,"board":false}',
  exposure TEXT NOT NULL DEFAULT 'public' CHECK (exposure IN ('lan','public','hybrid')),
  domain TEXT,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  max_size_mb INTEGER NOT NULL DEFAULT 500 CHECK (max_size_mb BETWEEN 1 AND 2048),
  trash_retention_days INTEGER NOT NULL DEFAULT 7 CHECK (trash_retention_days BETWEEN 0 AND 365)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('snippet','file','link','board')),
  name TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  owner_scope UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objects_sweep ON objects (deleted_at, expires_at)
  WHERE deleted_at IS NOT NULL OR expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_objects_listing ON objects (type, pinned, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS snippet_details (
  object_id UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  language TEXT,
  content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_details (
  object_id UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS link_details (
  object_id UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS board_layout (
  object_id UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shares_token ON shares (token);

-- Paired phones. Key material is required for encrypted RPC; protect backups.
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS api_tokens (
  name TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
