<p align="center">
  <img src="./public/9t-mark.svg" alt="9t" width="96" />
</p>

<p align="center">
  A quiet, self-hosted workspace for moving the things you need between your devices.
</p>

<p align="center">
  Files · snippets · links · handoffs · phone sync
</p>

<p align="center">
  <a href="https://github.com/M3264/9t/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="GPL-3.0" /></a>
  <img src="https://img.shields.io/badge/node-22%2B-brightgreen" alt="Node 22+" />
  <img src="https://img.shields.io/badge/platform-linux-lightgrey" alt="Linux" />
  <img src="https://img.shields.io/badge/PRs-welcome-neon" alt="PRs welcome" />
</p>

<p align="center">
  <a href="https://9t.kennyy.tech">Website</a> ·
  <a href="https://9t.kennyy.tech/docs">Documentation</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a>
</p>

9t is a small personal cloud you run yourself. Capture text, URLs, and files in one inbox, find them later, and hand them off to another device without routing your data through a third-party workspace.

## Why 9t

- **One inbox for everything** — paste text, links, screenshots, and files into the same capture flow.
- **Your server, your storage** — data stays in the storage location you choose, with opaque file keys and atomic persistence.
- **LAN-first device handoff** — the Android client prefers the local network, falls back to the internet route, and reconnects in the background.
- **Fast when you need it** — search, filters, pinning, Quick Access, keyboard shortcuts, and a command palette keep the workspace light.
- **Share with control** — create expiring, optional-password public handoffs with access counts and revocation.
- **Comfortable anywhere** — responsive desktop and mobile web UI, installable PWA, system/light/dark themes, and an Android client.

## What is included

| Area | Included |
| --- | --- |
| Capture | Universal inbox, clipboard text, URLs, drag-and-drop files, pasted images |
| Organise | Search, filtering, pinning, Quick Access, collections, editable names, Spatial Board |
| Handoff | Stable item pages, QR handoff, expiring public links, password protection, access counts |
| Phone | Encrypted persistent connection, LAN-first routing, background receiving, HTTP catch-up fallback |
| Operations | Setup wizard, module and upload limits, hourly cleanup, daily verified backups |
| Automation | Authenticated CLI for push, list, get, share, trash, and restore |

## Quick start

The setup wizard is the recommended path. It asks for your preferences, creates the administrator, builds the app, and can install a service that starts 9t at boot.

```bash
git clone https://github.com/M3264/9t.git
cd 9t
./setup.sh
```

Choose the network mode during setup:

- **Local** — this computer only.
- **LAN** — reachable by your phone and other devices on the same network.
- **Public** — bind locally behind an existing HTTPS reverse proxy.

The wizard also configures modules, theme, storage, upload size, retention, and startup. It never overwrites an existing data directory.

After setup:

```bash
./9t start
# or, if ~/.local/bin is on PATH:
9t start
```

Useful wizard commands:

```bash
./9t setup --help
./9t setup --dry-run
```

For repeatable or unattended installs, see [docs/installation.md](./docs/installation.md).

## Connect a phone

