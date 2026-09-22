# 9t

**The Self-Hosted, Fully Configurable Internet Workspace**

Version 0.3 — Revised Product & Technical Whitepaper

*Changelog vs v0.2: documents what shipped instead of what was planned. Nginx (not Caddy) terminates TLS; auth is mandatory in every mode (the LAN-unauthenticated option was cut as a safety improvement); the default store is JSON files with Postgres optional; new objects use 4-letter IDs; the CLI, QR handoff, and the Android client all shipped despite being v0.2 "excluded" items. S3, multi-user, and Caddy are formally parked (§17).*

---

## 1. Overview

9t is a self-hosted personal workspace for storing, moving, and accessing files, code snippets, links, and (optionally) a personal dashboard/board — from any device, on your own infrastructure, exposed however much or little you choose.

Core promise:

> **Put it in 9t. Get it anywhere — on your terms.**

Where the original concept (v0.1) was a fixed "workspace with objects," 9t's differentiator is **configurability of identity, not just settings**: the tool reshapes itself into a dev snippet-mover, a personal Dropbox, or a personal dashboard homepage — or all three — based on what modules are turned on. LAN-first device handoff with internet fallback, plus a safety-first setup flow, is the other half of the differentiator versus existing self-hosted tools, most of which assume you want to be exposed to the internet and assume you're only one user type.

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

Rather than picking one, 9t treats each as a **toggleable module**. The dashboard, CLI, and API all adapt to whichever modules are active. This — plus LAN-first device handoff and a safety-first setup flow — is the actual differentiator versus existing self-hosted tools.

---

## 5. Deployment & Exposure Model

9t is a single-owner tool. **Authentication is mandatory in every mode** — the v0.2 plan for an unauthenticated LAN mode was deliberately cut: one login per device with persistent sessions costs nothing in practice, and an "off switch for auth" is exactly the footgun the exposure rule below exists to prevent.

The live deployment pattern is:

```
Internet → Nginx (TLS via Certbot/Let's Encrypt, HSTS) → 9t on localhost:3265
```

- Nginx terminates HTTPS; direct access to the app port is firewall-blocked.
- The app runs as a systemd unit (`9t.service`) with automatic restart.
- A `compose.yaml` exists for Docker-based installs, but the tested production path is systemd.

The paper's Caddy-with-automatic-cert-provisioning flow is **parked** (see §17): Certbot + Nginx covers the same ground with tooling the host already had, and 9t never handles TLS termination or certificate logic itself either way.

**Design rule (enforced):** a 9t instance is never reachable without authentication. Setup refuses to complete in a state that would violate this.

---

## 6. Modules

| Module | Purpose | Key fields |
|---|---|---|
| **Snippets** | Text/code, syntax highlighted, CLI-pushable | language, content, pinned |
| **Files** | Arbitrary file upload/download | mimeType, sizeBytes, checksum |
| **Links** | Saved URLs as first-class objects | url, favicon |
| **Board** | Personal dashboard/homepage layer | layout (x,y) over existing objects |

Board does not hold its own content — it's an arrangement layer over Snippets/Files/Links, which avoids becoming a duplicate, bloated content type.

Each module can be independently enabled/disabled. Disabling a module hides it entirely from dashboard, CLI, and API — not just visually, but from listings and validation.

---

## 7. Setup (`9t setup`)

First run is guided, in the terminal or the browser:

```
$ ./setup.sh            # or: 9t setup

Step 1 — Modules        toggle Snippets / Files / Links / Board
Step 2 — Exposure       LAN only (recommended) / Public (behind your reverse proxy) / Hybrid
Step 3 — Auth           administrator username + password (always required)
Step 4 — Limits         max upload size, trash retention
Step 5 — Interface      theme, layout
Step 6 — Summary        review, write config, optionally install systemd unit
```

**Scoped operations:**
```
9t config get|set|export|import   config edits and migration between installs
9t doctor [--domain host]         exposure/DNS diagnostics
9t update                         backup, pull, rebuild, restart
9t status                         service, listener and app health
```

**Non-interactive / scriptable:** `9t setup` accepts flags for unattended installs (see `docs/installation.md`). Going public is never a silent default: the wizard requires an existing reverse proxy and says so, rather than provisioning exposure quietly.

---

## 8. Configuration

One JSON config, read and written identically by setup, the CLI, and the dashboard Settings UI — never three divergent systems. Sections: `modules`, `exposure` (`lan`/`public`/`hybrid` + domain), `auth` (single owner), `objects` (default lifetime, per-object override, trash retention), `interface` (theme, layout), `cli`, `api`, `storage` (local driver; S3 parked).

