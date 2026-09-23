---
title: Install
description: Install 9t with the setup wizard or Docker.
---

# Installing 9t

## Start here

In your Linux/macOS terminal, or **Ubuntu inside WSL** on Windows:

```bash
git clone https://github.com/M3264/9t.git
cd 9t
./setup.sh
```

Choose **LAN** if your phone will connect through Wi-Fi or a hotspot. Keep the printed port and startup instructions. Open the resulting address, sign in with the administrator account you created, then follow [phone connection and network troubleshooting](/docs/network/). **On Windows/WSL, complete that guide's forwarding steps before using the address on your phone.**

The initial download/build needs internet access. After installation, a running LAN server can exchange data with the Android client without internet access.

<Callout type="warn">

**Windows/WSL:** complete the [network guide's forwarding steps](/docs/network/) *before* using the address on your phone. An address that works on the Windows laptop may be private to WSL.

</Callout>

## Docker (alternative)

Requires Docker Engine with Compose v2:

```bash
git clone https://github.com/M3264/9t.git
cd 9t
NINE_T_SETUP_TOKEN=$(openssl rand -hex 16) docker compose up -d --build
```

Open `http://<host>:3265` and create the administrator in the browser; the setup key is required only for that first account. Data persists in the `9t-data` volume. The phone event socket shares port 3265, so no extra ports are needed. Behind an HTTPS reverse proxy, set `NINE_T_HTTPS=true` so session cookies get the Secure flag:

```bash
NINE_T_SETUP_TOKEN=$(openssl rand -hex 16) NINE_T_HTTPS=true docker compose up -d --build
```

Update with `git pull` then `docker compose up -d --build`. Backups default to `/data/backups` inside the volume (`NINE_T_BACKUP_DIR`); run `docker compose exec 9t node scripts/backup.mjs` to create one. `PORT=xxxx` overrides the published port.

### Optional Postgres (migration target)

The app stores data in JSON files unless `NINE_T_DATABASE_URL` is set, in which case it uses Postgres through the same storage interface (file blobs stay in `NINE_T_DATA_DIR/objects` either way). To switch:

```bash
POSTGRES_PASSWORD=$(openssl rand -hex 16) docker compose --profile db up -d --build
docker compose exec 9t npm run migrate
docker compose exec 9t npm run pg-import
```

`migrate` is idempotent (tracked in `schema_migrations`). `pg-import` copies `data/9t.json` metadata once and refuses to overwrite without `--force`.

## What setup does

Run `./setup.sh` after cloning the repository. No global CLI package or initial browser setup is required. The shell bootstrap installs Node.js 22 locally under `.tools/node` only if an adequate Node runtime is missing and you agree to the download. It supports Linux/macOS x64 and arm64; use WSL on Windows. It needs curl and tar.

The wizard then collects preferences, shows a summary, installs locked npm dependencies, builds a production version, hashes your administrator password, and writes private runtime configuration. Choose foreground startup, a Linux systemd service, or configuration only.

## Preferences

- Access: LAN (default), this computer only, or public behind an existing same-host HTTPS proxy.
- Port: 3265 by default; any free unprivileged port from 1024 to 65535.
- Modules: snippets, files, links, and optional Board. At least one content module is required.
- Appearance: system, light, or dark.
- Maximum upload: 1–2048 MB, default 500.
- Trash retention: 0–365 days, default 7.
- Data: the ignored `data` directory in the checkout, or a dedicated external directory.
- Administrator: username and hidden password entry/confirmation. Password is stored only as a salted scrypt hash.

LAN mode binds to all interfaces and still requires login. On a cloud host, use its firewall to control external access. Local/public modes bind to 127.0.0.1. Public mode expects your HTTPS proxy to forward to that listener.

## Windows and WSL startup

Run the Linux commands in Ubuntu, and Windows networking commands in **PowerShell as Administrator**, as labeled in the [network guide](/docs/network/). The wizard does not configure Windows forwarding or Windows Firewall.

If you already completed setup, do not rerun it to change the network binding. Edit `NINE_T_HOST` and `PORT` in `.env.production`, then restart. For ordinary LAN HTTP, use `NINE_T_HOST=0.0.0.0` and `NINE_T_HTTPS=false`.

## Automation

Example `preferences.json` (keep it outside the checkout or remove it after use):

```json
{
  "exposure": "lan",
  "port": 3265,
  "username": "owner",
  "modules": ["snippets", "files", "links"],
  "theme": "system",
  "maxSizeMb": 500,
  "trashRetentionDays": 7,
  "startup": "later",
  "installCli": false
}
```

```bash
./9t setup --answers /path/to/preferences.json --yes --dry-run
read -rs -p 'Administrator password: ' NINE_T_ADMIN_PASSWORD
echo
export NINE_T_ADMIN_PASSWORD
./9t setup --answers /path/to/preferences.json --yes
unset NINE_T_ADMIN_PASSWORD
./9t start
```

Do not put a password in the preferences JSON or command arguments.

## Files, services, and recovery

- `.env.production`: private environment file, loaded by `npm start` / `9t start`.
- `data/9t.json` (or chosen external storage): administrator, modules, preferences, workspace data.
- `.9t-install.json`: private non-password installation summary.
- `.9t/`: generated proxy/service files.

The installer refuses to replace existing configuration, workspace data, or a service for this checkout. Systemd service names are `9t-<checkout-hash>.service`. Use `sudo systemctl status NAME` and `sudo journalctl -u NAME -f` for diagnostics.

## Updates and health

```bash
./9t status     # service state, build presence, listener + initialized flag
./9t update     # backup, git pull, rebuild into staging, migrate, restart
```

`update` refuses when the working tree has local changes and backs up data before touching anything.
