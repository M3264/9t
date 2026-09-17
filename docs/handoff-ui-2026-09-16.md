# 9t handoff — 2026-09-16

## Current state

The rebuilt interface and storage queue fix are deployed at **https://9t.kennyy.xyz**. Deployment was explicitly requested by the user and completed in this session. No deployment approval is pending.

- Checkout: `/home/ubuntu/9t`, branch `main`.
- Production service: `9t.service`, working directory `/home/ubuntu/9t`.
- Service runs `npm run start`, listening on port 3265 behind Nginx.
- Environment file: `.env.production`. Do not print its secrets.
- Data remains local JSON plus file objects, normally under ignored `data/` (respect `NINE_T_DATA_DIR`). Production data was not replaced with fixtures.
- Deployed build ID: `5QVxAVNtKFeMG01knxd1o`.
- Public stylesheet verified: `/_next/static/chunks/1aat0u__wg01_.css`.
- Service restarted successfully; public homepage and `/api/status` returned successfully. Status response was `{"initialized":true}`. Homepage contained the expected build ID, and stylesheet contained the new desktop/mobile components.
- Changes are **uncommitted**. The checkout already contained substantial changes before this session. Do not reset, clean, or overwrite them; do not treat every diff as newly authored here.

## User direction and completed work

The user rejected the first redesign, requested a fresh rebuild after reading `docs/whitepaper.md`, and emphasized both desktop and mobile. The second redesign is now live. Deployment authorization is not a claim that the user has provided final aesthetic approval.

The white paper's core promise guided this iteration: fast capture and retrieval between devices, a configurable mix of files/snippets/links, and a Board that arranges existing items.

### Interface

- Replaced the previous UI shell and styles with one visual system in `styles/globals.css`; removed the intermediate `styles/workspace.css` overlay.
- Desktop: dark green-gray sidebar, warm neutral content surface, restrained green accents, content-preview cards, and grid/list modes.
- Mobile: dedicated Workspace / Pinned / Add / Shared / More dock, slide-out navigation, responsive capture, and phone-sized dialogs.
- Quick capture supports multiline text, URL classification, file selection/drop, per-item lifetime, sequential uploads, progress, and explicit error feedback.
- Capture, filters, displayed content, and commands adapt to enabled modules. This is UI behavior; full backend/CLI module enforcement is not claimed complete.
- Cards preview snippets, file metadata, and saved-link domains; direct copy/download/open actions are available.
- Search, sorting, pinned-only view, and browser-local grid/list preference.
- Improved item inspector, settings, create/share dialogs, access screens, and standalone item/share styling.
- Item inspector includes a QR handoff for another signed-in device.
- Board supports pointer dragging and arrow-key positioning; tap/click opens an item.
- Dialog focus trapping, nested Escape handling, focus restoration, mobile menu focus handling, and hidden-menu inertness.
- Failed saves no longer report success; restore only removes the item from the trash view after a successful API mutation. Stale collection responses are guarded by request IDs.

### Persistence fix

`lib/server/store.ts`: each mutation retains its own rejecting promise while the shared queue recovers for the next operation. One failed mutation no longer poisons all subsequent writes.

Regression coverage: `tests/store.test.mjs` verifies rejection reaches the original caller and queued/future mutations still persist successfully. It uses a temporary data directory.

## Main files

- `components/workspace/Workspace.tsx`: state, responsive shell, navigation, collection controls, dialogs.
- `components/workspace/UniversalInbox.tsx`: module-aware capture and upload handling.
- `components/workspace/ObjectCollection.tsx`: grid/list cards, Board, share listing.
- `components/workspace/WorkspaceDialogs.tsx`: focus management, editor, create/share/settings/commands, QR handoff.
- `components/access/AccessScreens.tsx`: setup/sign-in presentation.
- `styles/globals.css`: sole active interface stylesheet.
- `lib/server/store.ts` and `tests/store.test.mjs`: queue recovery fix and regression test.

## Verification completed

- Production `npm run build` passed, including TypeScript.
- `node --test tests/store.test.mjs` passed.
- `git diff --check` passed before this documentation update.
- Playwright against a separate local production server and real APIs passed:
  - Setup/login, text capture, editing, simulated failed-save feedback and retry.
  - Password-protected share creation and an unauthenticated recipient seeing the password input.
  - File upload and exact downloaded-content comparison.
  - Trash and restore.
  - Board arrow-key movement.
  - Grid/list, search/no-results, nested modal Escape, mobile navigation, theme switching, sign-out.
  - Files-only and links-only layouts, disabled-module hiding, empty collection.
  - No horizontal document overflow at 320, 390, 768, and 1024 pixels; desktop screenshots at 1440 pixels.
  - No browser page errors.
- Authenticated functional checks used isolated test data, not the live account. Post-deployment checks were public/read-only; do not imply a live authenticated audit was performed.

## Test artifacts and tooling

Temporary, potentially ephemeral files:

- `/tmp/9t-v3-review.cjs`: end-to-end browser script, hardcoded for the isolated preview. It seeds/mutates test data; **never point it at production**.
- `/tmp/9t-v3-review-data`: isolated data, separate from production.
- `/tmp/9t-v3-desktop.png`, `/tmp/9t-v3-mobile.png`: latest desktop and phone previews.
- `/tmp/9t-v3-320.png`, `/tmp/9t-v3-390.png`, `/tmp/9t-v3-768.png`, `/tmp/9t-v3-1024.png`: full-page responsive captures.
- `/tmp/9t-v3-mobile-settings.png`, `/tmp/9t-v3-mobile-create.png`, `/tmp/9t-v3-mobile-empty.png`, `/tmp/9t-v3-login.png`: additional states.
- `/tmp/9t-live-deployed.html`, `/tmp/9t-live-deployed.css`: public deployment verification downloads.

The isolated preview on port 3273 was stopped when testing finished. The browser script loads Playwright from an existing npm cache path; it is not a portable installed project dependency.

In the managed sandbox, systemd/network/browser operations needed escalation. Next's TypeScript subprocess failed inside the sandbox with `Could not parse output from TypeScript's --showConfig`; the production build passed outside it. Do not mistake that sandbox failure for a remaining TypeScript error.

Next emits the existing `middleware` → `proxy` convention deprecation warning. Migration was not part of this UI task.

## Remaining work / boundaries

This was a frontend rebuild plus targeted reliability fixes, not an implementation of every white-paper milestone. The existing Nginx/Certbot and JSON storage architecture remains.

Still planned or requiring further work:

- Unified validated configuration, import/export/raw editor.
- Guided LAN/public/hybrid exposure and domain/HTTPS configuration.
- PostgreSQL repository and migrations; Docker Compose installation.
- S3 storage and multi-user ownership.
- Full module enforcement across backend endpoints and CLI, beyond the UI adaptation implemented here.
- External security review. Existing notes about historical dependency audits are not a fresh audit in this session.

Earlier `TODO.md` handoff sections describe prior designs and may contradict the current UI. Treat this document as the current handoff. Follow the user's next feedback before expanding platform scope.

## Deployment reference

For later source changes, build and verify first, then deploy when authorized:

```bash
cd /home/ubuntu/9t
npm run build
sudo systemctl restart 9t.service
systemctl is-active 9t.service
curl -fsS --max-time 20 https://9t.kennyy.xyz/api/status
```

This service serves `.next` directly from the checkout. Future deployment work should consider staged builds/atomic releases to avoid replacing assets underneath a running service. Keep secrets and runtime data out of Git.
