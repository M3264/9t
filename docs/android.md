# 9t Android — network and transfer client

9t Android 0.6.1 is a native Android receiver with the **full existing web workspace embedded inside the app**. It is not a rewrite of every web feature into native widgets. The native screens use bundled Space Grotesk typography, drawn icons, neutral surfaces and muted lavender accents matching the website. The launcher icon and in-app header use the website 9t mark. Inbox includes local search and type filters, image/video previews, pinning, per-item share/delete, compact item actions and code previews; Connect groups settings into expandable sections. The composer retains its draft across tab changes and activity recreation.

## Install and pair

1. Install the signed [9t-android-0.6.1.apk](https://9t.kennyy.xyz/downloads/9t-android-0.6.1.apk) (Android 5/API 21 or newer). Android may ask you to allow installation from the app you used to download it. Upgrade over the existing installation to retain pairing and history.
2. **Easiest — ask from the phone:** open the app, tap **Find server** (or **Scan local network** on Wi-Fi) to detect your server, name the phone, and tap **Send connection request**. The phone shows a 5-digit session number.
3. On the web, open **Settings → Android devices & pairing** (`/devices`). The request appears as a notification card — check the 5-digit number matches the phone screen, then tap **Approve**. The phone pairs itself within seconds. Requests expire after 5 minutes.
4. **Alternatively — paste a code:** create a pairing code on `/devices`, paste it into the app. Select whether to receive existing items; the default receives newly created items only. Existing items remain available for manual receiving.
4. Allow notifications and start live receiving. Accept the **Allow background receiving** battery prompt, also available under Connect. New files save in **Downloads/9t** without visiting a download page. Incoming snippets are copied as plain text while the phone is unlocked; the latest received snippet wins. Links are retained in the inbox without replacing the clipboard.
5. Under **Connect**, optionally add the server's LAN address. Keep Automatic selected for LAN-first operation with public fallback.

Pairing codes contain an access key and are only displayed when created. Keep them private. Use HTTPS (or an explicitly trusted local browser connection) for enrollment. Disconnect lost devices from the website. This revokes their transfer key and device-issued browser sessions. Already downloaded files cannot be recalled.

## Android compatibility

The APK minimum is Android 5.0 (API 21). Notifications, foreground startup, battery diagnostics, key storage, and downloads have version-specific paths. Java library desugaring supplies the newer Java APIs on older Android. Native inbox, text sending and receiving do not depend on a modern WebView. The embedded full website needs a sufficiently current WebView and trusted HTTPS; very old WebViews are not guaranteed to run the modern website. iOS remains separate future work.

Version 0.4.1 keeps a 5-second reconciliation poll while push is connected and retries a public socket within at most 10 seconds after a failure. This makes public-link delivery converge nearly as quickly as LAN when a proxy or carrier drops a change frame. The encrypted WebSocket remains the immediate path; polling is only the recovery path. Receiver details distinguish socket heartbeats from change notifications and show the active transfer phase. These changes address identified failure paths; automated checks alone cannot confirm screen-off delivery on every manufacturer's firmware.

## Screens and feature coverage

| Screen | Available features |
| --- | --- |
| Inbox | Native local history, file auto-saving, resumable transfers, per-item errors/retry, offline text viewing/copying, open saved files, image/video previews, pinning, per-item share/delete, arrival notifications |
| Workspace | Existing 9t grid/list, search, snippets, links, files/upload, pinning, Board, share links/passwords/QR, trash/restore, settings, theme, device management; signed in through pairing; HTTP LAN available as an explicit opt-in |
| Send | Native text composer with send-as-link detection, dedicated link sender, file picker, camera capture, Android text/image/video/file Share targets, **Send to 9t** in the text-selection toolbar, durable offline outbox with idempotent retry, resumable chunked uploads |
| Connect | **Servers**: pair many workspaces, switch/rename/remove, per-server inbox and outbox; LAN/public addresses, automatic/LAN-only/internet-only modes, auto-save and clipboard switches, arrival notifications, metered-data control, file-size cap, app PIN lock, pause, live receiver, notification settings, shortcuts/widget/Quick Settings tile |

Workspace uses the existing server UI inside an Android WebView and prefers a reachable **HTTPS** endpoint with a trusted certificate. It is not an offline copy of the complete website. Native sending (text up to 100,000 characters, links, and chunked resumable file uploads) queues offline; native file downloads resume after connection loss. HTTP LAN Workspace is available behind an explicit opt-in that warns the login travels unencrypted on the local network.

The web workspace itself also subscribes to the same authenticated persistent connection. An open browser tab refreshes its collection when another device or tab changes an item, then uses the normal authenticated API to load the content. If the socket is unavailable, the tab reconnects with backoff; a manual refresh remains available.

## LAN and internet routing

Example for a locally hosted installation:

- LAN: `http://192.168.1.20:3265` (native encrypted transfers), or an HTTPS local hostname with a valid certificate (native + full Workspace).
- Public: `https://9t.example.com` normally; plain `http://` public servers (custom ports included) work after turning on **Allow plain HTTP to public servers** in Connect — transfers stay encrypted, metadata does not.
- Public: `https://9t.example.com` pointing to **that same installation**, through your existing reverse proxy or tunnel.
- Automatic: try Wi-Fi/Ethernet LAN routes first, then default routing, then public HTTPS. A failed LAN route cools down for 45 seconds. Connectivity changes clear that cooldown. Each request can fail over; partial files keep their byte offset.
- LAN-only: never attempt the public URL. Internet-only: skip the LAN URL.

An unvalidated Wi-Fi network is still usable: native LAN requests explicitly use its Android `Network`, rather than relying solely on the internet-validated default network. There is no SSID matching requirement, no network scanning, and no mDNS setup dependency. Enter a stable DHCP reservation or local HTTPS hostname once. Both endpoints must use the same data directory/instance and device keys. Two separate servers are not replicas.

**The deployed `9t.kennyy.xyz` server is cloud-hosted.** It cannot become an offline home-LAN server merely because the phone joins Wi-Fi. Run 9t on a LAN machine for internet-free access, or use an available VPN route to the same server. Remote access still requires an actual working route. This release does not set up routers, NAT traversal, tunnels, certificates, or server replication.

## Android background and clipboard behavior

- A foreground receiver starts automatically when you open a paired, unpaused app, shows a notification, and opens an authenticated persistent WebSocket on the same LAN/public endpoint. The notification carries **Sync now**, **Send** (inline reply: type text into the notification, it queues to the outbox and syncs), and **Pause** buttons, so one sync pass runs without opening the app. The server sends only an encrypted revision notification; the existing encrypted, resumable HTTP API fetches the actual item. If the socket is unavailable, the receiver falls back to polling with backoff, so an older server remains compatible. Reconnects catch up from the current revision, and revocation closes the socket.
- **With a LAN address and Automatic or LAN-only mode**, version 0.3.0 uses Android's `connectedDevice` service type for the paired computer connection. This is the foreground-service model used by KDE Connect. There is no five-hour application deadline for this mode. The service is sticky, keeps Wi-Fi available without requiring internet validation, and restarts receiving after boot or an APK update when paired and enabled. Both endpoints must still reach the same computer/installation.
- **Without a LAN address, or in Internet-only mode**, the receiver uses `dataSync`. Android 15+ limits this type to six hours per 24-hour period. The app ends each live session after five hours and handles the OS timeout; scheduled checks remain enabled. Opening the app can start a new session subject to Android's allowance. Process recovery preserves the original deadline, and cloud live receiving is not started from boot.
- **Allow background receiving** requests Android's battery-optimization exemption directly with the user's consent. A foreground notification and wake lock alone do not give network access during Doze. Offline LAN delivery cannot rely on cloud push. A timed partial CPU wake lock is renewed while the enabled live service runs, including network failures and released when the service stops. This uses extra battery; OEM restrictions and force-stop can still stop receiving.
- Network availability changes trigger a reconnect; unlocking triggers catch-up without destroying a healthy socket. Retries are coalesced, and notification/reporting failures cannot terminate the receiver. Each HTTP request uses OkHttp with a 30-second whole-call deadline and connect/read/write timeouts. Socket timeouts are recorded as transfer failures rather than silently treated as pause requests. The socket uses a fresh challenge and client nonce for every connection, sequence checks, bounded frames, heartbeat, and automatic route fallback.
- A persisted JobScheduler job provides recovery roughly every 15 minutes; Android may defer it for Doze, battery restrictions, or resource pressure. It has no internet-validation requirement, so offline LAN access is possible. Repeated app visits leave the existing job intact instead of resetting its schedule. Boot and APK updates restore jobs in both connection modes.
- **New in 0.3.1:** when a scheduled job finds the live service absent, it attempts to restore the persistent connection before file catch-up. On Android 12+ this recovery requires the battery-optimization exemption. Paused/unpaired devices are not restarted, and an active service is left running. Cloud recovery preserves an existing unexpired session; it cannot reset the five-hour deadline. An Android timeout clears the saved session to prevent repeated refused starts.
- Connect shows the installed version, last receiver check and last background sync. **Receiver details → Copy details** includes local lifecycle events, timing, error types and battery/network-policy state; it excludes pairing keys, server addresses and item contents. Reopening the app does not overwrite the separate background-sync timestamp. The live notification's timestamp is the last successful network response.
- Force-stop blocks jobs until the user opens the app again. OEM battery managers can delay or stop reception. There is no unconditional always-on promise and no FCM/cloud push dependency.
- The app **writes incoming text** to the clipboard. It does not monitor other apps' clipboard contents in the background. Phone-to-server clipboard sending requires an explicit Paste or Share action.
- Locked-phone copying is deferred until unlock. Unlocking triggers another copy attempt; the incoming-text notification can also open the app to complete copying. Clipboard content is marked sensitive. Android/OEM clipboard behavior still needs verification on the user's actual phone.
- Target SDK 35; Android 17's target-37 local-network permission requirement will need an explicit migration when raising the target SDK.

References: [connected-device service requirements](https://developer.android.com/develop/background-work/services/fgs/service-types#connected-device), [Doze and battery exemptions](https://developer.android.com/training/monitoring-device-state/doze-standby#support_for_other_use_cases), [KDE Connect's service](https://github.com/KDE/kdeconnect-android/blob/master/src/main/java/org/kde/kdeconnect/BackgroundService.kt), [foreground service time limits](https://developer.android.com/develop/background-work/services/fgs/timeout), [clipboard restrictions](https://developer.android.com/about/versions/10/privacy/changes#clipboard-data), [local network permissions](https://developer.android.com/privacy-and-security/local-network-permission).

### If receiving stops when you switch apps

1. Install 0.6.1 over the existing app; do not uninstall, so pairing and history remain. Open it once after installing. Confirm **9t 0.6.1** in Connect.
2. In **Connect**, select **Start live receiving** if previously paused. Allow notifications. Confirm the **9t · Live receiving** notification remains after switching to another app.
3. Tap **Connect → Allow background receiving** and approve Android's prompt. Confirm the app reports background battery access allowed. Open **Phone app settings** and allow background activity and auto-start if your phone offers these controls. With a LAN server, use Automatic or LAN-only with your saved LAN address. Internet-only mode retains Android's data-sync time limit.
4. Send a new small file and snippet from the same paired server while another phone app is visible. Check **Downloads/9t** and paste into an editor. Repeat with the screen locked; files should arrive during live receiving, while clipboard copying intentionally waits until unlocked/opened.
5. Keep the laptop awake and the server running. LAN sync cannot reach a sleeping laptop or a changed Windows/WSL address. Test the LAN URL in the phone browser to distinguish reachability from background restrictions.

If delivery still stops, reopen 9t and use **Connect → Receiver details → Copy details**. The separate last background sync, last receiver check, last network response and lifecycle events help distinguish a frozen process, blocked network, failed transfer, and scheduled-only operation. Share the report with whether the live notification remained and whether files, clipboard or both stopped arriving. Physical-device validation is still required across supported Android versions; verify app switching, screen-off receiving, pause/reopen, and reboot on the actual phone.

Developer regression checks: `LiveSessionTest` covers cloud deadline preservation, invalid deadlines and boot/mode eligibility. `ReceiveLoopTest` exercises continued retries when error reporting itself throws, reconnects during an active transfer, cancellation, and already-dispatched callback races. Release build, unit tests and lint do not substitute for physical-device checks.

## Transfer integrity and privacy

The mobile endpoint uses AES-256-GCM with a random 96-bit IV and a per-device 256-bit key. Both requests and responses are encrypted. Associated data binds protocol version, server instance, device, message direction, and response request ID. Device credentials never travel as plaintext bearer headers on LAN HTTP.

- Requests include a UUID and timestamp (five-minute clock tolerance). In-memory replay protection lasts ten minutes; restart clears this cache. Text transfer IDs persist through deterministic object IDs so response loss/restarts do not duplicate uploads.
- Files are transferred in authenticated 256 KiB chunks, checked against expected size/revision, resumed from private partial files, then published to Android MediaStore. Interrupted MediaStore writes are tracked; published downloads are recognized after restart. Android 10+ needs no storage permission. Android 5–9 uses atomic writes into Downloads/9t and FileProvider URIs; Android 6–9 asks for storage permission.
- Android 6+ uses AES keys in Android Keystore. Android 5 uses an Android Keystore RSA key to wrap a random local AES key; pairing credentials remain encrypted. Existing pairing remains readable after an OS upgrade. App backup is disabled. Saved inbox and outbox text is in app-private SQLite, relying on Android's device/app storage protection; it is not an additional encrypted database.
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
