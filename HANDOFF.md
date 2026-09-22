# 9t project handoff — 2026-09-22 (0.6.1: notification inline reply)

## Session summary (live build .next-059)

User wanted to send text from the notification without opening the app. The live-receiving notification now has a **Send** action with inline reply (`RemoteInput`, key `text`, generated replies off): typed text (1–100k chars) queues into the outbox and a sync pass runs, all via the existing `sync` machinery refactored into `runSyncPass()`. Gotchas handled: reply PendingIntent is mutable (required for RemoteInput on API 31+), unpaired/paused phones get a status ping instead of silent drop. Shipped as 0.6.1 / code 21, same cert, public bytes verified identical (`ba86e4d2…395282`), 0 errors since restart. Web logic unchanged (0.6.1 version refs + docs line). Also fixed `9t update` to tolerate service-regenerated `next-env.d.ts`/`tsconfig.json` (stash around pull, names real blockers). Not yet tested on a physical phone.

## Session summary (live build .next-058)

User clarified: share links (not object IDs) should be short. New shares now mint 4-letter public codes (`/s/wbkz`, unambiguous alphabet) with uniqueness enforced inside the serialized write; old long tokens keep working. Verified on an isolated server: 8 shares all short + unique, public page 200. Caveat recorded for the user: 4-char public codes are enumerable (~280k combos) — password + short expiry for anything sensitive. Live: 200, 0 errors since restart. Open question: whether to revert object IDs to UUIDs (user implied the object-ID change wasn't asked for).

## Session summary (live build .next-057)

User hit "invalid uuid" sharing a snippet: `shareCreateSchema.objectId` still required UUID while new objects mint 4-letter IDs. Fixed to accept UUID (legacy items) or 4-letter ids; it was the only `.uuid()` object-id check in the codebase (storage-key guards untouched). Verified on an isolated server: created `bhzt`, shared 200, public page 200. Live: 200, 0 errors since restart. (Session survived a host restart mid-fix: rebuilt .next-057 from the intact working tree, /tmp scripts recreated.)

## Session summary (live build .next-056)

User wanted several workspaces on one phone with switching. Implemented as a profiles overlay: flat prefs always describe the ACTIVE server, so Transport/SyncEngine/ReceiveService needed zero changes. `Prefs` gained servers map + activeServer + save/switch/rename/remove + legacy auto-migration (existing installs become one profile named by host). `LocalStore` v3: server column everywhere, inbox rebuilt with composite PK (server,id) since 4-letter object ids can repeat across servers; pre-existing rows backfilled to the active server. `SyncEngine` partials prefixed per server. Only the active server syncs/receives; inactive data stays local. UI: Connect → Servers section (switch/rename/remove/add), active name in header status, pairing screen reused for adding (with cancel restoring the previous server), Disconnect now removes the active server (full reset only when last one goes). Release build + all 23 JVM unit tests pass. Shipped as 0.6.0 / code 20, same cert, public bytes verified identical (`fd089465…41ba2`), 0 errors since restart. Web logic unchanged (0.6.0 version refs + docs line). Not yet tested on a physical phone: migration of a real 0.5.x install, add/switch/remove round-trip.

## Session summary (live build .next-055)

User's server is plain HTTP on a public IP:port (`http://209.182.233.189:6119`), which `Endpoint.validate` rejected by design (public + HTTP → "need HTTPS"), so Find server/scan/save all failed. Fix: `validate()` gained a `publicHttp` flag; new **Allow plain HTTP to public servers** toggle in Connect plus a matching toggle on the pairing-request card; honored in probe, Connect save, `Prefs.pair`, Transport, and EventConnection. Transfers stay AES-encrypted; metadata on the wire is the accepted tradeoff (same class as the existing HTTP-LAN opt-in), stated in UI + docs. Shipped as 0.5.3 / code 19, same cert, public bytes verified identical (`e3b5eedc…32aa2`), 0 errors since restart. Web logic unchanged (0.5.3 version refs + docs line). Not yet tested on a physical phone against a real public-HTTP server.

## Session summary (live build .next-054)

User wanted to sync without opening the app. The live-receiving notification now has **Sync now** next to Pause: it fires a `sync` action at ReceiveService, which runs one SyncEngine pass on a background thread and rewrites the notification text with the result (already-running / syncing / synced status / failed). No activity opens. Shipped as 0.5.2 / code 18, same cert, public bytes verified identical (`3570ce0e…d7de2`), 0 errors since restart. Web logic unchanged (0.5.2 version refs + docs line). Not yet tested on a physical phone.

## Session summary (live build .next-053)

User wanted 9t in the Android text-selection toolbar (next to Copy/Cut, like Ask Gemini) rather than only in the Share sheet. Added an `ACTION_PROCESS_TEXT` intent filter (label "Send to 9t") on MainActivity; the handler fills the Send composer with the selected text and never replaces the selection (read-only use). Unpaired phones get a "pair first" toast. Shipped as 0.5.1 / code 17, same cert, public bytes verified identical (`680c7b1a…c8ace`), 0 errors since restart. Web logic unchanged (0.5.1 version refs + docs line). Not yet tested on a physical phone.

## Session summary (live build .next-052)

User wanted memorable IDs for created things. New objects now get 4-letter lowercase IDs from an unambiguous alphabet (no i/l/o, e.g. `matw`) instead of UUIDs. Uniqueness enforced inside the serialized `mutate()` in both JSON and Postgres backends (no race). Verified: object IDs are only ever compared by string equality — the UUID regexes guard internal file storage keys only, which stay UUIDs. Old UUID items keep working untouched; shares/devices/pairing IDs unchanged. Verified on an isolated server: 15 creates all 4-letter + unique, patch/page/delete by short ID all 200; `tsc` + `store.test.mjs` pass. Live: 200, 0 errors since restart.

## Session summary (live build .next-051)

User reported tapping Set app PIN crashes the app. Root cause: `pinPrompt()` and the lock-screen gate both built their input with `field()`, which attaches the EditText to the activity body — then passed the same view to `AlertDialog.setView()`, throwing `IllegalStateException: child already has a parent`. Fix: new `plainField()` helper that styles identically but never attaches; both PIN dialogs use it. Audited all other `setView()` calls (fresh ScrollViews, fine) and all other `field()` uses (stay in body, fine). Shipped as 0.5.0 / code 16, same cert, public bytes verified identical (`8ef26af7…21a40f`), 0 errors since restart. Web logic unchanged (0.5.0 version refs only).

## Session summary (live build .next-050)

User wanted a manual check on the request screen itself (not just auto-poll). Added a **Check approval** button under Send connection request: forces an immediate approval check ("Checking…", then pairs or keeps waiting); says "No waiting request" when there is none. Auto-poll every 3s still runs underneath. Shipped as 0.4.9 / code 15, same cert, public bytes verified identical (`270cdfef…225a4c`), 0 errors since restart. Web logic unchanged (0.4.9 version refs only). Not yet tested on a physical phone.

## Session summary (live build .next-049)

User asked for a check-connection button. Added to Connect → Your workspace, under Save: **Check connection** probes both typed addresses (not just saved) via `/api/status` and reports `LAN: ✓ N ms` / `Internet: ✗ unreachable` lines in place. Shipped as 0.4.8 / code 14, same cert, public bytes verified identical (`2a05d5aa…928e`), 0 errors since restart. Web logic unchanged (0.4.8 version refs only). Not yet tested on a physical phone.

## Session summary (live build .next-048)

User approved on web but the app never paired. Root cause: the approval-poll loop guarded on `foreground` and returned without rescheduling once the user switched to the browser to approve — polling died silently, and returning to the app showed a fresh form with no code. Fix: the pending request (id, claim token, session number, expiry, server) is persisted in prefs on send; `onResume` re-renders the waiting UI when a live request exists and no poll is running; expiry/deny/claim all clear the stored request. Polling is generation-guarded against `render()` as before. Shipped as 0.4.7 / code 13, same cert, public bytes verified identical (`0b090e2d…c225a4`). Server unchanged — no web logic changes, only 0.4.7 version refs (needed a `.next-048` rebuild + restart for the download link; 0 errors since). Not yet tested: real-phone approve round-trip with app backgrounded (the exact reported scenario).

## Session summary (pushed to main as 8dd1966, live build .next-047)

Phone-initiated pairing with 5-digit numeric comparison + rebuilt /devices UI. User also reported /devices 500ing: root cause was the service pointed at deleted build dir `.next-045` (client reference manifest missing). Fixed by building `.next-047` and switching the drop-in. Full pair flow verified against an isolated server (create → owner list → approve → claim-once → wrong-token rejected). APK 0.4.6 signed with the same cert, public bytes verified identical. Uncommitted build churn intentionally left out (`next-env.d.ts`, `tsconfig.json` build-dir paths).

## What shipped

- `src/app/api/pair-requests/route.ts` (new): public POST creates a 5-minute pending request (name + 5-digit number + claim token, hash-stored); public GET polls/claims (single-use, token-bound); authed GET lists pending for the owner view; authed POST approves (mints device id+key) or denies. Caps: 10 pending, 30 devices. No key material leaks into the owner list.
- `src/lib/server/store.ts`: `PairRequest` type + `pairRequests` on `Data`.
- `/devices` rebuilt in the violet theme: pending-request notification cards (big mono 5-digit number, name, expiry countdown, Approve/Deny), 5s auto-refresh, "pair from phone" 3-step explainer, restyled code flow + device list. Old hardcoded greens removed.
- Android 0.4.6 / code 12 (`MainActivity.java`): onboarding "No code? Ask from here" card — server address + Find server (`/api/status` probe) + Scan local network (Wi-Fi /24 probe on :3265, needs new `ACCESS_WIFI_STATE` normal permission) + Send request showing the big 5-digit code + 3s approval polling that feeds the existing encrypted `pair()` path on success. Polling generation-guarded against `render()`.
- Version refs → 0.4.6 (`DeviceManager`, README, `docs/android.md` with new request-first pairing steps).

## Verification

- Isolated-server flow: setup 200 → login 200 → create 200 → bad number 400 → owner list (1 pending, number matches, no key) → approve 200 → claim 200 (v:1, 44-char key) → re-claim 404 → wrong token 404.
- Live: `/devices` 307 (signed-out redirect, correct), `/api/pair-requests` unauth list 401, APK hash `0e103b8e…261dd47` matches signed artifact, 0 service errors since restart. `tsc` clean; release `assembleRelease` BUILD SUCCESSFUL.
- Not yet tested: real-phone approval round-trip (needs the 0.4.6 APK on a device); LAN scan on a real subnet.

# 9t project handoff — 2026-09-20 (0.4.5: phone sends files/links + website-mark icon)

## Session summary (pushed to main as 5ba5022 + a43b70e, live build .next-045)

User audited the APK and found it receive-only. All 9 gaps closed plus media previews and the icon swap. Server upload actions are live; APK 0.4.5 signed with the same cert, public bytes verified identical.

- **Server** (`src/app/api/mobile/route.ts`): `sendText` gains `kind:link` (validated http/https, links-module gated, snippets-disabled no longer blocks links); new `sendFileInit/Chunk/Done/Abort` resumable chunked uploads (local tmp staging, object created only at done so aborts leave nothing, 24h stale sweep, idempotent replays via deterministic ids, works on local + S3 blob stores). Extended `tests/mobile-api.mjs` (link landing/rejection, 600KB upload with forced out-of-order resume, exact round-trip, oversize rejection) — PASS against isolated dev server.
- **APK 0.4.5 (code 11)**: share sheet takes text/images/video/audio/multiple; Send tab has file picker, camera capture, dedicated link sender, URL-as-link toggle, upload queue with progress/cancel; inbox gains image/video thumbnails, full image viewer, pin, per-item share/delete, clear-history, open-in-browser for links; arrival notifications (toggleable); app PIN lock (cold start + 2min background, salted SHA-256); Quick Settings tile, launcher shortcuts, home widget; Workspace over HTTP LAN behind explicit opt-in (non-Secure cookie only for http). Local DB auto-migrates v1→v2. Website mark replaces the launcher icon and header text pill (`drawable/ic_ninet.xml` rebuilt from `public/9t-mark.svg`, new `drawable/mark.xml`; pre-24 loses only the counter cutout).
- **Verification**: 23 JVM tests pass (incl. new LinksTest), `lintDebug`/`lintRelease` 0 errors, debug + release builds clean. Local Android toolchain installed (`/opt/android-sdk`, platform 35, JDK 17) — builds now run here, not the VPS. Release: SHA-256 `6ae7416953f9dedcf23ae727a878d84b39efa6c4c4dc7ce6772d80f7cfee1b2b`, cert `e1749fd9…693e39` matches all prior releases. Devices page/README/docs point at 0.4.5.
- **Not verifiable without a device**: tap/drag feel, thumbnail scroll performance, camera intents across OEMs, tile/widget rendering, PIN UX, background-arrival timing, 0.4.4→0.4.5 upgrade preserving pairing. User tests these.
- **Ops notes**: commits now as Kennyy `<miracle32669@outlook.com>` (set in VPS repo config). `git add -A` committed `.next-pg/` build output again under 0.4.5 work — removed in a follow-up; `.gitignore` covers all staging dirs now. VPS disk was 96%, pruned to ~92%. Never build into the serving dir (staged `.next-045`, rollback conf + `.next-s3` preserved).
- **Remaining**: physical-device testing (user), multi-user boundaries (needs product decisions), external security review (needs auditor).

# 9t project handoff — 2026-09-20 (server tracks: config → docker → diagnostics → postgres → s3)

## Session summary (all pushed to main, all live on 9t.kennyy.xyz)

Five TODO tracks landed in one session, each verified in Docker before shipping. Live runs build `.next-s3` (commit `e1715a2`), JSON metadata primary, local filesystem blobs, no `DATABASE_URL`, no S3 driver. Rollback drop-ins in `/tmp/9t-dropin-before-{config,exposure,pg,s3}.conf`; prior builds (`.next-config`, `.next-exposure`, `.next-pg`, `.next-lavender`) preserved on VPS.

1. **Validated config import/export** (`caf3353`) — `GET /api/config?format=export` versioned envelope, `PUT /api/config` full replace accepting envelope or raw (old domain-less exports default to null), `PATCH` extended (`trashRetentionDays`, `exposure`, merged-module guard). Strict zod schemas, `invalid_config` + violations shape. Settings raw-JSON editor with per-field errors, CLI `9t config export|import`.
2. **Docker one-command install** (`6944c00`) — multi-stage `Dockerfile` (webpack build, pruned prod deps, `node` user, `/data` volume, healthcheck), `compose.yaml`, `.dockerignore`, install docs. Verified: fresh container setup → login → API works.
3. **Exposure/domain diagnostics** (`14b5c9e`) — `AppConfig.domain`, setup saves public hostname, `GET /api/status` exposes `runtime{host,port,https}`, new `GET /api/diagnostics` (auth + rate-limited DNS A/AAAA + HTTPS probe of fixed `/api/status` path only), Settings exposure/hostname editor + runner, CLI `9t doctor`. Verified against live DNS (`9t.kennyy.xyz → 193.122.5.91`, HTTPS 200).
4. **Postgres foundation + cutover** (`a5b9930`, `f1f36ae`) — `001_init.sql` (12 tables), `npm run migrate` (idempotent), `lib/server/pg.ts`, `lib/server/pg-store.ts` implementing the exact `readData/mutate` contract (advisory-lock transactions + diff writes), `lib/server/db.ts` facade switching on `NINE_T_DATABASE_URL` (18 files repointed, `store.ts` untouched so `tests/store.test.mjs` still passes), `npm run pg-import`. Verified: JSON baseline → import → flip URL → identical reads (auth, all types, pins, shares+counts, devices, tokens, config) and writes (create, file download, trash, config). Socket in PG mode relies on 20s heartbeat refresh (documented). Live NOT flipped — stays JSON until user says so.
5. **S3-compatible blobs** (`15cb7ed`) — `lib/server/storage.ts` (`put/get(range)/del`, local + `@aws-sdk/client-s3` drivers, web→Node stream normalization, UUID guard). All 5 blob paths switched (uploads ×2, downloads ×2, mobile 256K chunks). `NINE_T_STORAGE_DRIVER` + `NINE_T_S3_*` documented. Verified vs real MinIO: 900KB upload → byte-identical authed + public downloads, delete purges bucket key, misconfigured S3 fails clean 500, local mode unaffected. Found+fixed real bug: SDK can't hash web streams. Cleanup commits `3d4c472`/`e1715a2` untracked build output.

## Live/VPS notes

- Service `9t.service` active; `NINE_T_BUILD_DIR=.next-s3`. Never build into the serving dir (staging + switch pattern held throughout).
- ⚠️ VPS disk 96% (906M free, was 1.3–1.4G). Old `.next*` dirs accumulating (`.next`, `.next-lavender`, `.next-mobile-*`, `.next-config`, `.next-exposure`, `.next-pg`). Prune obsolete ones before next build or the build will fail.
- ⚠️ `git add -A` committed `.next-pg/` build output once (`15cb7ed`, 227 files); removed in `3d4c472`. `.gitignore` now covers all staging dirs. Check `git status` before every VPS commit.
- `next-env.d.ts`/`tsconfig.json` regenerate on each staging build — always `git checkout --` them before committing.
- Established ship flow (no Node locally): develop in worktree `/tmp/opencode/9t-s3` (branch `s3-storage`), verify via local Docker, `git diff` → patch → `scp` → VPS apply → `npm install` (if deps changed) → `npm run typecheck` → `node --test` → commit → push → staging build → switch drop-in → restart → verify → sync worktree to `origin/main`.
- User works on the Android APK in `/root/9t`; agent works in `/tmp/opencode/9t-s3`. Do not cross the streams.

## Remaining TODO (untouched)

- Multi-user ownership boundaries (needs product decisions: open vs invite registration, quotas) — biggest remaining item.
- External security review (requires a real auditor; cannot be done in-session).
- Long-term: client-side encryption, native clients, Caddy automation (docs cover manual proxy), S3→PG repo already done.

# 9t project handoff — 2026-09-19


## Current work: simplified lavender website — DEPLOYED, SOURCE UNCOMMITTED

User loved the minimal Android 0.4.3 UI and requested the same simplicity for the website, including a new homepage logo color. User chose **Muted lavender** via clarification.

- Updated web palette to lavender/neutral surfaces in light and dark modes. Bundled Space Grotesk font assets/license under `public/fonts/` and uses them across the website. Homepage/shared SVG retains its shape with flat lavender fill `#8c72ad`; removed prior gradient and CSS recoloring. Updated PWA manifest colors.
- Simplified workspace header, one-column capture composer with a compact upload strip, collection filters below capture, compact list default (respects explicitly saved grid preference), calmer grid cards, simpler copy, mobile icon dock without duplicate secondary navigation, softer borders without hard shadows/tilts/dotted background. Search, grid/list, Board, pinned/shared/trash views retained.
- Simplified login/setup to a centered form with the logo; settings preferences collapse into a native details section. Inspector/dialog styling and action labels updated. Fixed 320px grid overflow during browser verification.
- Final production build + TypeScript passed. The host rebooted during the original Turbopack build; switched to `NINE_T_BUILD_DIR=.next-lavender NODE_OPTIONS=--max-old-space-size=384 npm run build -- --webpack`. `next.config.mjs` now caps build CPUs at 1 and enables webpack memory optimization. Build log: `artifacts/lavender-build.log`. Existing middleware deprecation warning remains.
- Browser checks passed against isolated fixture data on port 3273: capture/save, search, type filters, list/grid, settings disclosure, theme changes, inspector, login, font/palette loading, and no horizontal overflow at 320/390/1365px. No page errors. Script/log: `artifacts/lavender-review.cjs`, `artifacts/lavender-review.log`. Actual browser screenshots reviewed: `artifacts/lavender-{desktop,grid,mobile,mobile-dark,settings,inspector,login}.png`. These are fixture screenshots, not owner content.
- Deployed the tested `.next-lavender` build by updating `/etc/systemd/system/9t.service.d/mobile-build.conf`, daemon-reload and restarting `9t.service`. Service active; public status healthy; both live CSS assets 200 text/css; live SVG/manifest palette and font files verified; APK 0.4.3 download HTTP 200. Devices page now includes the 0.4.3 source link in the deployed bundle. No production user-data changes.
- **Current live build is `.next-lavender`. Never build into it while serving.** Original `.next` preserved. Rollback drop-in is `artifacts/lavender-previous-service.conf`; install to existing systemd drop-in, daemon-reload/restart to roll back. `.gitignore`, generated Next types and tsconfig include staging directory.
- All source changes remain uncommitted, including prior Android 0.4.3 work below. No commit/push made. APK itself was not changed during this website task.


## Current work: Android 0.4.3 native redesign — PUBLISHED, SOURCE UNCOMMITTED

User explicitly rejected 0.4.2's default fonts, structure, arrangement and lack of icons; asked to read this handoff and improve the APK to match the website. Website styling was retained.

- Bundled static Space Grotesk Regular/Bold (SIL OFL included under `android/app/src/main/assets/fonts/`). Uses asset loading compatible with API 21. Native headings, body text, inputs, buttons, navigation, spinner and dialogs use the bundled fonts; snippet previews intentionally use monospace.
- New `PocketArt.java` draws resolution-independent line icons and the dotted paper background. Icon + label bottom navigation, icon actions, neon primary actions and dark snippet previews. Fixed neon logo/active navigation contrast in dark mode and legacy Android system-bar contrast.
- Inbox: new hero, compact sync row, local search across name/text/URL, Everything/Files/Snippets/Links filters, illustrated empty state, compact item actions. Background item refresh preserves search/filter controls instead of rebuilding the screen.
- Send: side-by-side Paste/Send actions, queued-item cards. Draft survives tab changes and saved-instance recreation. Connect: expandable Appearance, Your workspace, Files & clipboard, Background receiving, Disconnect sections. Expanded sections persist during this activity and saved-instance recreation. Disconnect clears the new in-memory UI state.
- Version **0.4.3 / code 9**, min SDK 21, same release signing certificate. APK published and public bytes verified identical: https://9t.kennyy.xyz/downloads/9t-android-0.4.3.apk . SHA-256 `d840cdd9cdac69dd519c532cf6cdf714056906ad610cc44307cd0dbbfc27b9a2`. Local `artifacts/9t-android-0.4.3.apk` and `public/downloads/9t-android-0.4.3.apk` (ignored). Install over existing app to retain pairing/history.
- Final Gradle `assembleRelease testDebugUnitTest lintDebug` passed: **20 tests, 0 failures/errors/skips; lint 0 errors, 22 warnings**. Verified manifest version/minSDK, bundled fonts/license, and v1/v2/v3 signing. `git diff --check` passes. Log `/tmp/9t-043-verified.log`. Initial 256m heap/192m metaspace run exhausted metaspace; final successful run used one worker, 384m heap/384m metaspace, no persistent daemon. Fixed two new API-23-only Switch tint calls to use API-21 drawable tint before release. Stopped Gradle afterward.
- Restarted existing `9t.service` (sudo required) to expose new static APK; service active, public status healthy, live CSS HTTP 200 with text/css. **No web rebuild.** Devices download link updated to 0.4.3 in source only; existing live bundle still has its older link. README, Android docs and signing-script default updated. No commit/push performed.
- **No Android device/emulator is attached. No actual visual/device runtime validation or screenshots.** Build/tests/lint do not establish appearance on a physical phone. Review Inbox/Send/Connect in both themes, large text, search/filter behavior, composer retention and existing sync on user's device next.


## Current work: Android 0.4.2 native UI restyle — PUSHED

User said the app looked terrible next to the website. Restructured `MainActivity.java` beyond colors: per-tab heroes (dark eyebrow pill + black headline + muted sub), `card()`/`sectionLabel()`/`secondary()` helpers, Connect split into APPEARANCE / CONNECTION / DOWNLOADS / LIVE RECEIVING / DANGER ZONE cards, fixed white-on-neon kind pills in dark mode. Commit `c15a43d` pushed. Release-only Gradle build took ~2 min (lighter than full build); signed + published https://9t.kennyy.xyz/downloads/9t-android-0.4.2.apk , SHA-256 `089140d22db118113563d7b43f2ea6c35b9eb2b0511a90cbd25b57f048ec06d7`, same cert, live hash verified. Unit tests not rerun (presentation-only change). Devices-page link points at 0.4.2 in source only — live page still shows 0.4.1 until next web rebuild, which is deferred (VPS at ~80 MB free RAM). No physical-device test yet.

## Current work: Tactile Paper + Neon UI rebuild (web) + Android 0.4.1 — PUSHED

User asked for a cooler, more unique UI on both website and Android app. Chose **Tactile Paper + Neon** (warm dotted paper, sticker cards with ink borders + hard shadows, neon `#D9FF4B` highlights) with a topbar + tab-pill shell replacing the sidebar, implemented in per-component CSS modules. Commit `13f06b3` is pushed to `main` (rebased over remote README-only commits `4eb8a15`–`8f66f09`).

- Web: new `Workspace/Capture/Cards/Dialogs.module.css`; rewrote `Workspace.tsx` (no sidebar), `UniversalInbox.tsx` ("Quick Stick"), `ObjectCollection.tsx` (sticker cards, dark code previews), `WorkspaceDialogs.tsx` (sticker modal + inspector sheet); new tokens in `styles/globals.css`. Contrast fix: neon surfaces always use fixed dark `--on-neon` text and dark `--badge-bg` badges, after white-on-neon was unreadable in dark mode. List-view overflow fixed (rows wrap, long names ellipsis, actions drop below on phones).
- Android 0.4.1 / code 7: same tokens in `MainActivity.java` (neon logo pill, sticker bottom nav, sticker inbox cards, chunky titles). No protocol changes. Signed APK published: https://9t.kennyy.xyz/downloads/9t-android-0.4.1.apk , SHA-256 `29176456fcf3f1b173f7bb6888105d2c66f1e6f00173953e0b7a33c065ad406e`, cert matches all prior releases. Live bytes verified identical; `9t.service` active.
- `npm run typecheck` + `npm run build` pass. Release `assembleRelease` succeeded; **unit-test/lint counts unverified** — the VPS rebooted mid-session (see below) and wiped the build log. UI edits are presentation-only, but rerun `testDebugUnitTest` + `lintDebug` when resources allow. No physical-device test of 0.4.1 yet.
- Devices page + README + `docs/android.md` point at 0.4.1 **in source only** — the live web build predates the link change, so `/devices` still shows 0.4.0 until the next web rebuild + restart. Direct 0.4.1 URL above works now.
- ⚠️ Do NOT build into the live `.next` and walk away: twice built into the serving directory, causing stale chunk hashes → live CSS 500ing as `text/plain` → browser `nosniff` refusal. Fixed both times with `systemctl restart 9t.service` + verified `200 text/css`. Prefer staging `NINE_T_BUILD_DIR` then switch, or build + immediately restart.
- ⚠️ VPS is undersized for Android work: 2 vCPU, 2 GB RAM (builds leave ~70–100 MB free, swap ~90% used), 19 GB disk at 96% (`~/.gradle` 651 MB, `/var/log` 624 MB). Machine rebooted during the Gradle build (uptime reset, `/tmp` wiped). Do not run web + Gradle builds back-to-back; run `./gradlew --stop` after Android builds. Consider a larger instance or building APKs off-host.

## Current work: Android 0.4.0 — general compatibility and transfer recovery

User reported that both files and snippets on their local LAN installation stopped arriving while 0.3.1 was hidden (Android 15, battery exemption granted, service reported active). Report shows background sync at 13:34:19, then reopening at 13:40:22. This does not establish a phone-brand-specific root cause. User explicitly wants general phone compatibility, including Android 5; iOS is deferred.

- Lowered minimum SDK from 29 to 21 with AndroidX service/notification compatibility, guarded platform calls/resources, Java API desugaring, legacy Downloads/FileProvider storage with permission handling, and Android 5 RSA-Keystore-wrapped local AES key. Existing modern pairing storage remains unchanged.
- HTTP now uses OkHttp whole-call/read/write deadlines instead of a separate HttpURLConnection.disconnect timer. Timeouts no longer silently exit the download pass as if the user paused. Text is processed before files and clipboard delivery is scheduled immediately.
- Live reconciliation every 15 seconds while push is connected; service maintenance also requests catch-up. CPU lock renewal continues through network failures until service stop. Removed reconnects on every capability update and on screen/recents events; actual network changes still reconnect. Concurrent sync attempts retry instead of reporting success after skipping work.
- Diagnostics distinguish heartbeats from revision changes and record sync phase and HTTP start/finish. Removed brand-specific UI guidance.
- APK version 0.4.0/code 6. Native minimum Android 5; embedded modern website still depends on WebView compatibility and HTTPS. Do not claim universal firmware/runtime coverage.
- New HttpTransferTest exercises a stalled response and autonomous ReceiveLoop recovery without another UI request. The 20 JVM tests passed during the first completed run; lint then identified three API 21 compatibility errors, which were corrected. Final build/check status follows below.
- No attached Android device (`adb devices -l` empty). No physical background-delivery verification, including Android 5 runtime verification. Do not claim the reported phone failure has been reproduced or conclusively fixed.
- Changes are uncommitted. No server protocol changes; the updated APK works with the existing laptop server. Current live web build is `.next`; never build into it while serving.
- Final 0.4.0 build passed `assembleRelease`, 20 JVM tests, and lint (warnings remain; zero errors). Signed APK: `artifacts/9t-android-0.4.0.apk` and `public/downloads/9t-android-0.4.0.apk`; SHA-256 `64a986ece661af50619fdc92e1cbbb4397b92d88a4a459d1c490154f5c6e7bbe`. It has not been installed on a physical device or deployed through the live service in this session.

## Follow-up: public-link sync speed

User confirmed 0.4.0 works on the phone and asked for public-link receiving to converge as quickly as LAN. Commit `dd409b0` is pushed to `main`.

- Connected push reconciliation is now 5 seconds instead of 15 seconds.
- Public socket reconnect backoff is capped at 10 seconds instead of 60 seconds, so a carrier/proxy socket failure does not create a long apparent sync stall.
- The encrypted WebSocket remains the immediate delivery path; reconciliation is the recovery path for missed change frames.
- The change is source-only so far. A new signed 0.4.1 APK still needs to be built and published before phones receive it. The host became memory constrained during the incremental Gradle build; no 0.4.1 APK was produced or deployed.
- 0.4.0 remains the latest public APK. Do not claim the public-link speed change is installed until a 0.4.1 APK is built, signed, published, and tested.

## Current update: background receiver recovery (0.3.1)

- Published **0.3.1 / code 5**: https://9t.kennyy.xyz/downloads/9t-android-0.3.1.apk . Install over the existing app; original release signing certificate verified. SHA-256: `428bcb52c2b24bef782ba11e1106d85c8dcf371884feacf18720736040a330fb`.
- `SyncJob` now attempts to revive a missing foreground receiver before file catch-up. Android 12+ recovery is gated on the battery-optimization exemption, pairing, receiving enabled, and the service not already active. This restores the persistent socket when Android allows the scheduled job and service start; job execution may be delayed.
- LAN/Automatic with a saved LAN endpoint retains continuous `connectedDevice` receiving. Cloud recovery only resumes an existing unexpired session; it never creates a fresh background allowance. Expiry/Android timeout clears `liveDeadline`. The earlier experimental 24-hour cooldown/new-session policy was removed before release.
- Verification: 19 JVM tests passed (11 LiveSession, 4 ReceiveLoop, 2 SocketSequence, 2 Protocol); release build passed; lint zero errors / 17 warnings; `git diff --check` passed. APK package/version/signing certificate verified, and the downloaded public APK hash matches the signed artifact.
- Published a new versioned APK without replacing earlier APKs. Restarted `9t.service` to expose the new static file; service active and public `/api/status` healthy. No web rebuild performed; use the direct 0.3.1 URL above (the existing Devices page may still link 0.3.0).
- Deployment correction: the actual systemd drop-in uses `NINE_T_BUILD_DIR=.next`; the previous `.next-mobile-build` statement below is historical. Do not build into the currently serving directory.
- The 0.3.1 release commit includes recovery changes, tests, documentation, and the signing script default. `docs/android.md` now references 0.3.1. KDE Connect research is included in `docs/kdeconnect-connection-study-2026-09-18.md`.
- Physical-phone verification remains outstanding. Open the updated app once, approve **Connect → Allow background receiving**, then test new files/snippets while another app is open and while locked. For Tecno/HiOS allow background activity/auto-start if offered. Force-stop requires reopening. Capture **Receiver details → Copy details** if receiving stalls; automated tests do not establish actual screen-off delivery.

## Current update: persistent encrypted phone connection (0.3.0)

- User requested a KDE Connect-style persistent connection because 0.2.2 still delivered only after opening the app. This is now committed and pushed in the current session.
- Server: `scripts/serve.mjs` wraps Next with an encrypted WebSocket endpoint at `/api/mobile/socket` on the existing HTTP/HTTPS port. `scripts/run-server.mjs`, `npm start`, and `npm run dev` use it. A file watcher plus heartbeat sends only a revision/changed signal; item contents remain in the existing AES-GCM HTTP API. Old servers and clients continue polling.
- Android: `EventConnection` uses OkHttp, challenge + fresh client nonce authentication, AES-GCM event frames, sequence checks, heartbeat, reconnect/backoff, LAN/public route fallback, and catch-up through `SyncEngine`. `ReceiveLoop` remains the transfer fallback. Version is **0.3.0 / code 4**; the release dependency is OkHttp 4.12.0.
- Security tests passed: four Node socket integration tests cover encrypted change notifications, session-write suppression, revocation close, wrong-key/replay/oversized-frame rejection, reconnect revisions and nonce binding. Android build passed 13 JVM tests (4 ReceiveLoop, 5 LiveSession, 2 SocketSequence, 2 Protocol), release compilation and lint; no physical Android device is attached.
- `npm run typecheck` passed. `npm audit` is clean after upgrading direct `ws` to 8.21.3. `git diff --check` passed. The normal `tests/mobile-api.mjs` should be rerun against a fresh isolated server; `--socket` additionally checks real API writes notify a connected phone.
- Deployment requirement: build a staging Next directory, switch the systemd `NINE_T_BUILD_DIR` drop-in, daemon-reload/restart, then verify `/api/status` and the APK. Existing Nginx passes WebSocket upgrades. Do not build into the live directory. The WSL Windows portproxy remains unchanged because the socket uses the same TCP port.
- APK URL after signing/publishing: `https://9t.kennyy.xyz/downloads/9t-android-0.3.0.apk`. Current SHA-256 is `9175773bf2a57fbd7882b8a46acc065656cc30e89d4a083ebbc4caa62b89ad3c`. Preserve the release key. Pairing/server wire HTTP API is unchanged; no re-pair should be required.


## Start here — current handoff

- Repository: `/home/ubuntu/9t`, branch `main`, remote `https://github.com/M3264/9t.git`.
- Latest committed state: the current Git history includes the persistent connection, web auto-sync, theme toggle, and image-paste fixes. Earlier implementation commit: `f57b33c`; installer: `c68f345`.
- Live instance: `https://9t.kennyy.xyz`, systemd `9t.service`, port 3265, build `.next-mobile-build`, build ID `0Rx-dCAtCC_vXzzmdmD7S`. User's Windows/WSL laptop installation is separate and cannot be inspected from this host.
- Android **0.2.2 is published and verified**: https://9t.kennyy.xyz/downloads/9t-android-0.2.2.apk . The live Devices page now links to 0.2.2. APK/signing artifacts are ignored by Git; preserve the original signing key.
- User tested 0.2.1: the live notification stays visible, but **both files and clipboard arrive only after opening the app**. User pointed to KDE Connect as a working comparison. No physical-phone result exists for 0.2.2 yet.
- Deployment is complete. Next: user installs 0.2.2 over the existing app, approves background battery access, and tests another-app and screen-off receiving. If it still stalls, collect **Connect → Receiver details → Copy details**. Do not replace an older versioned APK with new bytes.
- Limits in 0.2.2: LAN computer connections use `connectedDevice` without the application's five-hour cutoff; cloud-only/Internet-only receiving retains time-limited `dataSync` and scheduled fallback. Android battery exemption is requested directly with consent. OEM restrictions and force-stop still apply; the laptop must remain reachable/awake. Native HTTP LAN transfers work; embedded Workspace requires trusted HTTPS.
- Read `docs/installation.md`, `docs/network-troubleshooting.md`, and `docs/android.md` for current operational instructions. Earlier sections below preserve historical implementation details; their old uncommitted/deployment statements do not describe the current Git state.

## Latest update: persistent LAN receiving and diagnostics (0.2.2) — 2026-09-18

The 0.2.1 phone test failed despite the notification remaining visible. Inspected KDE Connect's public Android source and Android's official foreground-service and Doze documentation. KDE Connect uses `connectedDevice`, while 9t previously always used `dataSync`. A visible notification/wake lock alone does not exempt networking from Doze. Without device logs, these are identified gaps, not a proven diagnosis of the specific Tecno freeze.

Implemented:

- Select `connectedDevice` for a configured LAN endpoint in Automatic/LAN-only mode, with `CHANGE_NETWORK_STATE`, Wi-Fi retention without internet validation, sticky recovery and enabled/paired boot/update restoration. Select **only** `dataSync` for cloud-only or Internet-only mode; preserve its five-hour deadline on process recovery and never start it from boot.
- Direct **Allow background receiving** system battery-exemption request, one-time explanation after upgrading, live battery/background-status text and an app-settings shortcut for HiOS controls.
- Separate `ReceiveLoop` coalesces reconnects, never overlaps its own work, schedules retries even when error reporting throws, and rejects stale/canceled callbacks. Notification-update exceptions cannot terminate future polling. Scheduled jobs now retain per-run cancellation across restarts. Network changes and unlock trigger reconnection/copying without opening 9t.
- Renewable timed partial wake lock while the receiver progresses, released on stop. HTTP requests have a 30-second cancellation timer as well as connect/read timeouts.
- Connect displays **0.2.2**, last receiver check and last background sync. **Receiver details → Copy details** preserves separate background timestamps and reports lifecycle events, error classes, transfer/clipboard timing, battery restrictions and Data Saver state. Reports exclude endpoint URLs, pairing credentials and item contents. The notification timestamp reflects the last successful network response.
- Server wire protocol is unchanged: no laptop-server upgrade or new pairing is required for this APK.

Artifacts and completed checks:

- Package `xyz.kennyy.ninet`, version **0.2.2 / code 3**, minimum API 29, target/compile 35; 103,041-byte signed APK.
- Local APK: `artifacts/9t-android-0.2.2.apk`; published file: `public/downloads/9t-android-0.2.2.apk`; URL: https://9t.kennyy.xyz/downloads/9t-android-0.2.2.apk .
- SHA-256: `f45bd2690290db7bfd9106f5c52e04bb5442b7cbefe2396e8ce02dbf19e2f2e6`.
- Signing certificate matches all prior releases: `e1749fd90490890a20260846c1bfda9dd6f2ea790b120074958a83db7a693e39`. Older 0.2.0 and 0.2.1 public APK files retain their recorded hashes.
- Release build and **11 JVM tests passed**, zero failures/errors/skips. Tests cover protocol integrity, cloud deadlines and boot eligibility, exception recovery, reconnect coalescing, pause cancellation and stale callback races.
- Android lint: **zero errors, 15 warnings**. The added `BatteryLife` warning concerns the intentional direct exemption request for core offline-LAN receiving; other warnings concern existing preferences, localization, backup and space queries. Do not describe lint as warning-free.
- `node --test tests/*.test.mjs`: **8 passed**, including Java/Node encryption interoperability and installer/store checks.
- Final production web build and TypeScript passed; existing middleware/proxy deprecation warning remains. `tests/mobile-api.mjs` passed against fresh isolated data: authenticated pairing, encrypted text/files, replay/tamper/stale rejection, idempotency, chunk resumption, filtering, web sessions and revocation. Browser check `/tmp/9t-022-web-smoke.cjs` passed: authenticated Devices UI, pairing/revocation, exact 0.2.2 link, APK download, mobile layout and no page errors. These were fixture tests, not authenticated production tests.
- Deployed the tested `.next-mobile-build` via the existing systemd drop-in. `9t.service` is active; local and public `/api/status` return initialized/healthy. Downloaded public APK bytes exactly match the signed local artifact and hash above. The live JS bundle `/_next/static/chunks/07ol492ani3ul.js` contains the new download link.
- Old `.next-mobile-release` remains available for rollback; previous drop-in saved at `/tmp/9t-mobile-build-before-022.conf`. Restore that file to `/etc/systemd/system/9t.service.d/mobile-build.conf`, daemon-reload and restart if needed. Do not build into `.next-mobile-build` while it is serving production. `next-env.d.ts` now references its generated types.
- Isolated server on 3274 was stopped and its fixture data removed. Production account/data configuration was retained. `git diff --check` passed.
- **No physical Android test**: `adb devices -l` returned no attached device. Automated JVM checks are not proof of Tecno/HiOS runtime behavior.

Next user test: install 0.2.2 over the old app, approve **Allow background receiving**, use the saved laptop LAN address in Automatic/LAN-only mode, then send a new file and snippet while another app is visible and while locked. If delivery still stalls, request **Connect → Receiver details → Copy details** rather than guessing from the notification alone. Phone/HiOS background activity and auto-start may require separate settings.

Earlier sections below are historical, including their old Git, download and deployment statements.

## Earlier update: Android background receiving (0.2.1) — 2026-09-18

User tested a laptop/WSL installation successfully after forwarding Windows Wi-Fi IP `10.28.24.8:3265` into Ubuntu. Their Tecno on Android 15 then only synced while the app was visible. Version **0.2.1 / code 2** addresses receiver lifecycle gaps: paired/unpaused activity resume starts live receiving automatically; sticky process recovery preserves the existing five-hour deadline; a bounded partial wake lock keeps screen-off CPU sleep from suspending live polling; pause/disconnect still stop receiving; periodic jobs no longer reset on every activity resume; boot and APK updates restore scheduled jobs. Connect has battery optimization status and a system-settings shortcut with OEM guidance.

Android 15 still imposes its six-hour daily dataSync budget. This is not unlimited real-time reception: live sessions end after five hours, with a persisted roughly 15-minute job subject to OS delays. Doze/manufacturer restrictions and force-stop remain relevant. User must verify on their Tecno; no connected device/emulator was available here. Install over the old app, open once, allow notifications and background battery use, switch apps and send a new file/snippet, then test screen-off, pause/reopen and reboot. Existing pairing/history should be retained by the same-package/same-key upgrade.

- Signed APK: https://9t.kennyy.xyz/downloads/9t-android-0.2.1.apk
- Local copies: `artifacts/9t-android-0.2.1.apk`, `public/downloads/9t-android-0.2.1.apk` (ignored).
- SHA-256: `4ea1503d5a7b7d57ce49e261d955bb22cca3e6485160f5894ed58da47de54572`.
- Signing certificate unchanged: `e1749fd90490890a20260846c1bfda9dd6f2ea790b120074958a83db7a693e39`.
- Verified release build, five JVM tests (three session-deadline regressions + two existing protocol tests), lint with zero errors / 14 warnings, APK signature, and exact public/local APK hash match. These are not physical-device lifecycle tests.
- Restarted `9t.service` to expose the newly added public file; status active and public `/api/status` healthy. Same `.next-mobile-release` server build and data. The Devices page download link is updated **in source only**; its deployed older build still links 0.2.0 until the next web rebuild. Use the explicit 0.2.1 URL above.
- User explicitly requested parallel documentation work. New `docs/network-troubleshooting.md` covers WSL NAT forwarding, firewall, hotspot/IP choice, diagnostics and same-instance pairing. README and installation guide link it; `docs/android.md` documents new receiving behavior and Tecno checks. Windows commands were checked against Microsoft references, not executed on Windows here.

## Latest addition: guided installation

The workspace/Android work below was committed and pushed as `39dc776`. A subsequent user request added an interactive installer: fresh clones run `./setup.sh`, or `./9t setup` / `npm run setup` with Node already installed. It installs dependencies, builds the app, creates the administrator with a salted password hash, saves actual module/theme/storage/network preferences, and offers foreground startup, a Linux systemd service, or starting later. Optional CLI link: `~/.local/bin/9t`.

See `docs/installation.md`. Main implementation: `scripts/setup.mjs`, `scripts/run-server.mjs`, root launchers `9t` and `setup.sh`. `npm start` now uses the runner to honor `.env.production` host/port/data settings and inherited deployment build overrides. No live service restart or installation reset was performed for this change. Public setup expects an existing same-host HTTPS reverse proxy and produces a Caddyfile example; DNS, certificates, and firewall provisioning are not automated.

Verified: six installer unit checks; an actual clean temporary checkout with npm dependency installation, production build, initialized login and saved preferences; and a real PTY interaction covering preference prompts, hidden password/confirmation, summary and cancellation without writes. Temporary test server and checkout were cleaned up. The optional Node-download bootstrap and privileged systemd installation were not exercised on this host; shell syntax and generated service configuration were checked. Regression tests remain in `tests/setup.test.mjs`, `tests/setup-install.mjs`, and `tests/setup-interactive.py`.

The Android deployment/phone-testing details below are the earlier handoff and remain relevant. Its statements about uncommitted work and the user's last request are historical.

## Current state / user request

User asked for an installable Android client, automatic saving of incoming files, clipboard delivery, LAN-first transfers without internet when the server is local, automatic internet fallback, and useful reliability improvements. They then clarified that the app should include all existing website features. Latest instruction: **stop and hand off because tokens are running out**.

Implemented a first signed Android APK plus companion server/device-management features. **Deployed to the existing live 9t server**, then checked deployment after the user interrupted. No deployment is pending. Actual Android device/emulator runtime verification is still outstanding; do not claim otherwise.

- Repo: `/home/ubuntu/9t`, branch `main`; extensive uncommitted work predates this task. No commit or push made. Preserve all changes.
- Live: https://9t.kennyy.xyz
- APK: https://9t.kennyy.xyz/downloads/9t-android-0.2.0.apk
- Pairing page: https://9t.kennyy.xyz/devices (sign in first), also linked from Settings.
- Local APK: `artifacts/9t-android-0.2.0.apk` and `public/downloads/9t-android-0.2.0.apk` (ignored binary artifacts).
- APK SHA-256: `dd6b80b537efc065096c71cc9be41a52488acf36e38981302eb7fd09c2639eb0`.
- Android package: `xyz.kennyy.ninet`, version 0.2.0 / code 1, minimum API 29 (Android 10), target/compile API 35. Universal Java-only APK, about 81 KB.
- APK signature verified (v3). Signing certificate SHA-256: `e1749fd90490890a20260846c1bfda9dd6f2ea790b120074958a83db7a693e39`.

## Deployment state verified at handoff

- `systemctl is-active 9t.service`: **active**.
- Public `/api/status`: **HTTP 200**.
- Public APK: **HTTP 200**, downloaded bytes match the local signed APK SHA-256 exactly.
- Current build ID: `BrUSXcLaYvkUklu6hy6GB`.
- Current build directory: `.next-mobile-release`.
- `next.config.mjs` now supports `NINE_T_BUILD_DIR`, defaulting to `.next`.
- Added `/etc/systemd/system/9t.service.d/mobile-build.conf` containing:
  ```ini
  [Service]
  Environment=NINE_T_BUILD_DIR=.next-mobile-release
  ```
- Reloaded systemd and restarted service. This serves the tested separate build without overwriting the old `.next` build during compilation.
- Original service still uses `/home/ubuntu/9t`, `.env.production`, `npm run start`, port 3265, existing Nginx/HTTPS.
- Old `.next` build remains available for rollback. To roll back, remove the mobile-build drop-in, daemon-reload, and restart. New data fields are optional/additive.
- Tests used isolated data, never production account fixtures. No authenticated production workflow was tested.

## What was implemented

### Android (`android/`)

Native Activity UI with Inbox, Workspace, Send, Connect tabs, styled with the workspace's green/warm-neutral palette.

- Inbox: private SQLite history, offline text viewing/copying, automatic files into Android `Downloads/9t` through MediaStore, open saved files, per-item errors/retry, resumable private partial files, published-download crash recovery, duplicate tracking.
- Clipboard: new snippets automatically written as plain text while unlocked; latest snippet wins. Locked delivery is deferred with a notification. Large snippets stay in the inbox for selecting/copying a smaller portion. Links are stored but do not automatically replace the clipboard. No background reading of other apps' clipboard.
- Send: native text composer, explicit paste, Android text Share target, persistent offline text outbox, idempotent retries, remove queued text. Native send limit: 100,000 characters.
- Connect: saved LAN/public endpoints; Auto/LAN-only/Internet-only modes; explicit Wi-Fi network routing works without validated internet; LAN cooldown and network-change recovery; file/clipboard toggles, unmetered-file option, automatic size cap (default 500 MB), pause and live receiver.
- User-started foreground dataSync service polls about every five seconds, backs off on failure, voluntarily ends at five hours and handles Android timeout. Persisted JobScheduler recovery around every 15 minutes subject to Android scheduling/battery restrictions; boot reschedules jobs.
- Pair key wrapped in Android Keystore; backup disabled. Cleartext HTTP restricted in client code to private IP LAN endpoints, with encrypted application traffic. Standard HTTPS certificate checking remains enabled.
- **Full existing website feature coverage is via an authenticated embedded WebView**, not a complete native rewrite. Workspace includes files/uploads, snippets, links, Board, search, grid/list, pins, shares, trash/restore, settings, themes, device management. Supports file picker and downloads. Uses device-issued cookie session and retries sign-in/network errors.
- Full Workspace needs HTTPS. Native encrypted transfers support private HTTP LAN. Complete offline website editing and native offline file upload are not implemented.

Key Android classes under `android/app/src/main/java/xyz/kennyy/ninet/`: `MainActivity`, `Transport`, `Endpoint`, `Wire`, `Prefs`, `LocalStore`, `SyncEngine`, `ReceiveService`, `SyncJob`, `BootReceiver`, `Notices`.

### Server / web

- `app/api/devices/route.ts`: authenticated CSRF-checked list/create/revoke devices; pairing secret only returned at creation. Revoke also removes linked web sessions.
- `app/devices/{page.tsx,DeviceManager.tsx}`: authenticated APK download, pairing-code creation/copy/hide, device list/revoke. Settings link in `WorkspaceDialogs.tsx`.
- `lib/server/mobile-crypto.ts`: AES-256-GCM envelopes. Associated data binds instance/device/direction and responses to request ID.
- `app/api/mobile/route.ts`: encrypted sync metadata paging, text retrieval, authenticated 256 KiB file chunks, idempotent text sends, device-issued web sessions. Request size cap, rate limiting, five-minute timestamp tolerance, ten-minute in-memory replay protection. Expired/trashed/disabled-module items excluded.
- `lib/server/store.ts`: optional instance/device records and device-linked sessions; do not overwrite existing data on non-ENOENT read errors. Earlier queue recovery fix retained.
- `lib/server/auth.ts`: device-issued web sessions additionally require device to still exist. This closes revocation races.
- Device keys are recoverable in the mode-0600 server data file (required for encrypted RPC); protect backups. Replay memory resets on restart; text idempotency persists through deterministic IDs.
- Updated white paper with Android extension; detailed setup/design/limitations in `docs/android.md`.

## Verification completed

- Android debug and release builds passed.
- Android JVM tests: 2 passed, zero failures/errors (URL restrictions and cryptographic tamper/peer/direction checks).
- Android lint passed: **zero errors, 15 warnings**. Warnings: synchronous preference commits, default locale, boot receiver action check, backup rules, usable-space query, text localization. Do not report a warning-free lint run.
- APK alignment/signing and `apksigner verify` passed.
- `node --test tests/*.test.mjs`: 2 passed (existing storage queue regression and actual Java/Node crypto interoperability + tampering checks).
- Final production web build passed (existing middleware→proxy convention warning remains).
- `tests/mobile-api.mjs` passed against isolated server: auth/CSRF, pairing, encrypted text/files, replay/stale/wrong-key rejection, text idempotency, exact multi-chunk file round-trip, offset/revision validation, trash/module filtering, web sessions, device + session revocation.
- Playwright `/tmp/9t-mobile-web-smoke.cjs` passed against final isolated build: sign-in, device page, create/parse pairing code incl. server-created timestamp, 390px no-overflow, signed APK download, hide/revoke, desktop render, no browser page errors.
- `git diff --check` passed.
- Public live status and exact APK bytes verified after restart.

## Important remaining validation / limits

**No Android emulator or physical phone runtime test completed.** Tried setting up Android emulator, but this host has roughly 2 GB RAM and insufficient spare disk for the emulator's requirements alongside live services. Removed the task-created emulator image/AVD/emulator binaries afterward. Do not imply screenshots or clipboard/download tests on Android exist. Web pairing screenshots are not Android app screenshots.

Next session should install the signed APK on the user's actual phone and verify:

1. Pairing, notifications, MediaStore auto-save/open, exact file content, duplicate behavior after restart.
2. Incoming clipboard writes foreground/background/unlocked/locked, OEM battery restrictions, large snippet fallback.
3. Real LAN without internet, then public fallback, Wi-Fi changes mid-file, reconnection and retained offsets.
4. Embedded Workspace uploads, clipboard actions, shares, Board, session refresh and downloads on that phone's WebView.
5. Pause/restart/boot/force-stop behavior; revoking a paired phone from the live website.

The app is a first preview. Android can defer/stop background work; no unconditional always-connected guarantee. Foreground dataSync is time-limited on Android 15+. Target SDK 37 migration will need Android 17 local-network permission handling.

**Cloud hosting is not LAN hosting.** Current public server is cloud-hosted. Offline local transfers require the same 9t installation actually reachable on LAN, or an available private route. No local replica, mDNS discovery, router configuration, NAT traversal, tunnel provisioning, or certificate wizard was added. User must enter a stable LAN endpoint. Full Workspace requires trusted HTTPS even when LAN transfers use encrypted HTTP.

## Build tooling / artifacts / secrets

- SDK: `/home/ubuntu/android-sdk` (platform 35, build-tools 35.0.0, platform-tools, command-line tools).
- JDK 17 installed.
- Gradle 8.11.1: `/home/ubuntu/.local/share/gradle-8.11.1/bin/gradle`; checked-in wrapper in `android/`; AGP 8.9.2. Ignored `android/local.properties` points at local SDK.
- Build: `cd android && ./gradlew assembleDebug assembleRelease testDebugUnitTest lintDebug`.
- Signing script: `scripts/sign-android.sh`. Uses `ANDROID_HOME`, `NINET_KEYSTORE`, `NINET_PASSWORD_FILE`; optional `NINET_ALIAS` (default ninet).
- **Preserve release signing material for future updates:** `/home/ubuntu/.local/share/9t-signing/release.jks` and `/home/ubuntu/.local/share/9t-signing/password` (private, outside repo). Never print/commit these. Same key required for APK upgrades. Version code must increase for next release.
- Signing command:
  ```sh
  ANDROID_HOME=/home/ubuntu/android-sdk \
    NINET_KEYSTORE=/home/ubuntu/.local/share/9t-signing/release.jks \
    NINET_PASSWORD_FILE=/home/ubuntu/.local/share/9t-signing/password \
    scripts/sign-android.sh
  ```
  Then copy verified APK into `public/downloads/` before the next web restart/build as appropriate.
- Signer store/key passwords are identical; script intentionally omits `--key-pass` because passing the same password file twice consumes two lines and fails.
- `.gitignore` excludes Android build caches/signing files, APK artifacts, and staging build directories. Binary APK is currently not committed.
- Next regenerates `next-env.d.ts` / `tsconfig.json` paths for custom build directories. Current generated paths include `.next-mobile-release`; keep that in mind if changing staging directory.
- Logs: `/tmp/9t-android-final-build.log`, `/tmp/9t-mobile-final-web-build.log`.
- Test datasets: `/tmp/9t-mobile-api-test`, `/tmp/9t-mobile-final-api-test`. Test credentials are fixtures only. API integration test refuses any URL except `http://127.0.0.1:3274`.
- Pairing web screenshots: `/tmp/9t-android-pairing-mobile.png`, `/tmp/9t-android-pairing-desktop.png` (fixture device was revoked).
- Playwright package: `/home/ubuntu/.npm/_npx/fd3bca3c548369c0/node_modules/playwright`; installed headless Chromium under `.cache/ms-playwright`.
- Isolated test server on port 3274 was stopped during handoff. Production on 3265 remains running.

Previous UI handoff archived at `docs/handoff-ui-2026-09-16.md`. Existing unrelated/uncommitted changes remain intact. No further implementation should be inferred from this handoff request.
