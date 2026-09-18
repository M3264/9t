# 9t

9t is a self-hosted, configurable internet workspace for moving files, snippets, and links between your devices while keeping the data on infrastructure you control.

## Current release

- First-run module selection and protected administrator creation
- Scrypt password hashing and persistent login sessions
- Snippets, file uploads/downloads, and saved links
- Search, filtering, pinning, and Quick Access
- Keyboard command palette and capture shortcuts
- Universal inbox that classifies pasted text, URLs, and dropped files
- System, Light, and Dark appearance modes
- Spatial Board with persisted object positions
- Editable object names and payloads
- Permanent or expiring objects
- Expiring public handoff links with access counts and revocation
- Trash, restore, and permanent deletion
- Module and upload-size settings
- Atomic local persistence with opaque file storage keys
- Responsive web interface and scalable SVG identity
- Installable PWA with the mobile operating-system share target
- Stable item pages and QR handoff between devices
- Password-protected public handoffs
- Authenticated CLI for push, list, get, share, trash, and restore
- Hourly retention cleanup and verified daily backups

The product and technical direction is documented in [docs/whitepaper.md](./docs/whitepaper.md).

## Guided installation

On Linux or macOS (Windows: use WSL), start from a fresh clone:

```bash
git clone https://github.com/M3264/9t.git
cd 9t
./setup.sh
```

The installer can download a private Node.js 22 runtime when needed, verifies its official SHA-256 checksum, installs dependencies, builds 9t, and creates your administrator account. It asks about network access, modules, theme, storage location, upload limit, trash retention, and startup. Password entry is hidden. Sign in when it finishes; there is no second browser setup step.

Choose **LAN** to reach 9t from other devices on your Wi-Fi, **local** for this computer only, or **public** when you already have an HTTPS reverse proxy on this host. Public mode binds to localhost and generates a Caddyfile example; it does not configure DNS, router rules, or certificates for you. Authentication remains required in every mode.

On Linux with systemd, the wizard can install and enable a service for this checkout using sudo, so 9t starts at boot. Alternatively, run in the current terminal or start later. Existing installations and data are never overwritten; use a separate checkout for another instance.

With Node.js already installed, `npm run setup` and `./9t setup` open the same wizard. If you accept the optional command installation and `~/.local/bin` is on your PATH, you can subsequently use `9t setup` or `9t start` from anywhere.

```bash
./9t setup --help
./9t setup --dry-run  # preview preferences in a fresh checkout
./9t start           # start a completed installation
```

For repeatable/unattended installation, see [the installation guide](./docs/installation.md).

Connecting a phone, using Windows/WSL, or troubleshooting Wi-Fi/hotspots? Follow [the network and connection guide](./docs/network-troubleshooting.md). See [the Android guide](./docs/android.md) for pairing and background receiving.

## Manual installation

Requirements: Node.js 22 or newer.

```bash
npm install
cp .env.example .env.production
npm run build
npm start
```

By default, 9t listens on `0.0.0.0:3265`. `npm start` reads `.env.production`; use `PORT` and `NINE_T_HOST` to change the listener. Explicit process environment variables take precedence.

The current public deployment is available at [https://9t.kennyy.xyz](https://9t.kennyy.xyz). Nginx terminates TLS and proxies to the local application service; direct external access to port 3265 is blocked.

Generate a unique first-run setup key before exposing the server:

```bash
openssl rand -hex 16
```

Put the result in `NINE_T_SETUP_TOKEN`. The key is required only when creating the first administrator.

## Configuration

```dotenv
NINE_T_DATA_DIR=/absolute/path/to/9t/data
NINE_T_SETUP_TOKEN=replace-with-a-random-secret
NINE_T_HTTPS=false
```

Set `NINE_T_HTTPS=true` only after the app is served through HTTPS; this enables the Secure flag on session cookies.

Runtime data, uploaded objects, sessions, production secrets, dependencies, and build output are excluded from Git.

## Project structure

```text
app/                  Next.js routes, API endpoints, and route entry points
components/access/    Setup and sign-in flows
components/workspace/ Workspace shell, inbox, collections, and dialogs
components/ui/        Small shared interface primitives
lib/client/           Browser-side API and formatting helpers
lib/server/           Authentication, configuration, and persistence
types/                Shared product models
styles/               Global visual system
deploy/               Nginx and systemd deployment files
scripts/              Cleanup, backup, and restore operations
docs/                 White paper and source brand assets
```

Application routes stay thin; product UI belongs in `components`, browser and server code are explicitly separated, and operational files are kept outside the application tree.

## CLI

Install the CLI from a checkout, then connect it to your server:

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
```

API tokens are stored in `~/.config/9t/config.json` with owner-only permissions. `9t logout` revokes the active token on the server.

## Retention and backups

The included systemd timers run expiry/trash cleanup hourly and create a daily archive. Fourteen backups are retained by default. A backup can be checked without changing data:

```bash
node scripts/restore.mjs backups/9t-….tar.gz --verify
```

Stop the application before a real restore, then omit `--verify`. The restore tool preserves the previous data directory beside the restored one.

## Service deployment

Deployment files live under `deploy/`. Update the systemd user, working directory, and environment-file path for the target server before installing them.

The HTTPS Nginx example is at `deploy/nginx/9t.conf`. Its certificate paths assume Certbot with the Nginx plugin.

```bash
sudo install -m 644 deploy/systemd/9t.service /etc/systemd/system/9t.service
sudo systemctl daemon-reload
sudo systemctl enable --now 9t.service
```

## Status

The current single-user release is operational. PostgreSQL, automated exposure switching, multi-user ownership, and S3 storage remain on the roadmap in [TODO.md](./TODO.md).
