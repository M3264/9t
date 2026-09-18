# Installing 9t

## Start here

In your Linux/macOS terminal, or **Ubuntu inside WSL** on Windows:

```bash
git clone https://github.com/M3264/9t.git
cd 9t
./setup.sh
```

Choose **LAN** if your phone will connect through Wi-Fi or a hotspot. Keep the printed port and startup instructions. Open the resulting address, sign in with the administrator account you created, then follow [phone connection and network troubleshooting](./network-troubleshooting.md). **On Windows/WSL, complete that guide's forwarding steps before using the address on your phone.** An address that works on the Windows laptop may be private to WSL.

The initial download/build needs internet access. After installation, a running LAN server can exchange data with the Android client without internet access.

## What setup does

Run `./setup.sh` after cloning the repository. No global CLI package or initial browser setup is required. The shell bootstrap installs Node.js 22 locally under `.tools/node` only if an adequate Node runtime is missing and you agree to the download. It supports Linux/macOS x64 and arm64; use WSL on Windows. It needs curl and tar. Downloads and checksums come from the official Node.js HTTPS distribution site.

The wizard then collects preferences, shows a summary, installs locked npm dependencies, builds a production version, hashes your administrator password, and writes private runtime configuration. Choose foreground startup, a Linux systemd service, or configuration only. The service option needs sudo (unless already root) and runs as the account invoking setup; running the installer as a regular user is preferable.

## Preferences

- Access: LAN (default), this computer only, or public behind an existing same-host HTTPS proxy.
- Port: 3265 by default; any free unprivileged port from 1024 to 65535.
- Modules: snippets, files, links, and optional Board. At least one content module is required.
- Appearance: system, light, or dark.
- Maximum upload: 1–2048 MB, default 500.
- Trash retention: 0–365 days, default 7. This configures the existing retention policy; installing cleanup/backup timers is still a separate step using `deploy/systemd/`.
- Data: the ignored `data` directory in the checkout, or a dedicated external directory.
- Administrator: username and hidden password entry/confirmation. Password is stored only as a salted scrypt hash; the generated `.env.production` contains an independent random first-run key.
- Startup and optional `~/.local/bin/9t` command.

LAN mode binds to all interfaces and still requires login. It does not distinguish trusted Wi-Fi from other reachable interfaces: on a cloud host, use its firewall to control external access. Local/public modes bind to 127.0.0.1. Public mode expects your HTTPS proxy to forward to that listener; `.9t/Caddyfile` is a configuration example, not automatic certificate provisioning. The final HTTPS URL is only usable once your proxy and DNS are configured.

The installer does not provision Android signing keys or build an APK. Pair an existing Android client from the installed server's Settings → Android devices & pairing.

## Windows and WSL startup

Run the Linux commands in Ubuntu, and Windows networking commands in **PowerShell as Administrator**, as labeled in the [network guide](./network-troubleshooting.md#windows-with-ubuntu-in-wsl-2). The wizard does not configure Windows forwarding or Windows Firewall; its printed LAN addresses come from Linux interfaces.

The systemd startup option is available only when systemd is running in your distribution. If it is unavailable, choose foreground or later and start with `./9t start`; leave that process running. To enable systemd where supported, follow [Microsoft's WSL systemd instructions](https://learn.microsoft.com/en-us/windows/wsl/systemd). A Linux service starting when the distribution boots does not itself arrange for Windows to launch WSL at sign-in. Keep the laptop awake and WSL running while receiving on your phone.

If you already completed setup, do not rerun it to change the network binding. Edit `NINE_T_HOST` and `PORT` in `.env.production`, then restart the existing service or foreground process. Explicit process environment variables override this file. For ordinary LAN HTTP, use `NINE_T_HOST=0.0.0.0` and `NINE_T_HTTPS=false`. Keep `NINE_T_HTTPS=true` on an existing HTTPS deployment; this setting controls secure session cookies, not TLS termination.

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

With Node.js 22+ installed:

```bash
# First preview; no password needed and nothing installed:
./9t setup --answers /path/to/preferences.json --yes --dry-run

# Bash: collect password without echo or shell-history exposure:
read -rs -p 'Administrator password: ' NINE_T_ADMIN_PASSWORD
echo
export NINE_T_ADMIN_PASSWORD
./9t setup --answers /path/to/preferences.json --yes
unset NINE_T_ADMIN_PASSWORD
./9t start
```

Do not put a password in the preferences JSON or command arguments. Unset `PORT`, `NINE_T_HOST`, `NINE_T_DATA_DIR`, and `NINE_T_BUILD_DIR` before installation; the wizard/answers file defines the new installation. The password is excluded from dependency/build subprocess environments.

## Files, services, and recovery

- `.env.production`: private environment file, loaded by `npm start` / `9t start`.
- `data/9t.json` (or chosen external storage): initialized administrator, modules, preferences, and workspace data.
- `.9t-install.json`: private non-password installation summary.
- `.9t/`: generated proxy/service files.
- `.9t-setup.lock`: prevents two installers using the same checkout concurrently. After a killed installer, check that it is no longer running before removing a stale lock.

The installer refuses to replace existing configuration, workspace data, or a service for this checkout. If dependency installation/build fails, fix the displayed error and retry. If configuration was already saved, use `./9t start` to resume; do not reset the data directory. An existing global CLI link is left in place.

Systemd service names are `9t-<checkout-hash>.service`, so they do not overwrite an existing `9t.service`. The wizard prints the exact name. For service mode, keep the checkout and data outside `/tmp` and `/var/tmp`; the service uses a private temporary directory. Use `sudo systemctl status NAME` and `sudo journalctl -u NAME -f` for diagnostics. If service installation failed after configuration was saved, the generated `.9t/NAME` unit can be installed manually:

```bash
sudo install -m 644 .9t/NAME /etc/systemd/system/NAME
sudo systemctl daemon-reload
sudo systemctl enable --now NAME
```

Substitute the printed service name for `NAME`. Stop the service before moving/removing its checkout; its unit and optional CLI link point to that checkout. Future application updates are separate from first-time setup: stop the service, update/build the checkout, then restart with your existing data and configuration. Back up the data first.
