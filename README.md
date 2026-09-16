# 9t

9t is a self-hosted, configurable internet workspace for moving files, snippets, and links between your devices while keeping the data on infrastructure you control.

## Current release

- First-run module selection and protected administrator creation
- Scrypt password hashing and persistent login sessions
- Snippets, file uploads/downloads, and saved links
- Search, filtering, pinning, and Quick Access
- Keyboard command palette and capture shortcuts
- Universal inbox that classifies pasted text, URLs, and dropped files
- System, Light, and Dark appearance modes
- Spatial Board with persisted object positions
- Editable object names and payloads
- Permanent or expiring objects
- Expiring public handoff links with access counts and revocation
- Trash, restore, and permanent deletion
- Module and upload-size settings
- Atomic local persistence with opaque file storage keys
- Responsive web interface and scalable SVG identity

The product and technical direction is documented in [9t-whitepaper.md](./9t-whitepaper.md).

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
cp .env.example .env.production
npm run build
npm start
```

9t listens on `0.0.0.0:3265`.

Generate a unique first-run setup key before exposing the server:

```bash
openssl rand -hex 16
```

Put the result in `NINE_T_SETUP_TOKEN`. The key is required only when creating the first administrator.

## Configuration

```dotenv
NINE_T_DATA_DIR=/absolute/path/to/9t/data
NINE_T_SETUP_TOKEN=replace-with-a-random-secret
NINE_T_HTTPS=false
```

Set `NINE_T_HTTPS=true` only after the app is served through HTTPS; this enables the Secure flag on session cookies.

Runtime data, uploaded objects, sessions, production secrets, dependencies, and build output are excluded from Git.

## Service deployment

An example systemd unit is provided in [9t.service](./9t.service). Update its user, working directory, and environment-file path for the target server before installing it.

```bash
sudo install -m 644 9t.service /etc/systemd/system/9t.service
sudo systemctl daemon-reload
sudo systemctl enable --now 9t.service
```

## Status

The current single-user release is operational. PostgreSQL, CLI support, Caddy automation, hybrid access, password-protected handoffs, and S3 storage remain on the roadmap in [TODO.md](./TODO.md).
