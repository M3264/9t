# 9t build plan and resume state

Paused: 2026-09-16

## Current state

The functional single-user release is built and deployed at `http://193.122.5.91:3265`. It runs through the enabled `9t.service` systemd unit and restarts automatically. First-run setup is awaiting the owner and is protected by `NINE_T_SETUP_TOKEN` in `.env.production`.

## Completed in source

- Transparent scalable SVG logo at `public/9t-mark.svg`.
- Full dashboard redesign using the blue 9t identity.
- First-run module selection and administrator creation.
- Scrypt password hashing, persistent hashed sessions, and HTTP-only cookie authentication.
- Protected setup, status, login, logout, config, objects, and file APIs.
- Atomic persistent local data storage and opaque-key file storage under `data/`.
- Snippets, Files, and Links creation and listing.
- Search, filters, pinning, snippet copy, link open, and file download.
- Soft deletion, Trash, restore, and permanent deletion.
- Module and upload-size settings.
- Port 3265 and all-interface binding; UFW TCP 3265 rule is open.

## Validation completed

- Next.js 16.3.5 production build passes TypeScript checks.
- Full isolated API lifecycle passed: setup, sessions, failed/successful login, snippet/link/file creation, file round-trip, pinning, Trash, restore, config update, and unauthorized rejection.
- `npm audit` reports zero vulnerabilities.
- Live homepage and status endpoints return HTTP 200 through the public IP.
- Invalid setup keys return HTTP 403.
- `9t.service` survived an explicit restart and remains active.
- Signal Desk redesign deployed with a stream, Quick Relay rail, inspector, command palette, and spatial Board.
- Public handoffs, expiry, access counts, revocation, object editing, and Board-position persistence passed isolated lifecycle tests.

## Next sequence

1. Complete owner setup in the browser using the server setup key.
2. Add a domain and HTTPS reverse proxy. Set `NINE_T_HTTPS=true` after TLS works so cookies use the Secure flag.
3. Review desktop and mobile layouts with real owner content.
4. Continue the remaining white-paper work below.

## Important notes

- Authentication is mandatory because this instance is internet-exposed.
- Until HTTPS exists, cookies cannot use the Secure flag; the code gates it on `NINE_T_HTTPS=true`.
- Local atomic storage is the initial single-user release. PostgreSQL remains planned.

## Remaining white-paper work

- Password-protected handoffs and QR handoff.
- Scheduled idempotent trash-retention sweep (object expiry is implemented and swept on access).
- PostgreSQL repository and migrations.
- CLI: setup, push, list, get, share, trash, restore.
- DNS validation and Caddy HTTPS automation.
- Hybrid LAN/public trust handling.
- S3-compatible storage.
- Config import/export and validated raw editor.
- Backup/restore tooling and external security review.
