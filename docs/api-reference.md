# Sulla Video Editor — API Reference

Complete reference for all API endpoints. Base URL: `/api`

The OpenAPI 3.1 spec is available at `GET /api/openapi.json`.

---

## Authentication

All endpoints (except health, onboarded, register, login) require authentication via one of:

- **Bearer token**: `Authorization: Bearer <jwt_token>`
- **Cookie**: `sulla_token=<jwt_token>` (set automatically on login/register)
- **API key**: `Authorization: Bearer <SULLA_API_KEY>` (env var bypass, uses first user)

Tokens expire after 30 days.

---

## System

### `GET /api/health`
Health check. Returns DB connectivity status.

```json
{ "status": "ok", "service": "sulla-video-editor", "db": "connected" }
```

### `GET /api/onboarded`
Check if the app has been onboarded (first user registered).

```json
{ "onboarded": true }
```

### `GET /api/openapi.json`
Returns the full OpenAPI 3.1 specification.

---

## Auth

### `POST /api/auth/register`
Create the first user and organization. Sets a `sulla_token` cookie.

**Body:**
```json
{
  "name": "Jonathon",
  "email": "jon@example.com",
  "password": "secret123",
  "org_name": "My Studio"
}
```

**Response:**
```json
{
  "user": { "id": "uuid", "name": "Jonathon", "email": "jon@example.com" },
  "org": { "id": "uuid", "name": "My Studio" },
  "token": "jwt..."
}
```

### `POST /api/auth/login`
Authenticate and receive a JWT token.

**Body:**
```json
{ "email": "jon@example.com", "password": "secret123" }
```

**Response:**
```json
{
  "user": { "id": "uuid", "name": "Jonathon", "email": "jon@example.com" },
  "orgs": [{ "id": "uuid", "name": "My Studio", "role": "owner" }],
  "token": "jwt..."
}
```

### `GET /api/auth/me`
Get the current authenticated user and their organizations.

---

## Users

### `GET /api/users`
List all users.

**Response:**
```json
{ "users": [{ "id": "uuid", "name": "...", "email": "...", "avatar_url": null, "created_at": "..." }] }
```

### `GET /api/users/:id`
Get a user by ID, including their org memberships.

**Response:**
```json
{
  "user": { "id": "uuid", "name": "...", "email": "..." },
  "orgs": [{ "id": "uuid", "name": "My Studio", "role": "owner" }]
}
```

### `PUT /api/users/:id`
Update user profile.

**Body:**
```json
{ "name": "New Name", "email": "new@email.com", "avatar_url": "https://..." }
```

### `PUT /api/users/:id/password`
Change password. Minimum 6 characters.

**Body:**
```json
{ "password": "newpassword" }
```

### `DELETE /api/users/:id`
Delete a user.

---

## Organizations

### `GET /api/orgs/:orgId`
Get organization details.

### `PUT /api/orgs/:orgId`
Update organization name or slug.

**Body:**
```json
{ "name": "New Org Name", "slug": "new-slug" }
```

### Members

#### `GET /api/orgs/:orgId/members`
List all members of an organization.

**Response:**
```json
{
  "members": [
    { "id": "uuid", "name": "Jonathon", "email": "...", "role": "owner", "created_at": "..." }
  ]
}
```

#### `POST /api/orgs/:orgId/members`
Add an existing user to the organization.

**Body:**
```json
{ "user_id": "uuid", "role": "member" }
```

Roles: `owner`, `admin`, `member`

#### `GET /api/orgs/:orgId/members/:userId`
Get a specific member's details.

#### `PUT /api/orgs/:orgId/members/:userId`
Change a member's role.

**Body:**
```json
{ "role": "admin" }
```

#### `DELETE /api/orgs/:orgId/members/:userId`
Remove a member from the organization.

### Invites

#### `GET /api/orgs/:orgId/invites`
List pending invites.

#### `POST /api/orgs/:orgId/invites`
Create an invite by email.

**Body:**
```json
{ "email": "newuser@example.com", "role": "member" }
```

Invite roles: `admin`, `member`

#### `DELETE /api/orgs/:orgId/invites/:inviteId`
Revoke a pending invite.

