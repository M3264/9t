---
title: Operations
description: Backups, the CLI, the systemd service, and the safe update flow.
order: 5
---

# Keeping 9t running

## Backups and retention

Systemd timers clean expired and trashed objects hourly and create a daily verified archive; fourteen backups are retained by default. Verify an archive without changing data:

```bash
node scripts/restore.mjs backups/9t-….tar.gz --verify
```

Stop 9t before a real restore, then omit `--verify`. The restore tool keeps the previous data directory beside the restored copy.

## CLI

From a checkout, authenticate once, then drive your instance from any terminal:

```bash
9t login --url https://9t.example.com --username owner
9t push ./photo.jpg
9t push 'docker compose up -d' --name deploy
9t list
9t get ab12cd34
9t share ab12cd34 --lifetime 1d --password optional-password
9t trash ab12cd34
9t restore ab12cd34
9t configure [--section modules|exposure|domain|limits|interface|server]
9t logout
```

The token is stored with owner-only permissions in `~/.config/9t/config.json`. `9t logout` revokes it on the server.

## Systemd service

Installs are named `9t-<checkout-hash>.service` so they never overwrite each other. On an existing checkout:

```bash
./9t setup --service --dry-run   # preview the unit, writes nothing
sudo ./9t setup --service        # install + enable at boot
```

Diagnostics: `sudo systemctl status NAME`, `sudo journalctl -u NAME -f`.

## Updates and health

```bash
./9t status     # service state, build presence, listener + initialized flag
./9t update     # backup, git pull, rebuild into staging, migrate, restart
./9t doctor     # exposure and DNS diagnostics
```

`update` refuses when the working tree has real local changes (regenerable build churn is auto-stashed) and backs up data before touching anything. Managed installs restart on the new build automatically.
