# Connecting your phone to 9t

First make the server address load in the phone's browser. Then configure the Android app with the same reachable address. This separates server/network problems from pairing and background-receiver problems.

Examples use port **3265**. Replace it everywhere if you selected another port. IP addresses below are examples, not fixed 9t addresses.

## Choose the address

| Where 9t runs | Address to use on the phone |
| --- | --- |
| Linux/macOS computer on the same Wi-Fi | That computer's active LAN IP and 9t port |
| Ubuntu inside Windows/WSL 2 | Windows' active Wi-Fi/hotspot IP and forwarded port; follow the WSL steps below |
| Public server | Its configured `https://` domain |

`localhost` and `127.0.0.1` refer to the device opening the address. On your phone, they mean the phone. `0.0.0.0` is a server listener setting, not a destination to enter in the app.

For a normal LAN installation, `.env.production` should contain:

```dotenv
NINE_T_HOST=0.0.0.0
PORT=3265
NINE_T_HTTPS=false
```

Restart 9t after changes. If it runs in the terminal, stop that process with Ctrl+C, then run `./9t start` in the checkout. If you installed a service, use `sudo systemctl restart NAME`, replacing `NAME` with the exact service name printed by setup. Do not start a second copy on the same port.

These settings describe plain HTTP LAN hosting. Do not change an existing HTTPS deployment's cookie setting to false. Public setup binds to localhost for its reverse proxy; adding direct LAN access requires configuring a reachable listener/proxy as well.

## Windows with Ubuntu in WSL 2

