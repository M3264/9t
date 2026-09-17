# 9t

**The Self-Hosted, Fully Configurable Internet Workspace**

Version 0.2 — Revised Product & Technical Whitepaper

---

## 1. Overview

9t is a self-hosted personal workspace for storing, moving, and accessing files, code snippets, links, and (optionally) a personal dashboard/board — from any device, on your own infrastructure, exposed however much or little you choose.

Core promise:

> **Put it in 9t. Get it anywhere — on your terms.**

Where the original concept (v0.1) was a fixed "workspace with objects," 9t v0.2's differentiator is **configurability of identity, not just settings**: the tool reshapes itself into a dev snippet-mover, a personal Dropbox, or a personal dashboard homepage — or all three — based on what modules are turned on. Infra exposure (LAN-only vs. public vs. hybrid) is a first-class, guided decision, not an afterthought bolted on with a `.env` file.

---

## 2. Problem

Moving information between your own devices — an APK, a config file, an SSH command, a URL, a note — is more annoying than it should be. Typical workarounds (USB, email-to-self, Telegram Saved Messages, Google Drive) all involve friction, third-party trust, or both.

Existing self-hosted alternatives (Filestash, Syncthing, generic pastebins) each solve one slice of this well but force you into being either a "files" tool, a "snippets" tool, or a "notes" tool. 9t's bet is that **one person's actual workflow is usually a mix of all three**, and the tool should let them configure exactly which mix they need — nothing more.

---

## 3. Product Principle

> **Anything you put into 9t should be reachable quickly from anywhere — shaped like what you actually need, not what the defaults decided you need.**

Priorities, in order: speed, simplicity, privacy, self-hosting, configurability. 9t should never become a productivity suite.

---

## 4. Unique Positioning

Three real usage patterns motivate this tool:

1. **Dev tool** — moving code/config/commands between machines. CLI-first, syntax highlighting, snippet-heavy.
2. **Personal Dropbox** — files between phone/server/laptop. Mobile upload UX, download links, QR handoff.
3. **Personal dashboard** — one homepage for your own links/notes instead of scattered across apps.

Rather than picking one, 9t treats each as a **toggleable module**. The dashboard, CLI, and API all adapt to whichever modules are active. This — plus dual LAN/public exposure with a guided, safety-first setup flow — is the actual differentiator versus existing self-hosted tools, most of which assume you want to be exposed to the internet and assume you're only one of the three user types above.

---

## 5. Deployment & Exposure Model

9t can run in three modes:

- **LAN only** — no internet exposure, auth optional (default: off, since the network itself is the trust boundary). Recommended default for first-time setup.
- **Public** — real domain, HTTPS required, auth required (cannot be disabled).
- **Hybrid** — LAN access trusted/unauthenticated, public URL requires login.

**Design rule (enforced everywhere — wizard, CLI, dashboard, and on server boot):** `auth.mode` cannot be `"none"` while `exposure.mode` is `"public"` or `"hybrid"`. This is validated in one shared function so the message is identical across every surface, and the server refuses to boot if a hand-edited config violates it.

This rule exists because of a well-documented real-world failure mode in comparable self-hosted tools: a significant fraction of self-hosted agent/tool instances end up publicly exposed with no access protection because setup wizards make "public" too easy to pick without friction. 9t's wizard makes going public a deliberate, slightly effortful choice — never a default.

### HTTPS & Domain Handling

Going public or hybrid chains directly into a domain/HTTPS flow:

