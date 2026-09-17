# 9t Android — network and transfer client

9t Android 0.2.0 is a native Android receiver with the **full existing web workspace embedded inside the app**. It is not a rewrite of every web feature into native widgets.

## Install and pair

1. Install the signed `9t-android-0.2.0.apk` (Android 10/API 29 or newer). Android may ask you to allow installation from the app you used to download it.
2. Sign into your server, open **Settings → Android devices & pairing** (`/devices`), name the phone, and create a pairing code.
3. Paste that code into the Android app. Select whether to receive existing items; the default receives newly created items only. Existing items remain available for manual receiving.
4. Allow notifications and start live receiving. New files save in **Downloads/9t** without visiting a download page. Incoming snippets are copied as plain text while the phone is unlocked; the latest received snippet wins. Links are retained in the inbox without replacing the clipboard.
5. Under **Connect**, optionally add the server's LAN address. Keep Automatic selected for LAN-first operation with public fallback.

Pairing codes contain an access key and are only displayed when created. Keep them private. Use HTTPS (or an explicitly trusted local browser connection) for enrollment. Disconnect lost devices from the website. This revokes their transfer key and device-issued browser sessions. Already downloaded files cannot be recalled.

## Screens and feature coverage

| Screen | Available features |
| --- | --- |
| Inbox | Native local history, file auto-saving, resumable transfers, per-item errors/retry, offline text viewing/copying, open saved files |
| Workspace | Existing 9t grid/list, search, snippets, links, files/upload, pinning, Board, share links/passwords/QR, trash/restore, settings, theme, device management; signed in through pairing |
| Send | Native text composer, explicit clipboard paste, Android text Share target, durable offline outbox with idempotent retry |
| Connect | LAN/public addresses, automatic/LAN-only/internet-only modes, auto-save and clipboard switches, metered-data control, file-size cap, pause, live receiver, notification settings |

Workspace uses the existing server UI inside an Android WebView and requires a reachable **HTTPS** endpoint with a trusted certificate. It is not an offline copy of the complete website. File uploads and non-text edits currently use Workspace and need a connection. Native text sending (up to 100,000 characters per message) queues offline; native file downloads resume after connection loss.

## LAN and internet routing

Example for a locally hosted installation:

- LAN: `http://192.168.1.20:3265` (native encrypted transfers), or an HTTPS local hostname with a valid certificate (native + full Workspace).
- Public: `https://9t.example.com` pointing to **that same installation**, through your existing reverse proxy or tunnel.
- Automatic: try Wi-Fi/Ethernet LAN routes first, then default routing, then public HTTPS. A failed LAN route cools down for 45 seconds. Connectivity changes clear that cooldown. Each request can fail over; partial files keep their byte offset.
- LAN-only: never attempt the public URL. Internet-only: skip the LAN URL.

An unvalidated Wi-Fi network is still usable: native LAN requests explicitly use its Android `Network`, rather than relying solely on the internet-validated default network. There is no SSID matching requirement, no network scanning, and no mDNS setup dependency. Enter a stable DHCP reservation or local HTTPS hostname once. Both endpoints must use the same data directory/instance and device keys. Two separate servers are not replicas.

**The deployed `9t.kennyy.xyz` server is cloud-hosted.** It cannot become an offline home-LAN server merely because the phone joins Wi-Fi. Run 9t on a LAN machine for internet-free access, or use an available VPN route to the same server. Remote access still requires an actual working route. This release does not set up routers, NAT traversal, tunnels, certificates, or server replication.

## Android background and clipboard behavior