There is no versioned remote schema file and no multi-user section: single-owner is the product, not a limitation awaiting retrofit. If a second user is ever needed, that is a new product decision, not a config addition.

---

## 9. Dashboard Settings UI

Single settings surface, sectioned like setup, writing through the same validated API path: modules, max upload size, theme, trash retention. Explicit **Save**, not autosave.

The raw-config escape hatch lives in the CLI (`9t config export/import`), not the dashboard — one power-user path is enough.

---

## 10. Data Model

JSON files are the default store (atomic writes, mode-0600 secrets); setting `NINE_T_DATABASE_URL` selects the Postgres backend behind the same `readData`/`mutate` contract, so routes never know which is active.

**Object IDs are 4 letters** (unambiguous lowercase alphabet, no i/l/o — e.g. `matw`), minted inside the serialized write with a uniqueness check, replacing the v0.2 UUID plan. Rationale: IDs appear in URLs (`/o/matw`) that people read out, type, and remember; collision space (~280k) is ample for a personal store and duplicates are retried, not merely unlikely. File *storage keys* remain UUIDs — they are internal and never shown.

Files are never stored under user-provided filenames — the `storage_key` maps to a physical path, preventing path traversal and naming collisions. Example layout:

```
/data
├── 9t.json          # objects, shares, devices, sessions, config
├── objects
│   ├── ab/abc123...
│   └── ef/ef7821...
└── backups
```

Hourly cleanup purges expired/trashed objects; daily verified backups retain 14 archives (`node scripts/restore.mjs <archive> --verify` checks without touching live data).

---

## 11. Soft-Delete & Expiry (Unified)

Deleting an object and an object's expiry converge on the same lifecycle, handled by one background sweep job:

```
For each object where:
  deleted_at IS NOT NULL AND deleted_at < now() - trash_retention_days
  OR
  expires_at IS NOT NULL AND expires_at < now()
→ purge: delete storage blob, hard-delete record
```

**API surface:**

```
DELETE /api/objects/:id                 → soft delete (sets deleted_at)
GET    /api/objects?trash=true          → list trash
PATCH  /api/objects/:id { restore:true }→ restore
DELETE /api/objects/:id?permanent=true  → immediate hard delete
```

The sweep job is idempotent and timezone-safe, since it is load-bearing for both trash and expiry rather than a nice-to-have.

---

## 12. API Reference

**Objects**
```
POST   /api/objects            { type, name, ...type-specific fields }
GET    /api/objects            ?type=snippet&trash=true
GET    /api/objects/:id
PATCH  /api/objects/:id
DELETE /api/objects/:id        [?permanent=true]

GET    /api/files/:id          streamed download
```

**Sharing**
```
POST   /api/shares             { objectId, lifetime, password? }
GET    /api/shares
DELETE /api/shares/:id
GET    /s/:token               public handoff page (+ unlock + file endpoints)
```

**Devices & phone pairing**
```
GET/POST/DELETE /api/devices          list, create code, revoke (revokes sessions too)
POST /api/pair-requests               phone opens a 5-minute request (unauthenticated)
GET  /api/pair-requests?id=&token=    phone polls/claims (single-use, token-bound)
GET  /api/pair-requests               owner lists pending requests
POST /api/pair-requests               owner approves (mints device key) or denies
```

**Auth / config / mobile sync**
```
POST /api/auth/login|logout   GET /api/status
GET/PATCH /api/config         POST /api/auth/token (CLI tokens)
POST /api/mobile              encrypted sync, chunked files, idempotent sends
```

The v0.2 `register`/`me`/board-layout/domain-status endpoints were not built and are not missed: there is one owner, board persists via object PATCH, and domain health is a CLI concern (`9t doctor`).

---

## 13. Security Model

- Single owner; sessions are salted-hash authenticated with HttpOnly cookies. No public-without-auth state can exist.
- Files stored by opaque key, never user-supplied filename → no path traversal.
- Signed/expiring share tokens, optional password, access counts, revocation.
- Phone pairing is approval-gated: unauthenticated requests create only *pending* entries (capped, 5-minute expiry); secrets are minted at approval and claimed once over a token-bound channel. A 5-digit session number shown on both screens defeats mistaken approval.
- Mobile sync is AES-256-GCM with per-device keys, replay protection, and chunked resumable transfers.
- TLS terminates at Nginx/Certbot, never inside 9t.