WSL 2 normally uses a virtual network. Reaching its address from Windows does not establish that a phone can reach it. Forward the Windows port into Ubuntu, then connect the phone to Windows' LAN address. See [Microsoft's WSL networking guide](https://learn.microsoft.com/en-us/windows/wsl/networking#accessing-a-wsl-2-distribution-from-your-local-area-network-lan).

### 1. Check that 9t is running in Ubuntu

In **Ubuntu**, with the LAN settings above:

```bash
curl -fsS http://127.0.0.1:3265/api/status
ss -ltnp 'sport = :3265'
hostname -I
```

A completed installation returns `{"initialized":true}`. The listener should show `0.0.0.0:3265`. If it shows only `127.0.0.1:3265`, fix the binding and restart. If there is no listener, start 9t or inspect its service logs before configuring Windows.

### 2. Forward the port in Windows

Open **Windows PowerShell as Administrator**. List your distributions:

```powershell
wsl -l -v
```

Set the exact distribution name shown, such as `Ubuntu` or `Ubuntu-24.04`, and your chosen port. These commands target the default WSL 2 NAT arrangement:

```powershell
$distro = "Ubuntu"
$port = 3265
wsl -d $distro hostname -I
```

Copy Ubuntu's IPv4 address from that output into `$wslIp` below. If multiple addresses appear, use Ubuntu's primary network address, not a Docker bridge. Inside Ubuntu, `ip -4 addr show eth0` can help identify it in the default NAT arrangement.

```powershell
$wslIp = "172.22.200.10" # Replace with YOUR Ubuntu IPv4 address
netsh interface portproxy show all
```

Check that no other application already uses the selected forwarding port, then add the rule:

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$port connectaddress=$wslIp connectport=$port
netsh interface portproxy show all
```

The forwarding destination is **Ubuntu's address**. The `vEthernet (WSL)` address in Windows' `ipconfig` output is Windows' end of that virtual network and is not the forwarding destination. Command details: [Microsoft portproxy reference](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-interface#portproxy).

### 3. Allow the local connection through Windows Firewall

Still in **Administrator PowerShell**, add a rule scoped to local-subnet clients. Run this once per selected port:

```powershell
New-NetFirewallRule -Name "9t-LAN-$port" -DisplayName "9t LAN TCP $port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -RemoteAddress LocalSubnet -Profile Any
```

The rule applies to all Windows network profiles so hotspot profile changes do not silently disable it; it permits only local-subnet sources. It does not bypass router/client isolation or organizational firewall policy. Do not disable Windows Firewall to troubleshoot. See [Microsoft's firewall rule reference](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule).

### 4. Find the address for the phone

In **Windows PowerShell**:

```powershell
ipconfig
```

- **Laptop joined the phone's hotspot:** use the Windows **Wi-Fi adapter IPv4 address**.
- **Phone joined the laptop's hotspot:** use the Windows adapter serving that hotspot. It may be labeled `Local Area Connection*` with a number. Look for the active adapter with an IPv4 address; ignore disconnected adapters. The phone's Wi-Fi gateway address can help identify it.
- **Both joined a router:** use the laptop's active Wi-Fi or Ethernet IPv4 address on that network.

For example, if Windows Wi-Fi shows `10.28.24.8`, open this on the phone:

```text
http://10.28.24.8:3265/api/status
```

Then open `http://10.28.24.8:3265` and sign in. Neither the Wi-Fi default gateway nor `vEthernet (WSL)` is the laptop's phone-facing 9t address.

### After restarting or changing networks

Recheck Ubuntu's address after a WSL restart. If it changed, update only the existing 9t forwarding rule in **Administrator PowerShell**:

```powershell
$distro = "Ubuntu" # Your actual distribution name
$port = 3265
wsl -d $distro hostname -I
$wslIp = "172.22.200.10" # Replace with the current Ubuntu IPv4 address
netsh interface portproxy set v4tov4 listenaddress=0.0.0.0 listenport=$port connectaddress=$wslIp connectport=$port
netsh interface portproxy show all
```

If Windows' Wi-Fi/hotspot IP changed, update the app's LAN URL too. A router DHCP reservation can keep the laptop's address stable on that router; it does not fix the separate WSL address.

To remove these rules when no longer hosting 9t, in **Administrator PowerShell**:

```powershell
$port = 3265
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port
Remove-NetFirewallRule -Name "9t-LAN-$port"
```

If you already configured WSL mirrored networking, use its firewall/network instructions instead of assuming the NAT forwarding recipe applies. Mirrored mode is an optional alternative on supported Windows versions; [Microsoft documents its requirements](https://learn.microsoft.com/en-us/windows/wsl/networking#mirrored-mode-networking).

## Pair the Android app

1. Open the reachable server in a browser and sign in.
2. Open **Settings → Android devices & pairing** (`/devices`) on that installation and create a phone pairing code.
3. Enter the code in the app. Under **Connect**, enter the reachable server address as its LAN URL, including `http://` and the port where applicable.
4. Choose **LAN-only** for an isolated local test, or **Automatic** for LAN-first access with public fallback.
5. Send a small file and a new snippet to check receiving. See [Android setup and background operation](./android.md) for receiver settings and platform limits.

Native encrypted LAN transfers support HTTP at a literal private IP, such as `http://10.28.24.8:3265`. The embedded **Workspace** currently requires a trusted HTTPS endpoint. A working HTTP native connection does not make the embedded website available over HTTP. Browser enrollment over HTTP is not protected by the native transfer encryption; use a trusted local network or HTTPS for pairing.

## LAN, hotspots, and internet fallback

Internet is not required for native LAN transfers once 9t and the app are installed and paired. Keep the server running, the laptop awake, and the phone connected to the network with a route to that server. If Android warns that Wi-Fi has no internet, keep that Wi-Fi connection for the LAN test. Some hotspot or guest-network configurations isolate devices; try an ordinary shared Wi-Fi network to distinguish isolation from a 9t problem.

For Automatic mode, the LAN and public URLs must reach **the same 9t installation and data directory**. The public URL needs an already working HTTPS reverse proxy or tunnel to that instance. The app does not create a tunnel, open router ports, or replicate data between servers.

A laptop-hosted workspace and a cloud-hosted instance are separate installations. Pairing keys and items from one do not work on the other. Entering the cloud URL as fallback for an independently hosted laptop workspace will not provide synchronization between them.

## Troubleshoot in order

| Symptom | What to check next |
| --- | --- |
| Ubuntu cannot open its own `/api/status` | 9t process/service, actual port, startup errors, production build |
| Ubuntu works, Windows cannot open `http://UBUNTU_IP:PORT/api/status` | Listener binding, Ubuntu firewall if enabled, correct distribution/address |
| Windows can reach Ubuntu, but phone cannot reach Windows | Forwarding destination, Windows Firewall, correct Windows adapter, same network, hotspot/guest isolation |
| Worked before a restart/network change | Current WSL IP in portproxy, current Windows IP in the app, server still running |
| Website loads but sign-in does not persist over HTTP | `NINE_T_HTTPS` must be false for plain HTTP; restart after changing it |
| Browser works, native app cannot authenticate | Pairing from this exact instance, correct saved LAN URL, device not revoked, phone/server clocks accurate |
| Native transfers work but Workspace does not | Workspace needs trusted HTTPS; an HTTP LAN URL alone is insufficient |
| Sync works only while app is open | Follow the Android background-receiver guide; changing WSL forwarding will not fix app lifecycle restrictions |

For a failed WSL connection, collect these **without sharing pairing codes, passwords, or `.env.production`**:

**Ubuntu** (replace the port if needed):

```bash
hostname -I
ss -ltnp 'sport = :3265'
curl -fsS http://127.0.0.1:3265/api/status
```

**Windows PowerShell**:

```powershell
wsl -l -v
ipconfig
netsh interface portproxy show all
Get-NetFirewallRule -Name "9t-LAN-*" | Select-Object Name, Enabled, Direction, Action
```

Include the exact URL tried, whether it opens on Windows and on the phone, and which device provides the hotspot. Private IPs are useful for distinguishing the two networks; there is no need to share unrelated adapter details.