---

## Projects

### `GET /api/projects`
List all projects for the authenticated user's organization.

### `POST /api/projects`
Create a new project, optionally with a template.

**Body:**
```json
{
  "name": "My Podcast Episode",
  "template_id": "uuid-or-system-podcast",
  "rule_template": "podcast"
}
```

When `template_id` is provided, the template config is snapshotted onto the project as `template_config`. This determines which rules auto-apply after transcription.

### `GET /api/projects/:id`
Get project details, including file status and media tracks.

**Response:**
```json
{
  "project": { "id": "uuid", "name": "...", "status": "editing", "template_config": {...} },
  "files": { "hasTranscript": true, "hasEdl": true, "hasSuggestions": false, "hasTracks": true },
  "tracks": [
    { "index": 0, "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
    { "index": 1, "type": "audio", "codec": "aac", "channels": 2, "sample_rate": 48000 }
  ]
}
```

### `PUT /api/projects/:id`
Update project metadata (name, status, etc).

### `DELETE /api/projects/:id`
Delete project and all associated storage files.

### Media Upload

#### Chunked Upload (recommended for large files)

```
POST /api/projects/:id/upload/init     → { uploadId, chunkSize, totalChunks }
POST /api/projects/:id/upload/chunk    → (binary chunk, headers: X-Upload-Id, X-Chunk-Index)
GET  /api/projects/:id/upload/status   → { received, total, percent }
POST /api/projects/:id/upload/complete → { status: "imported", duration_ms, resolution, ... }
```

#### Direct Upload (small files)

```
POST /api/projects/:id/import
Content-Type: application/octet-stream
X-Filename: video.mp4
Body: <raw file bytes>
```

On import, the system automatically:
1. Saves source file to `storage/<projectId>/media/source.mp4`
2. Extracts metadata (duration, resolution, codec, tracks)
3. Extracts audio to WAV for transcription
4. Generates thumbnail frames

### `GET /api/projects/:id/media/:filename`
Serve a media file (source video, audio.wav, etc).

### `GET /api/projects/:id/media/thumbnails/:filename`
Serve a thumbnail frame.

### Transcription

#### `POST /api/projects/:id/transcribe`
Start transcription. Returns a **Server-Sent Events** stream.

**SSE Events:**
```
data: {"type":"progress","progress":25}
data: {"type":"progress","progress":50}
data: {"type":"progress","progress":100}
data: {"type":"done","word_count":500,"duration_ms":30000}
```

On error:
```
data: {"type":"error","error":"No audio file found"}
```

Uses whisper.cpp with Dynamic Time Warping (DTW) for accurate word-level timestamps.

#### `GET /api/projects/:id/transcript`
Get the transcript JSON.

**Response:**
```json
{
  "speakers": [{ "id": "s1", "name": "Speaker 1", "color": "#3a7f9e" }],
  "words": [
    { "word": "Hello", "start": 0.5, "end": 0.82, "confidence": 0.95, "speaker": "s1" },
    { "word": "um", "start": 0.85, "end": 1.1, "confidence": 0.9, "speaker": "s1", "filler": true }
  ],
  "silences": [
    { "start": 5.2, "end": 7.8, "duration": 2.6, "after_word_index": 42 }
  ],
  "duration_ms": 30000,
  "word_count": 500
}
```

Filler words are auto-tagged: um, uh, like, basically, actually, literally, right, okay, so, well, you know, i mean.

#### `PUT /api/projects/:id/transcript`
Save an edited transcript.

### EDL (Edit Decision List)

#### `GET /api/projects/:id/edl`
Get the current EDL.

**Response:**
```json
{
  "version": 1,
  "cuts": [
    { "type": "remove", "start_ms": 850, "end_ms": 1160, "reason": "filler" },
    { "type": "remove", "start_ms": 5140, "end_ms": 7860, "reason": "silence:2.6s" }
  ]
}
```

#### `PUT /api/projects/:id/edl`
Save an updated EDL. The EDL is auto-saved by the frontend as edits are made.

Cut boundaries include padding (80ms before, 60ms after) to compensate for whisper timestamp drift. Overlapping cuts are automatically merged.

