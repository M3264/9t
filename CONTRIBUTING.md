# Contributing to 9t

9t is a single-owner, self-hosted workspace. Contributions that keep it
small, fast, and private-by-default are welcome.

## Setup

Requirements: Node.js 22+, Linux (systemd optional), Git.

```bash
git clone https://github.com/M3264/9t.git
cd 9t
./setup.sh            # wizard: preferences, admin, build, optional boot service
```

For a throwaway preview without writing anything:

```bash
./9t setup --dry-run
```

## Checks before a pull request

```bash
node --test tests/*.test.mjs   # unit suites (must be 15/15 green)
npm run typecheck               # tsc --noEmit, must be clean
```

`tests/setup-install.mjs` is a separate end-to-end smoke test that performs
a real installation — run it only in a disposable checkout or container.

## Ground rules

- **Never touch user data.** `data/`, `.env.production`, and `backups/` are
  ignored for a reason. Setup and update flows must never overwrite them.
- **Keep the update path safe.** `./9t update` refuses on real local changes
  but auto-stashes regenerable churn (`next-env.d.ts`, `tsconfig.json`).
  Don't weaken that guard.
- **Small diffs.** One concern per PR, with tests for script changes.
- **No secrets in the tree.** Tokens, keystores, and passwords never get
  committed. `.env.example` documents keys; values stay local.
- **Docs follow code.** User-facing changes update `docs/` and, when the
  public site is affected, `site/` too.

## Reporting bugs

Use the bug-report template with: 9t version (`git log --oneline -1`),
install mode (wizard/Docker), Node version, and steps to reproduce.
