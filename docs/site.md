# 9t.kennyy.tech — landing + guide site operations

Static site in `site/` (**Next.js static export** — same framework and visual
tokens as the app, so the marketing pages look like the product), served by
nginx from `/var/www/9t-tech`. The app (`9t.kennyy.xyz` → Next on :3265) is
untouched by everything here.

## First-time setup (production host)

1. DNS is already proxied through Cloudflare (orange cloud on). In the
   Cloudflare dashboard set SSL/TLS mode to **Full (strict)**.
2. Install the vhost and get a certificate:
   ```bash
   sudo cp deploy/nginx/9t-tech.conf /etc/nginx/sites-enabled/9t-tech.conf
   sudo certbot --nginx -d 9t.kennyy.tech
   ```
   HTTP-01 challenges pass through the Cloudflare proxy on port 80.
3. Publish the pages (builds the Next static export + Pagefind index, then syncs):
   ```bash
   sudo node scripts/publish-site.mjs
   ```
   This builds `site/` → `site/out`, syncs to `/var/www/9t-tech`, runs
   `nginx -t`, and reloads.
4. Open `https://9t.kennyy.tech`.

## Updating content

Edit the markdown in `site/content/` (landing: `site/app/page.tsx`),
commit, pull on the host, and re-run `sudo node scripts/publish-site.mjs`.
Preview locally with `npm --prefix site run dev`.

## Layout

- `site/app/page.tsx` — landing (hero, features, personas, quick-start).
- `site/content/` — install, android, network, sharing, operations,
  principles guides as markdown (rendered to `/docs/*` with sidebar, prev/next,
  and Pagefind search).
- `site/components/`, `site/styles/tokens.css` — shared chrome + the app's
  visual tokens (mirrored from `src/styles/globals.css` — keep in sync).
- `site/public/` — `9t-mark.svg`, Space Grotesk fonts (copied to output as-is).
- `deploy/nginx/9t-tech.conf` — the vhost (port 80 → 301, port 443 static).
- `scripts/publish-site.mjs` — build + sync + `nginx -t` + reload.

APK and app links on the site are absolute (`https://9t.kennyy.xyz/...`)
so the static host needs no proxy rules.
