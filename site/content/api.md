---
title: API
description: HTTP routes for objects, shares, configuration, and paired Android devices.
order: 6
---

# API reference

The browser and CLI use the same object and share routes. Browser requests authenticate with a session cookie; scripts can use a bearer token in `Authorization: Bearer …`. The paired Android client uses its own encrypted `/api/mobile` protocol. This is a single-owner instance, not a multi-user API.

## Authentication

| Route | Purpose |
| --- | --- |
| `POST /api/auth/login` | Sign in with JSON `{ "username": "…", "password": "…" }`; sets a browser session cookie. |
| `POST /api/auth/logout` | End the current browser session. |
| `POST /api/auth/token` | Exchange owner credentials for a bearer token for the CLI or an integration. The response shows the token once. |
| `DELETE /api/auth/token` | Revoke the bearer token supplied in the Authorization header. |
| `GET /api/status` | Public health check. Without authentication it returns only `initialized`; signed-in requests also receive configuration and runtime information. |

Keep bearer tokens private. The easiest way to use the API from a terminal is [the 9t CLI](/docs/operations/#cli-reference), which obtains and stores its own token. Browser writes are subject to origin/CSRF checks; bearer-token requests are not ambient browser credentials.

If you already have a token, a read looks like this:

```bash
curl -H "Authorization: Bearer $NINE_T_TOKEN" "$NINE_T_URL/api/objects"
```

Set `NINE_T_URL` to your instance's origin, such as `https://9t.example.com`. Do not include a token in a URL or commit it to a script.

## Objects and files

| Method and path | Body or result |
| --- | --- |
| `GET /api/objects` | Active objects. Use `?trash=true` for trashed objects; there is no server-side type filter. |
| `POST /api/objects` | `multipart/form-data` with `type`, `name`, and type-specific fields; returns the new object. |
| `GET /api/objects/:id` | One object as JSON. |
| `PATCH /api/objects/:id` | JSON update: `name`, `pinned`, `restore`, `content`, `language`, `url`, `expiresAt`, or `board`, as applicable. |
| `DELETE /api/objects/:id` | Move an item to Trash. Add `?permanent=true` to delete it immediately. |
| `GET /api/files/:id` | Authenticated file download. `?preview=1` serves supported images inline only when they are at most 2 MB. |

For `POST /api/objects`, use `content` and optional `language` for a snippet, `url` for a link, or a `file` upload for a file. `lifetime` accepts `1h`, `1d`, `7d`, `30d`, or `forever` and defaults to `forever`. The upload limit is set by the instance owner. `PATCH` uses an ISO date-time string in `expiresAt`; `null` removes the expiry.

New object IDs are four lowercase letters chosen from an alphabet without easily confused characters, for example `matw`. Older UUID IDs remain valid. File storage keys are separate UUIDs; uploaded filenames never become storage paths.

## Sharing

| Method and path | Purpose |
| --- | --- |
| `POST /api/shares` | Create a public link with JSON `objectId`, optional `lifetime`, and optional `password` of at least 8 characters. |
| `GET /api/shares` | List active links, expiry, password-protection flag, and access counts. |
| `DELETE /api/shares/:id` | Revoke a link without deleting its object. |
| `GET /s/:code` | Public handoff page; password-protected links require an unlock first. |

Share lifetimes are `1h`, `1d` (the default), `7d`, `30d`, or `forever`. New share codes are only four letters and **can be guessed**; use a password and short expiry for sensitive content. See [Sharing](/docs/sharing/) for the difference between `/s/` and private `/o/` pages.

## Configuration and devices

| Route | Purpose |
| --- | --- |
| `GET /api/config` | Current public configuration fields. `?format=export` adds a versioned export envelope. |
| `PATCH /api/config` | Validate and update selected configuration fields. |
| `PUT /api/config` | Validate and replace the whole configuration. |
| `GET /api/devices` | List paired devices and their status. |
| `POST /api/devices` | Create a pairing code. |
| `DELETE /api/devices` | Revoke a paired device. |
| `POST /api/pair-requests` | Phone creates a pending request; an authenticated owner can approve or deny it. |
| `GET /api/pair-requests` | Owner lists pending requests; a phone can poll its own token-bound request. |

The config fields returned by `/api/config` are `modules` (`snippets`, `files`, `links`, `board`), `theme`, `maxSizeMb`, `trashRetentionDays`, `exposure`, and `domain`. It does not export passwords, sessions, device keys, or API tokens. For a backup of workspace data, use [the backup tools](/docs/operations/#backups-and-retention), not config export.

`/api/mobile` is an authenticated encrypted transfer protocol for paired devices, including resumable file chunks. It is not a general-purpose JSON endpoint. Pair a phone through [the Android guide](/docs/android/) rather than calling it directly.
