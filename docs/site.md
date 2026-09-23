# 9t.kennyy.tech — landing + guide site operations

Static site in `site/`, served by nginx from `/var/www/9t-tech`. The app
(`9t.kennyy.xyz` → Next on :3265) is untouched by everything here.

## First-time setup (production host)

1. DNS is already proxied through Cloudflare (orange cloud on). In the
   Cloudflare dashboard set SSL/TLS mode to **Full (strict)**.
2. Install the vhost and get a certificate:
   ```bash
   sudo cp deploy/nginx/9t-tech.conf /etc/nginx/sites-enabled/9t-tech.conf
   sudo certbot --nginx -d 9t.kennyy.tech
   ```
   HTTP-01 challenges pass through the Cloudflare proxy on port 80.
3. Publish the pages:
   ```bash
   sudo node scripts/publish-site.mjs
   ```
   This syncs `site/` → `/var/www/9t-tech`, runs `nginx -t`, and reloads.
4. Open `https://9t.kennyy.tech`.

## Updating content

Edit `site/` (pure static HTML + one stylesheet, no build step), commit,
pull on the host, and re-run `sudo node scripts/publish-site.mjs`.
Preview locally with any static server, e.g. `npx serve site`.

## Layout

- `site/index.html` — landing (hero, features, personas, quick-start).
- `site/docs/` — install, android, network, sharing, operations guides,
  converted from `docs/`.
- `site/assets/` — `style.css`, `9t-mark.svg`, Space Grotesk fonts.
- `deploy/nginx/9t-tech.conf` — the vhost (port 80 → 301, port 443 static).
- `scripts/publish-site.mjs` — sync + `nginx -t` + reload.

APK and app links on the site are absolute (`https://9t.kennyy.xyz/...`)
so the static host needs no proxy rules.
