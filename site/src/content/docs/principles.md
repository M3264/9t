---
title: Principles
description: What 9t is, what it refuses to become, and where it's going.
order: 6
---

# Principles

> **Put it in 9t. Get it anywhere — on your terms.**

Moving things between your own devices — an APK, a config file, a command, a URL — is more annoying than it should be. The workarounds (USB, email-to-self, Saved Messages, Drive) all involve friction, third-party trust, or both. Existing self-hosted tools each solve one slice well but force you into being a "files" tool, a "snippets" tool, or a "notes" tool. One person's actual workflow is usually a mix of all three.

## Configurability of identity

9t's bet: the tool should reshape into a dev snippet-mover, a personal Dropbox, or a personal dashboard homepage — or all three — based on which modules are on. Priorities, in order: **speed, simplicity, privacy, self-hosting, configurability.** 9t never becomes a productivity suite.

## Safety rules (enforced, not suggested)

- **Auth is mandatory in every mode.** The unauthenticated-LAN idea was cut on purpose: an "off switch for auth" is exactly the footgun self-hosting doesn't need.
- **Single owner.** No teams, no permissions matrix. A second user would be a new product decision, not a config addition.
- **TLS terminates at the reverse proxy**, never inside 9t. `NINE_T_HTTPS=true` only marks cookies Secure.
- **No external audit has been performed, and none is claimed.** The honest statement is "reviewed implementation with automated checks."

## Deliberately excluded

Multi-user, end-to-end encryption (transport + OS at-rest protection only), billing, cloud hosting, iOS client, Caddy/DNS automation. Excluded means excluded for a reason, not forgotten.

## Roadmap (proportionate)

1. Scoped security self-review — auth, pairing, rate limits, share entropy, backups; written threat model.
2. External audit — only if 9t ever makes public security claims or gains a second trust domain.
3. PostgreSQL cutover and S3 storage when a single disk stops being enough.

The product grows a layer only once the previous one has proven itself. The full technical whitepaper ships in the repo at [`docs/whitepaper.md`](https://github.com/M3264/9t/blob/main/docs/whitepaper.md).