### `GET /api/projects/:id/suggestions`
Get AI editing suggestions (when available).

### `GET /api/projects/:id/exports`
List all exported video files with name, size, and creation date.

---

## Rendering

### `POST /api/projects/:id/render`
Render the project synchronously. Applies all EDL cuts with 5ms audio micro-crossfades.

**Body:**
```json
{
  "format": "16:9",
  "resolution": "1080p",
  "codec": "libx264",
  "quality": "high"
}
```

| Parameter | Options | Default |
|-----------|---------|---------|
| format | `16:9`, `9:16`, `1:1`, `4:5` | `16:9` |
| resolution | `720p`, `1080p`, `4k` | `1080p` |
| quality | `high` (CRF 18), `medium` (CRF 23), `low` (CRF 28) | `high` |

**Response:**
```json
{
  "status": "complete",
  "name": "16x9-1080p.mp4",
  "size": 12345678,
  "format": "16:9",
  "resolution": "1080p",
  "cuts_applied": 15,
  "original_duration_ms": 300000,
  "edited_duration_ms": 275000
}
```

### `POST /api/projects/:id/render/stream`
Render with real-time progress via **Server-Sent Events**. Same body as `/render`.

**SSE Events:**
```
data: {"type":"progress","progress":15}
data: {"type":"progress","progress":42}
data: {"type":"progress","progress":85}
data: {"type":"done","name":"16x9-1080p.mp4","size":12345678,...}
```

### `POST /api/projects/:id/clips`
Render a clip from a time range (for social media).

**Body:**
```json
{
  "start_ms": 15000,
  "end_ms": 45000,
  "format": "9:16",
  "resolution": "1080p"
}
```

### `GET /api/projects/:id/exports/:filename`
Download an exported file.

---

## Templates

### `GET /api/templates`
List all templates — system templates first, then org custom templates.

### `GET /api/templates/defaults`
Get the default system template configs keyed by slug.

### `GET /api/templates/system`
List only system templates (from DB, or fallback from JSON files).

### `GET /api/templates/system/:slug`
Get a specific system template by slug: `podcast`, `youtube`, `social`, `tutorial`, `interview`.

### `POST /api/templates`
Create a custom template.

**Body:**
```json
{
  "name": "My Podcast Style",
  "rule_type": "podcast",
  "config": {
    "theme": { "accentColor": "#5096b3", "background": "dark", "fontFamily": "Inter", "captionStyle": "bold" },
    "scenes": [
      { "type": "TitleCard", "duration": 4, "transitionIn": "fade" },
      { "type": "PiP", "pipPosition": "bottom-right", "pipSize": 120, "pipShape": "circle" }
    ],
    "rules": {
      "removeFillers": true,
      "trimSilence": { "enabled": true, "thresholdMs": 1500 },
      "studioSound": true,
      "normalize": { "enabled": true, "targetLufs": -14 },
      "autoCaptions": true,
      "autoClips": false
    },
    "export": { "defaultFormat": "16:9", "defaultResolution": "1080p", "defaultCodec": "h264" }
  }
}
```

### `GET /api/templates/:id`
Get a template by ID.

### `PUT /api/templates/:id`
Update a custom template. System templates cannot be modified.

### `DELETE /api/templates/:id`
Delete a custom template. System templates cannot be deleted.

---

## Composition

### `POST /api/projects/:id/compose`
Render a slide-based composition in an existing project.

**Body:**
```json
{
  "slides": [
    { "duration": 5, "text": "Title", "subtitle": "Subtitle", "background": "#0d1117", "accentColor": "#5096b3" }
  ],
  "width": 1920,
  "height": 1080,
  "fps": 30
}
```

### `POST /api/compose/quick`
Create a project and render a composition in one call.

**Body:**
```json
{
  "name": "Demo Video",
  "composition": { "slides": [...], "width": 1920, "height": 1080, "fps": 30 }
}
```

### `POST /api/compose/react`
Render a React component composition to video using Puppeteer.

---

## Error Responses

All errors return JSON:

```json
{ "error": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error (bad input) |
| 401 | Unauthorized (missing or invalid token) |
| 404 | Resource not found |
| 500 | Internal server error |