- A user-started foreground `dataSync` service shows a notification and polls about every five seconds. Connection failures back off to at most two minutes. Pause stops both live and scheduled receiving.
- Android 15+ limits this foreground service type to six hours per 24-hour period. The app voluntarily ends a live session after five hours and handles the OS timeout. Opening the app and starting a new live session is subject to Android's remaining allowance.
- A persisted JobScheduler job provides recovery roughly every 15 minutes; Android may defer it for Doze, battery restrictions, or resource pressure. It has no internet-validation requirement, so offline LAN access is possible. Boot reschedules jobs; it does not illegally start a data-sync foreground service at boot.
- Force-stop blocks jobs until the user opens the app again. OEM battery managers can delay or stop reception. There is no unconditional always-on promise and no FCM/cloud push dependency.
- The app **writes incoming text** to the clipboard. It does not monitor other apps' clipboard contents in the background. Phone-to-server clipboard sending requires an explicit Paste or Share action.
- Locked-phone copying is deferred. An incoming-text notification opens the app to complete copying. Clipboard content is marked sensitive. Android/OEM clipboard behavior still needs verification on the user's actual phone.
- Target SDK 35; Android 17's target-37 local-network permission requirement will need an explicit migration when raising the target SDK.

References: [foreground service time limits](https://developer.android.com/develop/background-work/services/fgs/timeout), [clipboard restrictions](https://developer.android.com/about/versions/10/privacy/changes#clipboard-data), [local network permissions](https://developer.android.com/privacy-and-security/local-network-permission).

## Transfer integrity and privacy

The mobile endpoint uses AES-256-GCM with a random 96-bit IV and a per-device 256-bit key. Both requests and responses are encrypted. Associated data binds protocol version, server instance, device, message direction, and response request ID. Device credentials never travel as plaintext bearer headers on LAN HTTP.

- Requests include a UUID and timestamp (five-minute clock tolerance). In-memory replay protection lasts ten minutes; restart clears this cache. Text transfer IDs persist through deterministic object IDs so response loss/restarts do not duplicate uploads.
- Files are transferred in authenticated 256 KiB chunks, checked against expected size/revision, resumed from private partial files, then published to Android MediaStore. Interrupted MediaStore writes are tracked; published downloads are recognized after restart. No broad storage permission is required.
- Local keys are wrapped by Android Keystore. App backup is disabled. Saved inbox and outbox text is in app-private SQLite, relying on Android's device/app storage protection; it is not an additional encrypted database.
- Server keys are in the existing mode-0600 data file. They must be recoverable to decrypt traffic, unlike hashed CLI bearer tokens. Protect server backups accordingly.
- Expired, trashed, and disabled-module objects are excluded from native transfer reads. The mobile endpoint does not weaken existing web/CLI authentication.
- HTTP LAN is limited to literal RFC1918 IPv4 or private IPv6 addresses. Public addresses require HTTPS. Standard certificate validation remains enabled. WebView blocks mixed content and cross-origin in-app navigation; there is no JavaScript-to-native bridge.

This is a reviewed implementation with automated checks, not an external security audit. Sync is single-server and the existing JSON store remains single-process.

## Build and test

Use JDK 17, Android SDK platform/build-tools 35, and the checked-in Gradle wrapper:

```sh
cd android
# Set ANDROID_HOME, or create ignored local.properties with sdk.dir=...
./gradlew assembleDebug testDebugUnitTest lintDebug
./gradlew assembleRelease
```

Release output is unsigned until signed with a protected key. `scripts/sign-android.sh` aligns and signs a release APK using environment-provided keystore/password-file paths. Never commit keystores or passwords. Preserve the original signing key for future APK upgrades.

Server checks:

```sh
node --test tests/*.test.mjs
NINE_T_BUILD_DIR=.next-mobile-build npm run build
NINE_T_BUILD_DIR=.next-mobile-build \
  NINE_T_DATA_DIR=/tmp/9t-mobile-api-test \
  NINE_T_SETUP_TOKEN=9t-isolated-mobile-tests NINE_T_HTTPS=false \
  npx next start -H 127.0.0.1 -p 3274
# Separate terminal; needs a fresh isolated data directory:
node tests/mobile-api.mjs http://127.0.0.1:3274
```

The integration script deliberately rejects any other origin. It creates, modifies, and deletes fixtures. Never redirect it to production. Test coverage includes pairing/auth/CSRF, encrypted text/file round trips, Java/Node compatibility, replay/tamper/staleness rejection, idempotent sending, chunk offsets, module/trash filtering, device-issued web sessions, and revocation.