1. User provides a domain (or asks 9t to explain how to get one).
2. 9t checks DNS (A record → this server's IP).
3. On success, Caddy automatically requests and renews a Let's Encrypt certificate — 9t never handles TLS termination or certificate logic itself.
4. On failure, setup continues in HTTP-only mode with a persistent dashboard warning until fixed — it never silently proceeds without surfacing the risk.

---

## 6. Modules

| Module | Purpose | Key fields |
|---|---|---|
| **Snippets** | Text/code, syntax highlighted, CLI-pushable | language, content, pinned |
| **Files** | Arbitrary file upload/download | mimeType, sizeBytes, checksum |
| **Links** | Saved URLs as first-class objects | url, favicon |
| **Board** | Personal dashboard/homepage layer | layout (x,y,w,h) over existing objects |

Board does not hold its own content — it's an arrangement layer over Snippets/Files/Links, which avoids becoming a duplicate, bloated content type.

Each module can be independently enabled/disabled. Disabling a module hides it entirely from dashboard, CLI, and API — not just visually, but from listings and validation.

---

## 7. Setup Wizard (`9t setup`)

Modeled on well-regarded patterns from other self-hosted tools with strong CLI onboarding (interactive wizard + scoped re-run + non-interactive scripting).

```
$ 9t setup

Step 1 — Modules
  Which modules do you want active? (space to toggle)
  [x] Snippets   [x] Files   [ ] Links   [ ] Board

Step 2 — Exposure
  How will this be accessed?
  > LAN only (recommended for first setup)
    Public — requires a domain + auth
    Hybrid — LAN trusted, public needs login

  [if Public/Hybrid selected →]
  ⚠ You're about to expose 9t to the internet.
    This requires auth — it cannot be skipped.

  Do you have a domain pointed at this server already?
  > Yes — I'll enter it
    No — help me set one up
    Skip — I'll configure this manually later

  [Yes →]
  Domain: 9t.example.com
  Checking DNS... ✓ A record found
  Requesting HTTPS certificate via Let's Encrypt...
  ✓ Certificate issued. 9t is live at https://9t.example.com

  Type CONFIRM to proceed with public exposure:

Step 3 — Auth
  Auth mode?
  > Required (username + password)
    None   [only offered when Exposure = LAN only]

Step 4 — Object lifetime
  Default lifetime for new objects?
  > Forever
    Expire after: 1h / 1d / 7d
  Allow per-object override? [Y/n]

Step 5 — Interface
  Dashboard layout?  > Grid    List    Terminal
  Theme?             > System  Dark    Light

Step 6 — Summary
  Modules: Snippets, Files
  Exposure: LAN only
  Auth: none
  Lifetime: forever
  Write to 9t.config.json? [Y/n]
```

**Scoped re-run:**
```
9t configure --section modules
9t configure --section exposure
9t configure --section domain
```

**Non-interactive / scriptable:**
```
9t setup --non-interactive --accept-risk \
  --exposure public --auth required \
  --domain 9t.example.com --https auto \
  --modules snippets,files
```
`--accept-risk` is mandatory whenever `--exposure` isn't `lan`; omitting it fails with an explicit pointer back to interactive `9t setup` rather than silently defaulting to something insecure.

---

## 8. Configuration Schema (`9t.config.json`)

One config file, read and written identically by the wizard, the CLI, and the dashboard Settings UI — never three divergent systems.

```json
{
  "$schema": "https://9t.dev/schema/v0.1.json",
  "meta": {
    "configVersion": "0.1",
    "createdAt": "2026-09-15T00:00:00Z",
    "lastModified": "2026-09-15T00:00:00Z"
  },
  "modules": {
    "snippets": { "enabled": true },
    "files":    { "enabled": true, "maxSizeMb": 500 },
    "links":    { "enabled": false },
    "board":    { "enabled": false }
  },
  "exposure": {
    "mode": "lan",
    "domain": null,
    "https": {
      "mode": "off",
      "provider": "letsencrypt",
      "certStatus": null,
      "lastRenewed": null
    },
    "lanBind": "0.0.0.0:7860",
    "publicBind": "0.0.0.0:443"
  },
  "auth": {
    "mode": "none",
    "sessionLengthHours": 168,
    "users": []
  },
  "objects": {
    "defaultLifetime": "forever",
    "allowPerObjectOverride": true,
    "trashRetentionDays": 7
  },
  "interface": {
    "theme": "system",
    "layout": "grid",
    "quickAccessPins": true
  },
  "cli": { "enabled": true },
  "api": { "publicApi": false },
  "storage": {
    "driver": "local",
    "path": "/data/objects",
    "s3": null
  }
}
```

Notes:
- `certStatus` / `lastRenewed` are runtime-written by the app + Caddy reconcile loop, not user-editable — document this clearly to avoid people hand-editing a field that gets overwritten.
- `api.publicApi` is independent of `exposure.mode` — a LAN-only dashboard can still allow the CLI to hit the API remotely over something like Tailscale.

---

## 9. Dashboard Settings UI

Single settings page, sectioned identically to the wizard, writing to the same config via the same validated API path.

```
┌─────────────────────────────────────────────┐
│  ⚙ Settings                          [Save]  │
├─────────────────────────────────────────────┤
│  Modules                                     │
│  ☑ Snippets   ☑ Files   ☐ Links   ☐ Board   │
│  Files: Max upload size  [500] MB            │
├─────────────────────────────────────────────┤
│  Exposure                                    │
│  ○ LAN only  ● Public  ○ Hybrid              │
│  Domain: [9t.example.com]                    │
│  HTTPS: ✓ Active (Let's Encrypt) · 47d left  │
├─────────────────────────────────────────────┤
│  Auth                                        │
│  Mode: Required 🔒 (locked — Exposure=Public)│
│  Session length: [168] hours                 │
│  Users: favour ·              [+ Add user]   │
├─────────────────────────────────────────────┤
│  Objects                                     │
│  Default lifetime: [Forever ▾]               │
│  ☑ Allow per-object override                 │
├─────────────────────────────────────────────┤
│  Interface                                   │
│  Theme:  ○ System ○ Dark ● Light             │
│  Layout: ● Grid ○ List ○ Terminal            │
├─────────────────────────────────────────────┤
│  CLI & API                                   │
│  ☑ CLI enabled     ☐ Public API access       │
├─────────────────────────────────────────────┤
│  Advanced                                    │
│  Storage driver: Local ▾                     │
│  [Edit raw config.json]      [Export]        │
└─────────────────────────────────────────────┘
```

- Switching Exposure to Public/Hybrid inline re-triggers the same domain/HTTPS flow as the wizard, just embedded rather than full-screen.
- Explicit **Save** button, not autosave — several toggles here trigger real infrastructure changes (cert issuance, bind port changes) that shouldn't fire on every click.
- "Edit raw config.json" is the escape hatch for power users, validated on save with the same error codes as everywhere else.

---

## 10. Data Model

**Base `objects` table** — shared across all module types:

```sql
CREATE TABLE objects (
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

CREATE INDEX idx_objects_sweep ON objects (deleted_at, expires_at)
  WHERE deleted_at IS NOT NULL OR expires_at IS NOT NULL;

CREATE INDEX idx_objects_listing ON objects (type, pinned, created_at DESC)
  WHERE deleted_at IS NULL;
```

**Type-specific detail tables** (1:1 with `objects`, not one wide polymorphic table):

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE snippet_details (
  object_id UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  language TEXT,
  content TEXT NOT NULL,
  line_numbers BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE file_details (
  object_id UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL,
  storage_key TEXT NOT NULL,
  checksum TEXT
);

CREATE TABLE link_details (
  object_id UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  favicon_key TEXT
);

CREATE TABLE board_layout (
  object_id UUID PRIMARY KEY REFERENCES objects(id) ON DELETE CASCADE,
  x INT NOT NULL, y INT NOT NULL, w INT NOT NULL, h INT NOT NULL
);

CREATE TABLE shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shares_token ON shares (token);
```

`ON DELETE CASCADE` from `objects` → detail tables means a hard purge is always a single `DELETE FROM objects WHERE id = ...`; the sweep job never needs to know about individual detail tables, which keeps purge logic type-agnostic as new module types get added later.

Files are never stored under user-provided filenames — the `storage_key` maps to a physical path, preventing path traversal and naming collisions. Example layout:

```
/data
├── objects
│   ├── ab/abc123...
│   └── ef/ef7821...
└── backups
```

---

## 11. Soft-Delete & Expiry (Unified)

Deleting an object and an object's expiry converge on the same lifecycle, handled by one background sweep job:

```
For each object where:
  deleted_at IS NOT NULL AND deleted_at < now() - trash_retention_days
  OR
  expires_at IS NOT NULL AND expires_at < now()
→ purge: delete storage blob, hard-delete row (cascades to detail tables)
```

**API surface:**

```
DELETE /api/objects/:id                 → soft delete (sets deleted_at)
GET    /api/objects?trashed=true        → list trash, with computed purgesAt
POST   /api/objects/:id/restore         → clears deleted_at
DELETE /api/objects/:id?permanent=true  → immediate hard delete
```

The sweep job must be idempotent (safe to run twice on the same object without erroring) and timezone-safe, since it is now load-bearing for both trash and expiry rather than a nice-to-have.

---

## 12. API Reference

**Objects**
```
POST   /api/objects            { type, name, ...type-specific fields }
GET    /api/objects            ?type=snippet&pinned=true&trashed=false
GET    /api/objects/:id
PATCH  /api/objects/:id
DELETE /api/objects/:id        [?permanent=true]
POST   /api/objects/:id/restore

POST   /api/files              multipart upload → creates file object
GET    /api/files/:id          streamed download

POST   /api/board/layout       full or partial layout update
```

**Sharing**
```
POST   /api/shares
GET    /api/shares/:token
DELETE /api/shares/:id
```

**Auth**
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

**Config**
```
GET   /api/config                     → full config, secrets stripped
PATCH /api/config                     → partial update, same shape as schema

POST /api/config/domain               { domain } → { status: "checking_dns" }
GET  /api/config/domain/status        → { dns, cert, expiresAt }
```

**Validation error shape** (shared code values across wizard, CLI, dashboard, and API — never a divergent message on any one surface):

```json
{
  "error": "invalid_config",
  "violations": [
    {
      "field": "auth.mode",
      "code": "auth_required_when_exposed",
      "message": "auth.mode cannot be 'none' while exposure.mode is 'public' or 'hybrid'"
    }
  ]
}
```

---

## 13. Security Model

- Isolated per-user data via `owner_scope` (present even in single-user v1, to avoid a schema retrofit if multi-user/sharing expands later).
- `auth.mode` structurally cannot be `none` while exposed — enforced at wizard, CLI, dashboard, and server-boot level, not just in documentation.
- Files stored by opaque key, never user-supplied filename → no path traversal.
- Signed/expiring share tokens, optional password.
- TLS handled entirely by Caddy (automatic Let's Encrypt), never hand-rolled inside 9t.
- Public exposure requires an explicit, deliberate confirmation step during setup — never a silent default — directly addressing the common real-world failure mode where self-hosted tools end up unintentionally exposed with no protection.

---

## 14. Deployment Architecture

```
                    Internet
                       │
                       ▼
                 Caddy (reverse proxy + auto HTTPS)
                       │
                       ▼
                  9t Application
                       │
              ┌────────┴────────┐
              ▼                 ▼
          PostgreSQL       Object Storage (local → S3-compatible later)
```

- **Frontend:** Next.js / React
- **Backend:** Node.js
- **Database:** PostgreSQL
- **Reverse proxy:** Caddy (automatic HTTPS is the reason it's chosen over nginx)
- **Deployment:** Docker Compose, single command install
- **Storage:** local filesystem initially, S3-compatible driver later via a storage abstraction

Ideal install experience:
```
git clone 9t
cd 9t
cp .env.example .env
docker compose up -d
```
Opens a setup screen at `http://server-ip` if no config exists yet — mirroring the "fresh install → guided onboarding" pattern from comparable tools, so first-run works from the browser alone, with the CLI wizard as an equally valid alternate entry point.

---

## 15. CLI (Future Phase)

```
9t setup                    interactive first-run wizard
9t configure --section X    scoped re-run of one config section
9t config get|set|unset     non-interactive config edits

9t push ./file-or-snippet   uploads, returns URL
9t list [--type=snippet]
9t get <name-or-id>
9t share <name-or-id> [--expires=1d] [--password]
9t trash                    list trashed objects
9t restore <id>
```

CLI consumes the same public API as the web dashboard — no parallel logic path.

---

## 16. MVP Scope

**Included in v1:**
- Auth (optional in LAN mode, required otherwise)
- Snippets + Files modules (Links/Board can ship slightly after)
- Guided setup wizard (interactive + non-interactive)
- Domain/HTTPS auto-configuration via Caddy
- Object URLs, soft-delete + expiry (unified sweep)
- Basic sharing (token, expiry, optional password)
- Dashboard Settings UI mirroring the wizard
- Docker Compose deployment

**Deliberately excluded from v1:**
- Multi-user / teams / permissions beyond `owner_scope` scaffolding
- CLI (spec'd here, built in a later phase)
- QR code handoff
- Client-side encryption
- Billing, cloud hosting, native mobile/desktop apps

---

## 17. Roadmap

1. **Foundation** — Docker, Postgres, auth, config schema, setup wizard
2. **Objects** — Snippets + Files, CRUD, object pages
3. **Storage** — upload/download, storage abstraction (local → S3-ready)
4. **Exposure** — domain/HTTPS flow, exposure/auth coupling validation
5. **Sharing & Trash** — share tokens, soft-delete, unified sweep job
6. **UX** — dashboard, Settings UI, mobile layout, Quick Access pins
7. **Security review** — external audit before any public security claims
8. **CLI** — `9t push/list/get/share`
9. **Links & Board modules**

---

## 18. Long-Term Vision

```
                9t
                 │
                 ▼
        Instant, configurable workspace
                 │
       ┌─────────┼─────────┬─────────┐
       ▼         ▼         ▼         ▼
     Files    Snippets    Links     Board
                 │
                 ▼
             Sharing + Trash
                 │
                 ▼
        Guided exposure (LAN/Public/Hybrid)
                 │
                 ▼
              CLI + API
                 │
                 ▼
        Personal cloud environment
                 │
                 ▼
         Self-hosted PaaS (future)
```

The product grows a layer only once the previous one has proven itself — same discipline as v0.1, now paired with a real differentiator: a workspace that's configured to be exactly what you need it to be, and safe by default when you decide to open it up to the world.

---

## Android client extension — September 2026

The phone client carries the workspace beyond browser-only downloads. The implementation combines the existing full workspace UI inside the app with native receiving, Downloads integration, a local inbox, clipboard delivery, and an offline text outbox.

Network selection is automatic and prefers a configured LAN endpoint, including Wi-Fi without internet, with fallback to the same server's public HTTPS endpoint. Device pairing binds both routes to one installation; transfers are encrypted and resumable, and devices can be revoked. This does not create a LAN replica of a remote cloud server.

Android background limits are part of the product contract: live receiving is user-visible and time-limited by the OS, with scheduled recovery and clear status. The client must not promise an uninterruptible connection. Full workspace operations require HTTPS; native encrypted transfers also work over private HTTP LAN connections.

See [Android implementation and operating guide](./android.md) for setup, feature coverage, protocol details, validation, and current limitations. Next platform work can add guided local server deployment, optional discovery, and push-assisted background delivery after real-phone testing.
