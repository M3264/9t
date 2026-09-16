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
- Universal inbox classifies text, URLs, and files without asking for a type first.
- System, Light, and Dark themes persist through the shared configuration API.
- `https://9t.kennyy.xyz` is live behind Nginx with Let's Encrypt, HSTS, Secure cookies, automatic renewal, and no direct public access to port 3265.

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

## Compaction handoff — 2026-09-16

### Live product

- Production URL: `https://9t.kennyy.xyz`
- Repository: `https://github.com/M3264/9t`
- Branch: `main`
- Application service: `9t.service`
- Reverse proxy: Nginx
- TLS: Let's Encrypt through Certbot
- Certificate renewal dry run passed; `certbot.timer` is enabled.
- HTTP redirects to HTTPS.
- HSTS, `nosniff`, same-origin framing, and strict-origin referrer headers are enabled.
- `NINE_T_HTTPS=true`; new sessions receive Secure cookies.
- Public TCP port 3265 is closed in UFW. Nginx reaches the application locally.
- Live account and object data are stored under the ignored `data/` directory.

### Product state

- First-run owner setup with a private setup key.
- Scrypt password hashing and persistent hashed sessions.
- Snippets, files, links, and draggable Board modules.
- Universal inbox automatically classifies pasted text, URLs, and dropped/selected files.
- Search, filters, object editing, Quick Access pins, and keyboard commands.
- System, Light, and Dark themes stored through the shared configuration API.
- Soft deletion, Trash, restore, and permanent deletion.
- Permanent or expiring objects.
- Public share links with expiry, access counts, revocation, and protected file downloads.
- Responsive setup, login, workspace, inspector, Board, settings, and public-share views.
- Local files use opaque storage keys rather than user-provided paths.
- Production build and TypeScript checks pass; `npm audit` reports zero vulnerabilities.

### White-paper differences

- The white paper specifies Caddy; this VPS already used Nginx and Certbot, so 9t uses that working stack.
- The white paper specifies PostgreSQL; the current single-user release uses atomic JSON persistence and local opaque-key object storage.
- Setup exists in the browser but the interactive/non-interactive CLI setup flows do not exist yet.
- Object expiry is swept during authenticated object access rather than by a scheduled worker.
- Settings expose modules, themes, and maximum file size but not the complete documented configuration schema.

### Highest-value next milestone: complete the device-handoff loop

The current product stores and organizes objects, but both devices still need to open the website manually. Build these next:

1. Authenticated CLI with `9t push`, `list`, `get`, `share`, `trash`, and `restore`.
2. Stable authenticated object URLs and individual object pages.
3. QR handoff from every object and share dialog.
4. Installable PWA with mobile share-target support.
5. One-click clipboard retrieval and clearer copy confirmation.
6. Scheduled, idempotent expiry/trash-retention worker.
7. Automated backup and tested restore flow.

### Remaining platform work

- Password-protected shares.
- LAN/Public/Hybrid exposure switching with enforced auth coupling.
- Domain and DNS configuration from the setup/settings interface.
- PostgreSQL repository, schema, and migrations.
- Docker Compose one-command installation.
- S3-compatible storage abstraction.
- Validated raw configuration editor and import/export.
- Multi-user ownership boundaries.
- External security review before making security claims.
- Client-side encryption and native clients remain long-term work.

### Product direction

Keep the interface simple and visually aligned with the blue 9t logo. Avoid generic dashboard cards and overly theatrical control-room styling. The central interaction is the universal inbox: put text, a URL, or a file into one place and retrieve it from any device. New work should strengthen that promise before adding broad productivity features.