Install the Android client from the [v0.6.1 release](https://github.com/M3264/9t/releases/tag/v0.6.1):

<https://github.com/M3264/9t/releases/download/v0.6.1/9t-android-0.6.1.apk>

Pair it from the 9t Devices page. The client uses an encrypted persistent connection when supported, prefers the LAN address, switches to the public route when needed, and catches up through the authenticated HTTP API after reconnecting. Enable background receiving in Android settings so the operating system does not stop the receiver when the app is closed.

For Windows and WSL, hotspot, firewall, port-forwarding, and address selection help, see [docs/network-troubleshooting.md](./docs/network-troubleshooting.md). The full pairing and background-receiving notes are in [docs/android.md](./docs/android.md).

## Manual installation

Requirements: Node.js 22 or newer.

```bash
npm install
cp .env.example .env.production
npm run build
npm start
```

9t listens on `0.0.0.0:3265` by default. Set `PORT` or `NINE_T_HOST` to change the listener. Generate a setup token before exposing a new instance:

```bash
openssl rand -hex 16
```

Put the value in `NINE_T_SETUP_TOKEN`. It is required only while creating the first administrator.

## Configuration

```dotenv
NINE_T_DATA_DIR=/absolute/path/to/9t/data
NINE_T_SETUP_TOKEN=replace-with-a-random-secret
NINE_T_HTTPS=false
```

Set `NINE_T_HTTPS=true` when an HTTPS reverse proxy is in front of 9t so session cookies receive the Secure flag. Runtime data, uploads, sessions, production secrets, dependencies, and build output are excluded from Git.

## CLI

From a checkout, link the CLI and authenticate it to your instance:

```bash
npm link
9t login --url https://9t.example.com --username owner
9t push ./photo.jpg
9t push 'docker compose up -d' --name deploy
9t list
9t get ab12cd34
9t share ab12cd34 --lifetime 1d --password optional-password
9t trash ab12cd34
9t restore ab12cd34
9t configure [--section modules|exposure|domain|limits|interface|server]
```

The token is stored with owner-only permissions in `~/.config/9t/config.json`. Run `9t logout` to revoke it on the server.

## Backups and retention

The included systemd timers clean expired and trashed objects hourly and create a daily archive. Fourteen backups are retained by default. Verify an archive without changing data:

```bash
node scripts/restore.mjs backups/9t-….tar.gz --verify
```

Stop 9t before a real restore, then omit `--verify`. The restore tool keeps the previous data directory beside the restored copy.

## Project map

```text
src/app/              Next.js routes and API endpoints
src/components/       Setup, workspace shell, inbox, dialogs (access/, workspace/, ui/)
src/lib/client/       Browser API and formatting helpers
src/lib/server/       Authentication, configuration, and persistence
src/styles/           Global visual system
public/               PWA, fonts, brand assets (pinned at root by Next.js)
scripts/              Server, CLI (cli/), cleanup, backup, and restore operations
scripts/setup.mjs     Install wizard (also: ./9t setup --service for boot)
android/              Android client
deploy/               Nginx (nginx/), systemd (systemd/), Docker (docker/)
db/migrations/        PostgreSQL migration target
docs/                 Whitepaper, installation, network, Android, site ops
docs/archive/         Historical handoffs and plans
site/                 Public landing + docs for 9t.kennyy.tech (static)
tests/                Node test suites + install smoke test
```

## Service deployment

Deployment examples live under `deploy/`. Adjust the user, checkout path, and environment-file path before installing them.

```bash
sudo install -m 644 deploy/systemd/9t.service /etc/systemd/system/9t.service
sudo systemctl daemon-reload
sudo systemctl enable --now 9t.service
```

The HTTPS Nginx example is `deploy/nginx/9t.conf`; its certificate paths assume Certbot with the Nginx plugin.

## Documentation and roadmap

Full documentation lives at **<https://9t.kennyy.tech/docs>** (source: [`site/docs`](./site/docs)). The markdown originals ship in this repo:

- [Whitepaper](./docs/whitepaper.md) — product principles and technical direction
- [Installation](./docs/installation.md) — guided and repeatable setup
- [Network troubleshooting](./docs/network-troubleshooting.md) — LAN, WSL, hotspots, and reverse proxies
- [Android client](./docs/android.md) — pairing, background receiving, and releases
- [Site operations](./docs/site.md) — publishing 9t.kennyy.tech
- [TODO](./docs/archive/TODO.md) — planned work, including multi-user ownership and S3 storage

9t is currently designed for a single owner. PostgreSQL, multi-user ownership, automated exposure switching, and S3 storage remain on the roadmap.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, tests, and pull-request guidance. Security reports: [SECURITY.md](./SECURITY.md).

## License

9t is free software under the [GNU General Public License v3.0](./LICENSE). Self-host it, modify it, share it — under the same terms.
