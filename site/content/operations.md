---
title: Operations
description: Run 9t day to day — backups, the full CLI, the systemd service, and the safe update flow.
order: 5
---

# Keeping 9t running

## Backups and retention

Systemd timers clean expired and trashed objects hourly and create a daily verified archive; fourteen backups are retained by default. Verify an archive without changing data:

```bash
node scripts/restore.mjs backups/9t-….tar.gz --verify
```

Stop 9t before a real restore, then omit `--verify`. The restore tool keeps the previous data directory beside the restored copy.

## CLI reference

Everything below runs from the checkout (`./9t …`) or, once linked, as `9t …` from anywhere. Object commands need a login first; server commands don't.

```bash
9t setup                         Install and configure this checkout
9t setup --help                  Installation options
9t setup --service               Install the boot service on an existing checkout
9t setup --service --dry-run     Preview the unit, writes nothing
9t setup --check                 Pre-flight only: disk, RAM, data dir, port
9t start                         Run the configured server
9t status                        Service, listener and app health
9t update                        Backup, pull, rebuild and restart
```

Workspace commands (run `9t login` first):

```bash
9t login --url https://9t.example.com --username you
9t push <text|url|file> [--name name] [--lifetime forever|1h|1d|7d]
9t list [--trash]
9t get <id|name> [--output file]
9t share <id|name> [--lifetime 1d] [--password secret]
9t trash <id|name>
9t restore <id|name>
9t logout
```

`push` figures out the type itself: an existing file path becomes a file, an `http(s)` URL becomes a link, anything else becomes a snippet. `get` prints snippets and links, downloads files. IDs are 4 letters — any unambiguous prefix works.

Configuration:

```bash
9t config export [--output file]   # dump config as JSON (no secrets)
9t config import <file|->          # restore config, e.g. onto a new install
9t configure                       # interactive: modules, exposure, domain,
                                   # limits, theme — needs login except server
9t configure --section server      # port, address, data dir, HTTPS flag (offline)
9t doctor [--domain host]          # exposure, listener, DNS and HTTPS diagnostics
```

The token is stored with owner-only permissions in `~/.config/9t/config.json`. `9t logout` revokes it on the server.

## Systemd service

Installs are named `9t-<checkout-hash>.service` so they never overwrite each other. On an existing checkout:

```bash
./9t setup --service --dry-run   # preview the unit, writes nothing
sudo ./9t setup --service        # install + enable at boot
```

The unit runs `node scripts/run-server.mjs`, which reads your existing `.env.production` — data is never touched. Diagnostics: `sudo systemctl status NAME`, `sudo journalctl -u NAME -f`.

## Updates and health

```bash
./9t status     # service state, build presence, listener + initialized flag
./9t update     # backup, git pull, rebuild into staging, migrate, restart
```

`update` refuses when the working tree has real local changes (regenerable build churn is auto-stashed) and backs up data before touching anything. Managed installs restart on the new build automatically; foreground installs print the build dir to restart with. `start` warns when sources are newer than the running build, which usually means an update was pulled but not rebuilt.
