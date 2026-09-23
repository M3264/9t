---
title: Sharing
description: Expiring public links and QR handoff.
---

# Sharing with control

9t has two different links: a **public share** (`/s/…`) for other people, and a **private item page** (`/o/…`) for your own signed-in devices. Choose the one that fits the handoff.

## Public handoff links

Open any item and choose **Share** (or `9t share <id|name>` from the CLI):

```bash
9t share matw --lifetime 1d
```

New public links use a short, four-letter code under `/s/…`. You can choose:

- **Expiry** — 1 hour, 1 day, 7 days, 30 days, or no expiry. The default is 1 day. Expired links stop resolving and are later purged.
- **Optional password** — at least 8 characters. Visitors must unlock the link first; the server stores a salted password hash.
- **Access counts** — non-file page opens and file downloads are counted. Repeated visits count again.
- **Revocation** — remove a link from **Shared links** at any time without deleting the item.

Files download through a route that checks the share; snippets render as text; links show their destination before someone opens it.

<Callout type="warn">

Four-letter links are convenient, but their codes can be guessed by trying combinations. **Use a password and a short expiry for sensitive items.** Anyone who has or guesses an unprotected link can open it until it expires or you revoke it. A no-expiry link remains public until you revoke it.

</Callout>

## QR handoff to your own devices

Every private item page (`/o/<id>`) shows a QR code. Sign in to the **same 9t instance** on the other device, then scan it. Unlike a public share, this page still requires your account.

## Trash, restore, and lifetimes

Deleting an item moves it to Trash; it is purged after your retention window (default 7 days, configurable 0–365). Restore it before then with `9t restore` or **Trash**. An item's own lifetime (1 hour, 1 day, 7 days, or forever) is separate: once it expires, the maintenance sweep removes it rather than keeping a recoverable copy in Trash.
