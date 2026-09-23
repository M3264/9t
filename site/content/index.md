---
title: Documentation
description: Set up 9t, save your first item, connect Android, and keep your instance running.
order: 0
---

# 9t documentation

9t is a self-hosted workspace for files, snippets, and links. Start with installation, save something in the workspace, then connect another device if you need one.

## Get started

On Linux, macOS, or Ubuntu inside Windows Subsystem for Linux:

```bash
git clone https://github.com/M3264/9t.git
cd 9t
./setup.sh
```

The setup wizard creates your administrator account and lets you choose local, LAN, or public access. Follow the startup instruction it prints, open the resulting address, and sign in. See [Install](/docs/install/) for requirements, Docker, and network choices.

<CardGroup cols={2}>

<Card title="Install 9t" href="/docs/install/">

Requirements, setup wizard, access modes, and first sign-in.

</Card>

<Card title="Use the workspace" href="/docs/workspace/">

Save a note, file, or link; search and pin it; open it on another device.

</Card>

</CardGroup>

## Connect and share

<CardGroup cols={2}>

<Card title="Connect Android" href="/docs/android/">

Install the app, pair it with your server, and set up background receiving.

</Card>

<Card title="Network setup" href="/docs/network/">

Choose a reachable address and troubleshoot LAN, WSL, hotspots, and proxies.

</Card>

<Card title="Sharing" href="/docs/sharing/">

Create expiring links, protect them with a password, and revoke access.

</Card>

</CardGroup>

## Run your instance

<CardGroup cols={2}>

<Card title="Operations" href="/docs/operations/">

Run the service, use the CLI, make backups, and update safely.

</Card>

<Card title="API reference" href="/docs/api/">

Use the authenticated HTTP API behind the web workspace and clients.

</Card>

</CardGroup>

## How 9t handles your data

9t runs on a server and storage location you choose. Sign-in is required in every access mode. The Android client prefers a configured local route and can fall back to a public route. See the [network guide](/docs/network/) to choose the right address for your devices.
