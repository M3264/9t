---
title: Network
description: Pick the right server address for your phone — LAN, WSL port forwarding, hotspots, and a fix-it-in-order table.
order: 3
---

# Connecting your phone to 9t

First make the server address load in the phone's browser. Then configure the Android app with the same reachable address. This separates server/network problems from pairing and background-receiver problems.

Examples use port **3265**. Replace it everywhere if you selected another port.

## Choose the address

| Where 9t runs | Address to use on the phone |
| --- | --- |
| Linux/macOS computer on the same Wi-Fi | That computer's active LAN IP and 9t port |
| Ubuntu inside Windows/WSL 2 | Windows' active Wi-Fi/hotspot IP and forwarded port; follow the WSL steps below |
| Public server | Its configured `https://` domain |

`localhost` and `127.0.0.1` refer to the device opening the address. On your phone, they mean the phone. `0.0.0.0` is a server listener setting, not a destination.

For a normal LAN installation, `.env.production` should contain:

```dotenv
NINE_T_HOST=0.0.0.0
PORT=3265
NINE_T_HTTPS=false
```

Restart 9t after changes. Do not start a second copy on the same port.

## Windows with Ubuntu in WSL 2

WSL 2 normally uses a virtual network. Reaching its address from Windows does not establish that a phone can reach it. Forward the Windows port into Ubuntu, then connect the phone to Windows' LAN address.

### 1. Check that 9t is running in Ubuntu

```bash
curl -fsS http://127.0.0.1:3265/api/status
ss -ltnp 'sport = :3265'
hostname -I
```

A completed installation returns `{"initialized":true}`. The listener should show `0.0.0.0:3265`.

### 2. Forward the port in Windows

Open **Windows PowerShell as Administrator**:

```powershell
$distro = "Ubuntu"
$port = 3265
wsl -d $distro hostname -I
```

Copy Ubuntu's IPv4 address into `$wslIp` below, then add the rule:

```powershell
$wslIp = "172.22.200.10" # Replace with YOUR Ubuntu IPv4 address
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$port connectaddress=$wslIp connectport=$port
netsh interface portproxy show all
```

### 3. Allow the local connection through Windows Firewall

Still in **Administrator PowerShell**, once per selected port:

```powershell
New-NetFirewallRule -Name "9t-LAN-$port" -DisplayName "9t LAN TCP $port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -RemoteAddress LocalSubnet -Profile Any
```

Do not disable Windows Firewall to troubleshoot.

### 4. Find the address for the phone

In **Windows PowerShell**, run `ipconfig`:

- **Laptop joined the phone's hotspot:** use the Windows **Wi-Fi adapter IPv4 address**.
- **Phone joined the laptop's hotspot:** use the Windows adapter serving that hotspot (often `Local Area Connection*`).
- **Both joined a router:** use the laptop's active Wi-Fi or Ethernet IPv4 address.

Then open `http://<that-ip>:3265` on the phone and sign in.

### After restarting or changing networks

Recheck Ubuntu's address after a WSL restart. If it changed, update only the existing forwarding rule:

```powershell
netsh interface portproxy set v4tov4 listenaddress=0.0.0.0 listenport=$port connectaddress=$wslIp connectport=$port
```

If Windows' Wi-Fi/hotspot IP changed, update the app's LAN URL too.

## Pair the Android app

1. Open the reachable server in a browser and sign in.
2. Open **Settings → Android devices & pairing** (`/devices`) and create a phone pairing code.
3. Enter the code in the app. Under **Connect**, enter the reachable server address as its LAN URL.
4. Choose **LAN-only** for an isolated local test, or **Automatic** for LAN-first with public fallback.
5. Send a small file and a new snippet to check receiving.

## Troubleshoot in order

| Symptom | What to check next |
| --- | --- |
| Ubuntu cannot open its own `/api/status` | 9t process/service, actual port, startup errors, production build |
| Ubuntu works, Windows cannot reach Ubuntu | Listener binding, Ubuntu firewall, correct distribution/address |
| Windows reaches Ubuntu, phone cannot reach Windows | Forwarding destination, Windows Firewall, correct adapter, same network, hotspot isolation |
| Worked before a restart/network change | Current WSL IP in portproxy, current Windows IP in the app, server still running |
| Sign-in does not persist over HTTP | `NINE_T_HTTPS` must be false for plain HTTP; restart after changing it |
| Browser works, native app cannot authenticate | Pairing from this exact instance, correct LAN URL, device not revoked, clocks accurate |
| Transfers work but Workspace does not | Workspace needs trusted HTTPS; an HTTP LAN URL alone is insufficient |
| Sync works only while app is open | Follow the [Android background-receiver guide](/docs/android/#background-receiving) |

For a failed WSL connection, collect these **without sharing pairing codes, passwords, or `.env.production`** — Ubuntu: `hostname -I`, `ss -ltnp 'sport = :3265'`, `curl -fsS http://127.0.0.1:3265/api/status`; Windows PowerShell: `wsl -l -v`, `ipconfig`, `netsh interface portproxy show all`.
