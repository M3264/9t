# KDE Connect connection architecture — study notes, 2026-09-18

Source read: `/tmp/9t-kdeconnect-reference` (kdeconnect-android, commit `1021ff5`, protocol version 8).
All file references below are relative to `src/main/java/org/kde/kdeconnect/`.

This is a read-only study. Nothing in `9t` was modified.

## Why this was read

`9t` does LAN-first device handoff with an internet fallback and background reconnect. KDE Connect
solves the same discovery/transport problem on the same platform, and `docs/android.md` already
cites its `BackgroundService` for foreground-service behaviour. These notes cover the parts that are
relevant to transport design rather than the plugin system.

## Layering

Three layers, cleanly separated.

| Layer | File | Responsibility |
| --- | --- | --- |
| `BaseLinkProvider` | `backends/BaseLinkProvider.java:19` | Discovers devices; emits `onConnectionReceived` / `onConnectionLost` / `onDeviceInfoUpdated`. Exposes a `priority`. |
| `BaseLink` | `backends/BaseLink.java:22` | One live transport to one device. Sends and receives `NetworkPacket`s. |
| `Device` | `Device.kt` | Holds N links sorted by priority, owns the `PairingHandler` and the plugin set. |

`KdeConnect.kt:173` is the glue mapping links onto devices: an incoming link either attaches to an
existing `Device` or constructs a new one.

`BackgroundService.kt:67` registers the providers (LAN priority 20, Bluetooth lower, Loopback
commented out) and installs a `ConnectivityManager.NetworkCallback` that calls `onNetworkChange` on
every non-cellular network up/down event.

## Discovery: UDP broadcast on port 1716

Both ends bind UDP **1716** and a TCP listener on the first free port in **1716–1764**
(`LanLinkProvider.kt:620-653`).

A device broadcasts a plaintext `kdeconnect.identity` JSON packet carrying `deviceId`, `deviceName`,
`deviceType`, `protocolVersion`, the incoming/outgoing capability lists, and critically its
`tcpPort` (`LanLinkProvider.kt:509`).

The important inversion: **the receiver of the broadcast performs the TCP connect**, back to the
advertised `tcpPort` (`LanLinkProvider.kt:228`). So the broadcaster ends up as the TCP *server*.
Roles then cross over again at the TLS layer:

> "If I'm the TCP server I will be the SSL client and vice-versa." — `LanLinkProvider.kt:303`

This matters for NAT/firewall behaviour: the side that announced itself is the side that accepts.

### mDNS as a second path into the same code

`MdnsDiscovery.kt` registers `_kdeconnect._udp` with the **service name set to the deviceId**
(it must be unique, and it is the only field visible without a resolve — `MdnsDiscovery.kt:138`).

On resolving a peer it does *not* connect directly. It sends a unicast UDP identity packet at the
resolved host (`MdnsDiscovery.kt:236`) and lets the normal broadcast flow take over. One code path
for connection establishment regardless of how the device was found. Worth copying.

A `WifiManager.MulticastLock` is held only while discovery is active (`MdnsDiscovery.kt:56`).

## TLS upgrade and the trust model

The plaintext socket is upgraded in place by `SslHelper.convertToSslSocket` (`SslHelper.kt:191`),
pinned to **TLSv1.2** on purpose:

> "Use TLS up to 1.2, since 1.3 seems to cause issues in some (older?) devices" — `SslHelper.kt:166`

Identity is a **self-signed X.509 certificate whose CN is the deviceId** (`SslHelper.kt:105`),
generated once, valid from −1 year to +10 years, signed `SHA512withRSA` (or ECDSA). If the stored
certificate is missing, expired, not yet valid, or its CN disagrees with the current deviceId, it is
regenerated — and regeneration **wipes every trusted device** (`SslHelper.kt:99`), because all
existing pairings were bound to the old key.

Trust is decided per connection:

- **Known/trusted device** — its stored certificate is loaded into the keystore, a real
  `TrustManagerFactory` is used, and the server side sets `needClientAuth = true`.
- **Unknown device** — a `trustAllCerts` manager is installed and the server sets
  `wantClientAuth = true`. The connection succeeds, the peer certificate is captured from the
  handshake event, and it is only persisted once pairing completes (`Device.kt:212`, commented
  "TOFU").