**No external audit has been performed, and none is claimed.** The public rule stands: no security guarantees beyond "reviewed implementation with automated checks" until one happens. A scoped self-review (auth flows, pairing window, rate limits, share-token entropy, backup handling) is the proportionate next step for a personal tool — see §17.

---

## 14. Deployment Architecture

```
                    Internet
                       │
                       ▼
                 Nginx (TLS via Certbot, HSTS, firewall-closed app port)
                       │
                       ▼
                  9t Application (systemd unit, auto-restart, localhost:3265)
                       │
              ┌────────┴────────┐
              ▼                 ▼
     JSON files (default)   Object Storage (local opaque keys)
     or Postgres (optional)
```

- **Frontend:** Next.js / React (+ installable PWA with share-target)
- **Backend:** Node.js
- **Reverse proxy:** Nginx (chosen over Caddy: the host already ran it)
- **Process:** systemd; `deploy/` holds unit + Nginx examples
- **Storage:** local filesystem; S3-compatible driver parked

Ideal install experience (as built):
```
git clone 9t
cd 9t
./setup.sh
```
Opens setup in the terminal; the browser shows a first-run wizard when uninitialized. Node 22+ is the only requirement.

---

## 15. CLI

Shipped ahead of schedule (v0.2 called it a future phase). The CLI consumes the same public API as the dashboard — no parallel logic path.

```
9t setup | start | status | update | doctor
9t login --url https://9t.example.com --username you
9t push <text|url|file> [--name name]
9t list [--trash]
9t get <id|name> [--output file]
9t share <id|name> [--lifetime 1d]
9t trash <id|name>
9t restore <id|name>
9t config export|import
9t logout
```

---

## 16. Scope (as shipped)

**Included:**
- Mandatory auth, single owner
- All four modules (Snippets, Files, Links, Board)
- Guided setup (interactive + non-interactive) with service install
- Object pages, QR handoff, expiring password-protected public shares
- Soft-delete + unified expiry sweep, hourly cleanup, daily verified backups
- PWA with mobile share-target, system/light/dark themes
- Full CLI, Docker-adjacent `compose.yaml` (untested production path)
- Android client with encrypted LAN-first sync and approval-gated pairing

**Deliberately excluded (carried from v0.2, still out):**
- Multi-user / teams / permissions
- Client-side (end-to-end) encryption — transport + at-rest OS protection only
- Billing, cloud hosting, iOS client
- External security review (see §13/§17)

---

## 17. Roadmap

Done: foundation, objects, storage, exposure basics, sharing & trash, UX, CLI, Links & Board.
Parked (explicitly, not forgotten):
1. **S3-compatible storage** — no need while one disk holds everything.
2. **Multi-user** — a new product decision, not a backlog item.
3. **Caddy/DNS automation** — Nginx + Certbot covers it.
4. **LAN-unauthenticated mode** — cut for safety (§5); do not revive without a new threat analysis.
Next, proportionate:
5. **Scoped security self-review** — auth, pairing, rate limits, share entropy, backups; write down the threat model.
6. **External audit** — only if 9t ever makes public security claims or gains a second trust domain.

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
        Guided exposure (LAN-first)
                 │
                 ▼
              CLI + API + Android
                 │
                 ▼
        Personal cloud environment
```

The product grows a layer only once the previous one has proven itself — same discipline as v0.1, now paired with a real differentiator: a workspace that's configured to be exactly what you need it to be, and safe by default when you decide to open it up to the world.

---

## Android client — September 2026 (current: 0.5.x)

The phone client carries the workspace beyond browser-only downloads: native inbox with offline history, Downloads/9t auto-save, clipboard delivery, offline text outbox, phone-initiated pairing, LAN subnet scan, per-route connection check, optional app PIN lock — plus the full web workspace embedded for everything else.

Pairing is approval-gated both directions: the web can mint a paste-in code, or the phone can send a request that appears on `/devices` with a 5-digit session number shown on both screens. Requests expire in 5 minutes, are capped, and the secret is claimed exactly once over a token-bound channel. Revoking a device kills its key and its sessions.

Network selection prefers a configured LAN endpoint (including Wi-Fi without internet) with public-HTTPS fallback; transfers are AES-256-GCM, chunked and resumable. Background rules are part of the contract: live receiving is user-visible with scheduled recovery — no always-on promise, and force-stop/OEM restrictions still apply. Full workspace operations require HTTPS; native transfers also work over private HTTP LAN.

See [Android implementation and operating guide](./android.md) for setup, feature coverage, protocol details, validation, and current limitations.
