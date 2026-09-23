---
title: Documentation
description: Everything you need to run 9t — install it, pair your phone, fix the network, share with control, and keep it running.
order: 0
---

# Documentation

9t is a quiet, self-hosted workspace for moving the things you need between your devices — files, snippets, links, handoffs, phone sync. One server, one owner, your infrastructure.

<CardGroup cols={2}>

<Card title="Install 9t" href="/docs/install/">

Three commands, then a wizard. Local, LAN, or public behind your proxy.

</Card>

<Card title="Pair your phone" href="/docs/android/">

APK install, 5-digit approval, background receiving that survives Doze.

</Card>

<Card title="Fix the network" href="/docs/network/">

The right address for your phone, WSL forwarding, hotspots.

</Card>

<Card title="Share with control" href="/docs/sharing/">

Expiring links, passwords, access counts, revocation, QR handoff.

</Card>

</CardGroup>

## How it fits together

<Diagram
  rows={[
    { from: "You", label: "paste / drop / push", to: "9t inbox" },
    { from: "9t inbox", label: "classify", to: "snippet · file · link" },
    { from: "Your server", label: "LAN-first · encrypted", to: "Android app" },
    { from: "Any item", label: "expiry + password", to: "public link" },
  ]}
  caption="Everything flows through your instance. Nothing touches a third party."
/>

## What 9t promises

<AccordionGroup>

<Accordion title="One inbox, not three apps">

Paste text, links, screenshots, and files into the same capture flow. The inbox classifies it — you never pick a type first.

</Accordion>

<Accordion title="Your server, your storage">

Data stays in storage you choose, with opaque file keys and atomic writes. No third-party workspace in the middle.

</Accordion>

<Accordion title="LAN-first handoff">

The Android client prefers the local network, falls back to the internet route, and reconnects in the background.

</Accordion>

<Accordion title="Share with control">

Expiring, optional-password public handoffs with access counts and revocation. Nothing shared stays shared by accident.

</Accordion>

<Accordion title="Private by default">

Auth is mandatory in every mode. No public-without-auth state can exist — setup refuses to create one.

</Accordion>

</AccordionGroup>

## Go deeper

<CardGroup cols={2}>

<Card title="Operations" href="/docs/operations/">

Backups, full CLI reference, systemd service, safe updates.

</Card>

<Card title="API" href="/docs/api/">

The HTTP API behind the dashboard, CLI, and Android client.

</Card>

<Card title="Principles" href="/docs/principles/">

What 9t is, what it refuses to become, and the roadmap.

</Card>

</CardGroup>

<Callout>

The markdown originals live in the repo under [`docs/`](https://github.com/M3264/9t/tree/main/docs). Found a mistake? Open a pull request — docs fixes are the easiest first contribution.

</Callout>
