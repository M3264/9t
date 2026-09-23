---
title: API
description: The HTTP API the dashboard, CLI, and Android client all share — objects, shares, devices, auth, and mobile sync.
order: 6
---

# API reference

One API serves the dashboard, the CLI, and the Android client — no parallel logic paths. Authenticated routes take a session cookie (browser) or a CLI bearer token (`Authorization: Bearer …`). There is one owner; there are no user-scoped routes.

## Objects

```text
POST   /api/objects            { type, name, ...type-specific fields }
GET    /api/objects            ?type=snippet  ?trash=true
GET    /api/objects/:id
PATCH  /api/objects/:id        rename, edit content/url, pin, restore, move on board
DELETE /api/objects/:id        soft delete (sets deleted_at)
DELETE /api/objects/:id?permanent=true   immediate hard delete

GET    /api/files/:id          streamed download
```

IDs are 4 unambiguous lowercase letters (no i/l/o), e.g. `matw` — made to be read out, typed, and remembered in URLs like `/o/matw`. File *storage keys* stay UUIDs; files are never stored under user-provided filenames, so there is no path traversal.

## Sharing

```text
POST   /api/shares             { objectId, lifetime, password? }
GET    /api/shares             list active links with access counts
DELETE /api/shares/:id         revoke
GET    /s/:token               public handoff page (+ unlock + file endpoints)
```

Share tokens are signed and unguessable. Passwords are hashed server-side; a wrong password never reveals whether the item exists.

## Devices and phone pairing

```text
GET/POST/DELETE /api/devices   list, create pairing code, revoke (revokes sessions too)
POST /api/pair-requests        phone opens a 5-minute request (unauthenticated)
GET  /api/pair-requests?id=&token=   phone polls/claims (single-use, token-bound)
GET  /api/pair-requests        owner lists pending requests
POST /api/pair-requests        owner approves (mints device key) or denies
```

Pairing is approval-gated both directions. Unauthenticated requests create only *pending* entries (capped, 5-minute expiry); secrets are minted at approval and claimed once over a token-bound channel. A 5-digit session number shown on both screens defeats mistaken approval.

## Auth, config, mobile sync

```text
POST /api/auth/login|logout    GET /api/status
GET/PATCH /api/config          workspace config (validated)
POST /api/auth/token           CLI tokens (list/revoke)
POST /api/mobile               encrypted sync, chunked files, idempotent sends
```

`GET /api/status` is the public health check — it reports `initialized` without leaking anything else. Mobile sync is AES-256-GCM with per-device keys, replay protection, and resumable 256 KiB chunks; see the [Android page](/docs/android/) for the full transfer contract.

## Config shape

One JSON config, read and written identically by setup, the CLI, and Settings — never three divergent systems. Sections: `modules` (snippets/files/links/board), `exposure` (`lan`/`public`/`hybrid` + domain), `auth` (single owner), `objects` (default lifetime, per-object override, trash retention), `interface` (theme), `storage` (local driver; S3-compatible when configured). Dump yours any time with `9t config export`.
