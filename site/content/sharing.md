---
title: Sharing
description: Expiring public links and QR handoff.
---

# Sharing with control

9t shares outward in two ways: **public handoffs** for other people, and **QR handoff** for your own devices. Nothing shared stays shared by accident.

## Public handoff links

Open any item and choose **Share** (or `9t share <id|name>` from the CLI):

```bash
9t share ab12cd34 --lifetime 1d --password optional-password
```

Each link gets a signed, unguessable token under `/s/…` with:

- **Expiry** — 1 hour, 1 day, 7 days, or custom. Expired links stop resolving; the sweeper purges them.
- **Optional password** — visitors see an unlock screen first. Wrong passwords never reveal whether the item exists.
- **Access counts** — every view is counted on the link so you can see if it spread.
- **Revocation** — kill the link any time from the Shares tab. The item itself is untouched.

Files download through a protected endpoint; snippets render as text; links show a destination preview before redirecting. Passwords are hashed — the server never stores them in plain text.

> Share links are bearer tokens. Anyone with the URL (and password, if set) can open them until they expire or you revoke them. Send them over a channel you trust.

## QR handoff to your own devices

Every item page (`/o/<id>`) shows a QR code. Sign in on the other device, scan, done — the item opens there in seconds. This is the fastest way to move something from laptop to phone when both are in your hands.

## Trash, restore, and lifetimes

Deleting an object moves it to Trash; it is purged after your retention window (default 7 days, configurable 0–365). Per-object lifetimes (1 hour / 1 day / 7 days / forever) converge on the same sweeper. Restore any time before the purge with `9t restore` or the Trash tab.
