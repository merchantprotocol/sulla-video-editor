# Deployment & Configuration

## Docker Compose (Primary)

The app runs as a Docker Compose stack with three services:

```yaml
services:
  app:        # Node.js + Express + Nginx + FFmpeg + Whisper + Puppeteer
  db:         # PostgreSQL 16
  migrate:    # Runs SQL migrations on startup
```

### Start

```bash
docker compose up -d
```

### Rebuild after code changes

The project directory is volume-mounted (`./:/var/www/html:rw`), so backend changes take effect on Node restart. Frontend changes require a rebuild:

```bash
# Rebuild React SPA
cd app && npm run build && cp -r dist/* ../public/

# Restart Node process
docker compose restart app
```

### Ports

| Port | Service |
|------|---------|
| 80 (HTTP) | Nginx → Node.js |
| 443 (HTTPS) | Nginx → Node.js (if certs configured) |
| 5432 | PostgreSQL (internal only) |

Configurable via `APP_PORT` and `APP_SSL_PORT` env vars.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node environment |
| `PORT` | `8081` | Express server port (inside container) |
| `DATABASE_URL` | `postgresql://sulla:sulla@db:5432/sulla_video` | PostgreSQL connection string |
| `JWT_SECRET` | `sulla-local-dev-secret` | JWT signing secret. **Change in production.** |
| `SULLA_API_KEY` | *(none)* | Optional API key for programmatic access. When set, can be used as Bearer token. |
| `WHISPER_CLI` | `whisper-cli` | Path to whisper.cpp binary |
| `WHISPER_MODEL_PATH` | `/opt/whisper-models/ggml-base.en.bin` | Path to whisper model file |
| `WHISPER_DTW` | `tiny.en` | DTW model name for word-level alignment |
| `WAZUH_MANAGER` | *(none)* | Wazuh security agent manager address |
| `WAZUH_AGENT_NAME` | *(none)* | Wazuh agent name |

## Migrations

Migrations run automatically via the `migrate` service on `docker compose up`. They execute all `migrations/*.sql` files in order.

| File | Description |
|------|-------------|
| `001_initial.sql` | Users, orgs, org_members, org_invites, projects, templates, app_state |
| `002_system_templates.sql` | Adds `is_system`, `slug`, `description` to templates; makes org_id/created_by nullable |
| `003_project_template_config.sql` | Adds `template_id` and `template_config` JSONB to projects |

### Running migrations manually

```bash
docker compose up -d migrate
```

### Seeding system templates

After migration 002, system templates can be populated in the DB:

```bash
docker compose exec app node src/cli/seed-system-templates.js
```

This is optional — the app falls back to serving system templates directly from the JSON files when they're not in the DB.

## Docker Image

Base image: `ghcr.io/merchantprotocol/docker-nginx-node20-ffmpeg:latest`

Pre-installed in the image:
- **Node.js 20** — runtime
- **Nginx** — reverse proxy + static file serving
- **FFmpeg** — video processing, rendering, audio extraction
- **Whisper.cpp** — built from source with CLI binary at `/usr/local/bin/whisper-cli`
- **Chromium** — installed via Playwright for React composition rendering
- **Whisper model** — `ggml-base.en.bin` at `/opt/whisper-models/`

## Storage

Project files are stored at `/var/www/html/storage/` (volume-mounted from host). Structure:

```
storage/
  <project-uuid>/
    media/
      source.mp4
      audio.wav
      thumbnails/
    data/
      tracks.json
      transcript.json
      edl.json
    exports/
      16x9-1080p.mp4
```

## Local Development

```bash
# Install dependencies
npm install
cd app && npm install && cd ..

# Start PostgreSQL
docker compose up -d db

# Run migrations
for f in migrations/*.sql; do psql $DATABASE_URL -f "$f"; done

# Start backend (with file watcher)
npm run dev

# Start frontend dev server (Vite, hot reload)
cd app && npm run dev
```

The backend runs on port 8081. The Vite dev server proxies `/api` requests to it.

## API Key Authentication

For programmatic access (e.g., from Sulla Desktop or external integrations):

1. Set `SULLA_API_KEY` environment variable to a strong random string
2. Use it as a Bearer token: `Authorization: Bearer <your-api-key>`
3. The API key bypasses JWT auth and operates as the first registered user (owner)

This is how the Sulla AI agent manages projects without user login.

## Upgrading Whisper Model

The default `base.en` model is fast but less accurate. For better timestamp accuracy:

```bash
# Download small.en model (4x more accurate timestamps)
docker compose exec app bash -c "
  cd /opt/whisper.cpp && bash models/download-ggml-model.sh small.en
  cp models/ggml-small.en.bin /opt/whisper-models/
"
```

Then set `WHISPER_MODEL_PATH=/opt/whisper-models/ggml-small.en.bin` in your environment.

| Model | Size | Speed | Timestamp Accuracy |
|-------|------|-------|-------------------|
| tiny.en | 75 MB | Fastest | ~200ms drift |
| base.en | 142 MB | Fast | ~100-200ms drift |
| small.en | 466 MB | Moderate | ~50-100ms drift |
| medium.en | 1.5 GB | Slow | ~30-50ms drift |
