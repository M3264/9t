# Security policy

9t is self-hosted software for a single owner. Internet-exposed instances
must use authentication (mandatory by design) plus HTTPS.

## Supported versions

Only the latest `main` receives fixes. There are no LTS branches; update
with `./9t update`.

## Reporting a vulnerability

**Do not open a public issue.** Report privately via GitHub's
[private vulnerability reporting](https://github.com/M3264/9t/security/advisories/new)
so a fix can land before details are public.

Include: affected version, install mode, and reproduction steps. Expect an
acknowledgement within a week.

## Scope notes

- 9t has not had an external security review. Avoid strong security claims
  when describing it.
- Client-side encryption is long-term work; server operators can read
  stored objects today. Self-host accordingly.
