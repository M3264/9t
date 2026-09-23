# Changelog

Follows the `main` branch. Earlier development notes remain available in
Git history.

## Unreleased

- Static landing + full docs site for 9t.kennyy.tech (`site/`, nginx vhost,
  `scripts/publish-site.mjs`).
- Repo restructure: `deploy/docker/`, `scripts/cli/`, `db/migrations/`;
  `next-env.d.ts` untracked.
- `./9t setup --service` installs the systemd boot service on an existing
  checkout; systemd unit quoting fixed (`WorkingDirectory` unquoted).
- `./9t update` auto-stashes regenerable build churn instead of refusing.

## 0.6.3

- Android Inbox deletions and Clear local history stay hidden after sync. Only
  item identity is retained locally to prevent the server copy returning.
- Files sent from the phone sync into the workspace without automatically
  downloading a second copy. A manual Download a copy action remains available.
- Guard the live notification's generated-replies setting on older Android.

## 0.6.2

- Android Inbox refresh: compact header, clearer saved-item list, readable file
  sizes, and a More menu for pinning, sharing, and removing local items.

## 0.6.1

- Android 0.6.1 / version code 21: Paper + Neon native UI matching the web
  workspace. Same signing certificate; install over the existing app.
- Tactile Paper + Neon web refresh: topbar + tabs shell, sticker cards,
  quick-stick capture, list-view long-name truncation fix.
- `./9t configure` with per-section login needs; install-level server
  settings with restart offer.

## 0.4.x and earlier

- Signal Desk workspace, universal inbox, board, shares with expiry and
  passwords, Trash with retention, CLI (`push/list/get/share/trash/restore`),
  PWA + share target, Android background receiving, Docker install,
  systemd units and timers, backup/restore, setup wizard.
