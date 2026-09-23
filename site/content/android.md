---
title: Android
description: Install the 9t Android app and pair it.
---

# 9t Android — network and transfer client

9t Android 0.6.3 is a native Android receiver with the **full existing web workspace embedded inside the app**. It is not a rewrite of every web feature into native widgets.

## Install and pair

1. Install the signed [9t-android-0.6.3.apk](https://github.com/M3264/9t/releases/download/v0.6.3/9t-android-0.6.3.apk) (Android 5/API 21 or newer). Android may ask you to allow installation from the app you used to download it. Upgrade over the existing installation to retain pairing and history.
2. **Easiest — ask from the phone:** open the app, tap **Find server** (or **Scan local network** on Wi-Fi) to detect your server, name the phone, and tap **Send connection request**. The phone shows a 5-digit session number.
3. On the web, open **Settings → Android devices & pairing** (`/devices`). The request appears as a notification card — check the 5-digit number matches the phone screen, then tap **Approve**. The phone pairs itself within seconds. Requests expire after 5 minutes.
4. **Alternatively — paste a code:** create a pairing code on `/devices`, paste it into the app. Select whether to receive existing items; the default receives newly created items only.
5. Allow notifications and start live receiving. Accept the **Allow background receiving** battery prompt, also available under Connect. New files save in **Downloads/9t** without visiting a download page. Incoming snippets are copied as plain text while the phone is unlocked; the latest received snippet wins. Links are retained in the inbox without replacing the clipboard.
6. Under **Connect**, optionally add the server's LAN address. Keep Automatic selected for LAN-first operation with public fallback.

Pairing codes contain an access key and are only displayed when created. Keep them private. Use HTTPS (or an explicitly trusted local browser connection) for enrollment. Disconnect lost devices from the website — this revokes their transfer key and device-issued browser sessions. Already downloaded files cannot be recalled.

## Screens

| Screen | What it does |
| --- | --- |
| Inbox | Native local history, file auto-saving, resumable transfers, per-item retry, offline viewing, image/video previews, pinning, arrival notifications |
| Workspace | The full 9t web workspace embedded — grid/list, search, snippets, links, files, Board, shares, trash, settings |
| Send | Text composer with send-as-link detection, link sender, file picker, camera capture, Android Share targets, offline outbox with retry |
| Connect | Servers, LAN/public addresses, auto-save and clipboard switches, notifications, file-size cap, app PIN lock, live receiver, diagnostics |

Workspace prefers a reachable **HTTPS** endpoint with a trusted certificate. Native sending (text up to 100,000 characters, links, chunked resumable uploads) queues offline.

In the native Inbox, **Delete from phone** and **Clear local history** keep items hidden after future syncs without deleting the server copy. Files sent from this phone appear as **On server** without downloading a second copy; tap **Download a copy** if you want one in Downloads/9t.

## LAN and internet routing

- LAN: `http://192.168.1.20:3265` (native encrypted transfers), or an HTTPS local hostname with a valid certificate.
- Public: `https://your-domain.example` through your reverse proxy.
- Automatic: try LAN routes first, then public HTTPS. A failed LAN route cools down for 45 seconds. Each request can fail over; partial files keep their byte offset.
- LAN-only: never attempt the public URL. Internet-only: skip the LAN URL.

> A cloud-hosted 9t server cannot become an offline home-LAN server because the phone joins Wi-Fi. Run 9t on a LAN machine for internet-free access.

## Background receiving

- A foreground receiver starts when you open a paired, unpaused app, shows a notification, and opens an authenticated persistent WebSocket. The notification carries **Sync now**, **Send** (inline reply), and **Pause** buttons.
- **With a LAN address and Automatic or LAN-only mode**, the receiver uses Android's `connectedDevice` foreground-service type (the KDE Connect model). No five-hour deadline; sticky restarts after boot or APK update.
- **Without a LAN address, or in Internet-only mode**, the receiver uses `dataSync`. Android 15+ limits this to six hours per 24 hours; the app ends each live session after five hours.
- **Allow background receiving** requests Android's battery-optimization exemption. A foreground notification alone does not give network access during Doze. Force-stop and OEM battery managers can still stop receiving — there is no unconditional always-on promise and no cloud-push dependency.
- The app **writes incoming text** to the clipboard. It never monitors other apps' clipboard contents. Locked-phone copying waits until unlock.

### If receiving stops when you switch apps

1. Install 0.6.3 over the existing app; do not uninstall. Confirm **9t 0.6.3** in Connect.
2. In **Connect**, select **Start live receiving** if paused. Allow notifications. Confirm the **9t · Live receiving** notification remains after switching apps.
3. Tap **Connect → Allow background receiving** and approve Android's prompt. With a LAN server, use Automatic or LAN-only with your saved LAN address.
4. Send a small file and snippet while another phone app is visible. Check **Downloads/9t** and paste into an editor. Repeat with the screen locked.
5. Keep the laptop awake and the server running. Test the LAN URL in the phone browser to distinguish reachability from background restrictions.

If delivery still stops, use **Connect → Receiver details → Copy details** and share the report.

## Transfer integrity and privacy

The mobile endpoint uses AES-256-GCM with a random 96-bit IV and a per-device 256-bit key. Files transfer in authenticated 256 KiB chunks, resumed from partial files. Android 6+ keeps keys in Android Keystore. Expired, trashed, and disabled-module objects are excluded from transfers.

This is a reviewed implementation with automated checks, not an external security audit.

## Build and test (developers)

```sh
cd android
./gradlew assembleDebug testDebugUnitTest lintDebug
./gradlew assembleRelease
```

Release output is unsigned until signed with a protected key (`scripts/sign-android.sh`). Never commit keystores or passwords. Server checks: `node --test tests/*.test.mjs`, plus the isolated mobile API script (`node tests/mobile-api.mjs`) — never point it at production.
