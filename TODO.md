# 9t build plan and resume state

> **Latest handoff:** [HANDOFF.md](./HANDOFF.md). The Android preview APK, encrypted LAN/public transfers, and device pairing were deployed on 2026-09-17. Real-phone validation remains outstanding. Older design descriptions below are historical.

Paused: 2026-09-16

## Current state

The functional single-user release is deployed at `https://9t.kennyy.xyz`. Nginx terminates HTTPS, direct public access to port 3265 is blocked, and the enabled `9t.service` unit restarts automatically.

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
- Local port 3265 binding behind Nginx; UFW allows only public HTTP/HTTPS access.

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

1. Review desktop and mobile layouts with real owner content.
2. Build the deployment/configuration milestone described below.

## Important notes

- Authentication is mandatory because this instance is internet-exposed.
- HTTPS and Secure cookies are active in production.
- Local atomic storage is the initial single-user release. PostgreSQL remains planned.

## Remaining white-paper work

- PostgreSQL repository and migrations.
- CLI setup/configure wizard (daily object commands are implemented).
- DNS validation and Caddy HTTPS automation.
- Hybrid LAN/public trust handling.
- S3-compatible storage.
- Config import/export and validated raw editor.
- External security review.

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

Completed 2026-09-16:

1. Authenticated CLI with `9t push`, `list`, `get`, `share`, `trash`, and `restore`.
2. Stable authenticated object URLs and individual object pages.
3. QR handoff on object pages, share creation, and public handoffs.
4. Installable PWA with mobile share-target support.
5. Clear copy confirmation and direct retrieval actions.
6. Scheduled, idempotent expiry/trash-retention worker.
7. Automated backup and verified restore flow.
8. Password-protected public handoffs.

The interface was rebuilt as a quiet, single-column workspace centered on the universal inbox. The previous control-panel rail, numbered channels, gradients, and card-heavy shell were removed. The source tree was also reorganized into thin routes, focused workspace/access components, explicit client/server libraries, shared types, styles, deployment files, scripts, and documentation.

### Remaining platform work

- LAN/Public/Hybrid exposure switching with enforced auth coupling.
- Domain and DNS configuration from the setup/settings interface.
- PostgreSQL repository, schema, and migrations.
- Docker Compose one-command installation.
- S3-compatible storage abstraction.
- Validated raw configuration editor and import/export.
- Multi-user ownership boundaries.
- External security review before making security claims.
- Client-side encryption and native clients remain long-term work.

### Next milestone

Build the deployment/configuration layer: validated config import/export, Docker Compose installation, exposure/domain diagnostics, and then replace JSON persistence with a PostgreSQL repository and migrations. S3 and multi-user boundaries follow after the repository abstraction is stable.

### Product direction

Keep the interface simple and visually aligned with the blue 9t logo. Avoid generic dashboard cards and overly theatrical control-room styling. The central interaction is the universal inbox: put text, a URL, or a file into one place and retrieve it from any device. New work should strengthen that promise before adding broad productivity features.
