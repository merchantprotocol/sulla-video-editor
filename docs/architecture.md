# Sulla Video Editor — System Architecture

> Current implementation as of April 2026.

---

## Overview

The video editor is a **self-contained Docker stack** running locally or on a single server:

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │             app (Node.js + Nginx)                │   │
│  │                                                   │   │
│  │  ┌─────────┐  ┌──────────┐  ┌───────────────┐  │   │
│  │  │ Express  │  │ FFmpeg   │  │ Whisper.cpp   │  │   │
│  │  │ API      │  │ Renderer │  │ Transcriber   │  │   │
│  │  └────┬─────┘  └────┬─────┘  └──────┬────────┘  │   │
│  │       │              │               │            │   │
│  │  ┌────┴──────────────┴───────────────┴────────┐  │   │
│  │  │          File Storage (./storage/)          │  │   │
│  │  └────────────────────────────────────────────┘  │   │
│  │                                                   │   │
│  │  ┌──────────────────────────────────────────┐    │   │
│  │  │  React SPA (Vite → ./public/)            │    │   │
│  │  └──────────────────────────────────────────┘    │   │
│  └─────────────────────┬───────────────────────────┘   │
│                        │                                 │
│  ┌─────────────────────┴───────────────────────────┐   │
│  │          db (PostgreSQL 16)                      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │     migrate (runs migrations/*.sql on start)     │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20 |
| Framework | Express.js |
| Database | PostgreSQL 16 (via `pg` driver) |
| Frontend | React 19 + Vite 8 + TypeScript + CSS Modules |
| Video processing | FFmpeg (render, extract, transcode) |
| Transcription | whisper.cpp (C++, DTW alignment) |
| Composition | Puppeteer + Chromium (React-to-video) |
| Web server | Nginx (reverse proxy + static files) |
| Auth | Custom JWT (30-day, HMAC-SHA256) + API key bypass |
| Container | Docker Compose (3 services) |

## Backend Architecture

```
src/
  index.js              # Express app, route mounting, error handler
  lib/
    auth.js             # JWT creation/verification, password hashing
    db.js               # PostgreSQL connection pool
  middleware/
    auth.js             # requireAuth (JWT + API key)
    requestId.js        # Request ID generation + access logging
    errorHandler.js     # Centralized error handling
  controllers/
    auth.controller.js
    user.controller.js
    org.controller.js
    project.controller.js
    template.controller.js
    render.controller.js
  services/
    project.service.js  # Project lifecycle + file operations
    template.service.js # Template resolution + defaults
    render.service.js   # FFmpeg render pipeline + progress streaming
    transcribe.js       # Whisper.cpp integration
    media.js            # FFprobe, audio extraction, thumbnails
    caption.service.js  # ASS subtitle generation
    compose.service.js  # Slide + React composition
    upload.service.js   # Chunked upload management
  repositories/
    user.repository.js
    org.repository.js
    project.repository.js
    template.repository.js
  routes/
    auth.js             # POST register, login; GET me
    users.js            # CRUD users
    orgs.js             # Org management, members, invites
    projects.js         # Project CRUD, upload, transcribe, EDL
    render.js           # Render, clips, SSE stream, exports
    templates.js        # Template CRUD, system templates
    compose.js          # Composition endpoints
  templates/
    system/             # System template JSON files
      index.js          # Auto-loader
      podcast.json
      youtube.json
      social.json
      tutorial.json
      interview.json
  utils/
    config.js           # Environment variable loading
    errors.js           # Custom error classes
    logger.js           # Structured logging
  cli/
    seed-system-templates.js
    render-demo.js
  openapi.json          # OpenAPI 3.1 spec
```

## Frontend Architecture

```
app/src/
  main.tsx              # React entry point
  App.tsx               # Router + layout
  lib/
    api.ts              # HTTP client (fetch wrapper)
    chunkedUpload.ts    # Resumable file upload
  hooks/
    useProjects.ts      # Project CRUD + media operations
    useTemplates.ts     # Template CRUD
    useEditor.ts        # EDL state management, undo/redo, cut operations
  pages/
    Welcome.tsx         # Dashboard / home
    NewProject.tsx      # Project creation + template selection + upload
    Editor.tsx          # Main editor (transcript, video, tracks, panels)
    Templates.tsx       # Template browser + scene preview + playback
  components/
    Nav.tsx             # Sidebar navigation
    Onboarding.tsx      # First-run setup
    ExportPanel.tsx     # Export format/quality picker
```

## Data Flow

### Project Lifecycle

```
1. Create Project (+ optional template)
   → POST /api/projects { name, template_id }
   → DB row created, template_config snapshotted
   → Storage directories created

2. Upload Media
   → POST /upload/init → /upload/chunk (×N) → /upload/complete
   → Source saved, metadata extracted, audio extracted, thumbnails generated

3. Transcribe
   → POST /transcribe (SSE stream)
   → Whisper.cpp processes audio with DTW alignment
   → Word-level transcript saved to data/transcript.json
   → Template rules auto-applied (fillers removed, silence trimmed)

4. Edit
   → Frontend EDL operations (cut, restore, undo/redo)
   → EDL auto-saved to data/edl.json
   → Playback skips cut regions in real-time

5. Render
   → POST /render or /render/stream (SSE)
   → FFmpeg concat filter graph with micro-crossfades
   → Output saved to exports/<format>-<resolution>.mp4

6. Export
   → GET /exports/:filename → download
```

### EDL Cut Pipeline

```
User action (delete word / remove fillers / trim silence)
  → Compute raw timestamps from transcript
  → Pad: -80ms before, +60ms after (compensate whisper drift)
  → Merge overlapping cuts
  → Store in EDL { version, cuts[] }
  → Auto-save to backend after 1s debounce
  → Playback: requestAnimationFrame checks + seeks past cuts
  → Render: FFmpeg trim → fade → concat per kept segment
```

### Template Pipeline

```
System templates (JSON files) → loaded at startup
  ↓
Template list API → system + org custom templates
  ↓
New Project page → user selects template
  ↓
Project create → template_config snapshotted to project row
  ↓
After transcription → rules auto-applied:
  - removeFillers → editor.removeAllFillers()
  - trimSilence → editor.trimAllSilence(thresholdMs)
  - studioSound → enable audio enhancement
  - normalize → enable loudness normalization
```

## Database Schema

```
users          → id, name, email, password_hash, avatar_url
orgs           → id, name, slug
org_members    → org_id, user_id, role (owner/admin/member)
org_invites    → org_id, email, role, invited_by, accepted_at
projects       → id, org_id, name, status, rule_template,
                 template_id, template_config (JSONB),
                 media_path, transcript_path, duration_ms,
                 resolution, file_size, created_by
templates      → id, org_id, name, slug, description,
                 config (JSONB), is_system, created_by
app_state      → key/value store (onboarding state)
```

## Authentication

### JWT Flow
1. Register/Login → server creates JWT (HMAC-SHA256, 30-day expiry)
2. Token stored in `sulla_token` httpOnly cookie + returned in response
3. All protected endpoints check `Authorization: Bearer <token>` or cookie
4. Token payload: `{ sub: userId, email, exp }`

### API Key Bypass
When `SULLA_API_KEY` env var is set, it can be used as a Bearer token. This bypasses JWT and operates as the first registered user. Used for programmatic access from Sulla Desktop or external integrations.

## Rendering Pipeline

### Standard Flow (select/aselect)
Used when no cuts or single keep range:
```
Input → FFmpeg -ss/-t trim → scale/pad → encode → output
```

### Concat Flow (multiple cuts)
Used when EDL produces multiple keep ranges:
```
For each keep range:
  trim video + audio → fade in (5ms) → fade out (5ms)
Concat all segments → scale/pad → encode → output
```

The 5ms micro-crossfade at cut boundaries eliminates audible pops/clicks.

### Progress Streaming
The `/render/stream` endpoint parses FFmpeg stderr for `time=HH:MM:SS.ss`, converts to percentage, and streams via SSE.

## API Surface

45+ endpoints across 8 groups. Full reference in [api-reference.md](api-reference.md).

| Group | Endpoints |
|-------|-----------|
| System | health, onboarded, openapi.json |
| Auth | register, login, me |
| Users | list, get, update, password, delete |
| Organizations | get, update, members CRUD, invites CRUD |
| Projects | CRUD, upload, transcribe, transcript, EDL, suggestions, exports |
| Templates | CRUD, system list, by-slug, defaults |
| Rendering | render, render/stream (SSE), clips, serve exports |
| Composition | compose, quick compose, React compose |

## Future Architecture (North Star)

The current implementation is a self-contained Docker stack. The planned evolution:

1. **SaaS Dashboard** — Cloudflare Pages + Workers + D1 + R2
2. **GPU Workers** — Modal/Fly.io for transcription and rendering at scale
3. **MCP Server** — Sulla Desktop AI agent manages projects via MCP tool calls
4. **Video-as-Code** — Projects stored as Git repos (transcript.json, edl.json, sulla.config.ts)
5. **Multi-tenant** — Full org/team collaboration with role-based access

See [video-as-code.md](video-as-code.md) and [roadmap.md](roadmap.md) for the full vision.