So an unpaired device can always complete a TLS handshake; trust is established afterwards by the
pairing step, and pinned from then on.

### Protocol v8 hardening

After the handshake, v8 re-exchanges the identity packet *inside* the encrypted channel, then
verifies that neither `deviceId` nor `protocolVersion` changed mid-flight
(`LanLinkProvider.kt:312-338`). The pre-TLS identity packet is explicitly distrusted:

> "Do not trust the identity packet we received unencrypted" — `LanLinkProvider.kt:320`

There is also downgrade protection: a remembered device may not connect claiming an older protocol
version than last seen (`isProtocolDowngrade`, `LanLinkProvider.kt:362`).

## Pairing

Symmetric and minimal: a `kdeconnect.pair` packet with `{"pair": true}`. Unpair is the same packet
with `false`.

Request and accept are the *identical* packet, which forces an awkward rule — receiving a pair
request while already `Paired` triggers an unpair rather than an auto-accept, otherwise two devices
could accept each other forever (`PairingHandler.kt:63-68`).

State machine (`PairingHandler.kt:25`): `NotPaired → Requested | RequestedByPeer → Paired`.
Timeouts are asymmetric on purpose — the requester waits 30s, the accepting side times out at 25s so
it fails before its peer does (`PairingHandler.kt:90` and `:153`).

v8 adds a `timestamp` to the request; pairing is rejected if the two clocks differ by more than
30 minutes (`PairingHandler.kt:244`).

The user-visible verification code is:

```
SHA256( sortedConcat(pubkeyA, pubkeyB) + timestamp )  → first 8 hex chars, uppercased
```

`sortedConcat` orders the two public keys deterministically so both devices derive the same string
(`PairingHandler.kt:247-266`).

On success: certificate and device info are written to per-device `SharedPreferences`, and the
deviceId is flagged in a `trusted_devices` preference file (`helpers/TrustedDevices.kt`).

## Wire format

Newline-delimited JSON — one packet per line.

```json
{"id": 1758182400000,
 "type": "kdeconnect.share.request",
 "body": { },
 "payloadSize": 1048576,
 "payloadTransferInfo": {"port": 1739}}
```

Framing is `readLineBounded` (`helpers/BoundedLineReader.kt:14`): read one byte at a time until
`\n`, with a hard cap — 32 MB for regular packets (`LanLink.java:46`), 512 KB for identity packets.
The handshake path deliberately avoids a buffered reader:

> "We don't use a BufferedInputStream on purpose, since BufferedReader reads ahead and would require
> us to keep a single BufferedInputStream instance and pass it around to make sure we don't lose
> data." — `LanLinkProvider.kt:138`

Once past the handshake, the read loop does wrap the stream in a `BufferedInputStream`
(`LanLink.java:81`).

One compatibility wart: `.replace("\\/", "/")` on serialize, because Java's `JSONObject` escapes
forward slashes and Qt's QJson does not (`NetworkPacket.kt:223`).

## Payload transfer: a separate socket per transfer

File contents never travel on the control channel.

1. Sender opens a fresh `ServerSocket` on the first free port from **1739** (`LanLink.java:141`).
2. The port is written into `payloadTransferInfo` and the JSON packet is sent on the control socket.
3. Sender blocks on `accept()` with a 10-second timeout (`LanLink.java:205`).
4. Receiver sees `payloadTransferInfo`, dials back to that port, and upgrades *that* socket to TLS
   too (`LanLink.java:255-261`).
5. Bytes stream in 4 KB chunks with progress callbacks every 500 ms (`LanLink.java:216-231`).

Consequences: the control channel stays responsive during large transfers, transfers can run in
parallel, and each transfer is independently cancellable via `np.isCanceled()`.

## Robustness details worth stealing

- **Dual rate limiting** — by source IP *and* by deviceId, 1 second window, map capped at 255 entries
  with lazy eviction (`LanLinkProvider.kt:172-196`).
- **Private-address gate** — packets from non-local addresses are dropped outright. The check covers
  loopback, site-local, link-local, CGNAT `100.64.0.0/10`, and IPv6 ULA `fc00::/7`
  (`helpers/NetworkHelper.kt:75`).
