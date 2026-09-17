# 9t Android + LAN handoff — 2026-09-17

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