- **Unpaired connection cap** of 42, to survive a hostile or noisy network
  (`LanLinkProvider.kt:632`).
- **Link replacement rather than reconnection** — `LanLink.reset()` swaps the socket underneath a
  live link and closes the old one, which kills the old read thread. That thread then sleeps 300 ms
  and re-checks `newSocket != socket` before declaring the device gone (`LanLink.java:98-103`). This
  is what stops device state from flapping when the network changes.
- **`visibleDevices.remove(deviceId, link)`** — the two-argument form, so a stale link cannot evict
  the replacement that superseded it (`LanLinkProvider.kt:78`).
- **Certificate continuity check on reconnect** — if a link already exists for a deviceId and the new
  socket presents a different certificate, the new socket is dropped rather than accepted
  (`LanLinkProvider.kt:387`).
- **Trusted-network gating** — on an untrusted SSID the app will not broadcast, will not announce
  over mDNS, and ignores identity packets from devices it does not already trust
  (`LanLinkProvider.kt:110`, `helpers/TrustedNetworkHelper.kt:59`).
- **Broadcast debounce** — `onNetworkChange` is ignored if fired within 200 ms of the last broadcast
  (`LanLinkProvider.kt:579`, log line "relax cowboy").
- **Per-device serialized send queue** — an unlimited `Channel` drained by a single coroutine, so
  packet ordering per device is guaranteed and sends never block the caller (`Device.kt:319-328`).
- **UDP receive failure triggers a broadcast** — if the UDP listener dies, it re-broadcasts to try to
  get peers to connect inbound instead (`LanLinkProvider.kt:435`).
- **Device ID validation** — `^[a-zA-Z0-9_-]{32,38}$`, generated from a dash-stripped UUID
  (`DeviceInfo.kt:120`, `helpers/DeviceHelper.kt:135`).
- **Socket hygiene** — `keepAlive = true` and a 10 second `soTimeout` on every socket
  (`LanLinkProvider.kt:253`).

## Bluetooth backend, for contrast

RFCOMM with service UUID `185f3df4-3268-4e3f-9fca-d4d5059915bd`, plus a byte-reversed variant to
work around stacks that report it swapped (`backends/bluetooth/BluetoothLinkProvider.kt:434`).

Two notable differences from LAN:

- **No TLS.** The certificate is PEM-embedded directly in the identity packet
  (`BluetoothLinkProvider.kt:213`).
- **`ConnectionMultiplexer`** fakes multiple logical channels over the single RFCOMM socket, because
  unlike TCP you cannot simply open a second connection for a payload.

## Applicability to 9t

Ranked by how directly useful each is to `9t`'s LAN-first handoff:

1. **Broadcaster-becomes-server inversion.** The announcing side listens; the discovering side dials.
   Avoids both sides racing to connect and gives a natural answer to "who accepts".
2. **One connection code path for every discovery mechanism.** mDNS resolve just injects a unicast
   identity packet. Adding a discovery source later costs nothing in the connection logic.
3. **Separate TLS socket per payload.** Keeps the control channel responsive and makes per-transfer
   cancellation and progress trivial.
4. **`reset()`-style link replacement with the 300 ms grace check.** This is the specific trick that
   prevents disconnect flapping on Android network transitions — relevant to the "reconnects in the
   background" promise in the README.
5. **TOFU with pinning after pairing,** rather than trying to be a CA. Self-signed cert, CN =
   device id, pin on first successful pair.
6. **The defensive set:** private-address gate, dual rate limiting, unpaired connection cap,
   bounded line reads. Cheap to implement, and all of them exist because someone hit the failure.

Deliberately *not* recommended for copying: the plaintext pre-TLS identity packet (v8 already treats
it as untrusted and the code comments flag it as vestigial — `LanLinkProvider.kt:516` and
`MdnsDiscovery.kt:233`), and the "unpair on pair request while paired" behaviour, which is a
workaround for request and accept being the same packet. Give them distinct packet types instead.

## Open questions

- `9t`'s current Android transport was not reviewed in this session; no comparison against
  `9t/android` has been made.
- The KDE desktop side (`kdeconnect-kde`) was not available locally, so these notes reflect only the
  Android implementation of the shared protocol.
