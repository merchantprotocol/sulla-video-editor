# Sulla Video Editor — Implementation Plan

> Full app running locally in Docker. Node + FFmpeg + Whisper.cpp + PostgreSQL.
> Single user / small team. No cloud scaling needed.

---

## Container Stack

```
Dockerfile (builds on docker-nginx-node20-ffmpeg)
  └── adds: whisper.cpp + base.en model

docker-compose.yml
  ├── app     → Dockerfile (Node 20 + FFmpeg + Whisper.cpp + Nginx)
  ├── db      → postgres:16-alpine
  └── migrate → runs SQL migrations on boot
```

---

## Express API Endpoints (src/)

### Auth (done)
```
POST   /api/auth/register       → create user + org
POST   /api/auth/login          → return JWT
GET    /api/auth/me             → current user + orgs
GET    /api/onboarded           → has any user been created?
```

### Projects
```
GET    /api/projects                  → list projects for current org
POST   /api/projects                  → create project (name, template)
GET    /api/projects/:id              → project details + status
PUT    /api/projects/:id              → update project metadata
DELETE /api/projects/:id              → delete project + files

POST   /api/projects/:id/import       → upload media file (multipart)
GET    /api/projects/:id/transcript    → get transcript JSON
PUT    /api/projects/:id/transcript    → update transcript (speaker rename, etc.)
GET    /api/projects/:id/edl           → get edit decision list
PUT    /api/projects/:id/edl           → save edit decision list
GET    /api/projects/:id/suggestions   → get AI analysis results
```

### Transcription
```
POST   /api/projects/:id/transcribe   → run whisper.cpp on project media
GET    /api/projects/:id/transcribe    → get transcription job status
```

### AI Analysis
```
POST   /api/projects/:id/analyze      → run content analysis (Claude API)
  → detects: fillers, silence, hooks, pacing, clip candidates
  → writes results to suggestions.json
```

### Rendering
```
POST   /api/projects/:id/render       → start FFmpeg render job
GET    /api/projects/:id/render        → render job status + progress
POST   /api/projects/:id/clips        → generate social clips from clip candidates
GET    /api/projects/:id/exports       → list rendered output files
```

### Templates
```
GET    /api/templates                  → list templates for current org
POST   /api/templates                  → create template
GET    /api/templates/:id              → template config
PUT    /api/templates/:id              → update template
DELETE /api/templates/:id              → delete template
```

### Organizations
```
GET    /api/orgs/:id/members           → list members
POST   /api/orgs/:id/invite            → invite by email
DELETE /api/orgs/:id/members/:uid      → remove member
```

---

## File Storage (Local Filesystem)

No R2 or S3 — everything is local in the mounted volume.

```
/var/www/html/
├── storage/
│   └── projects/
│       └── {project-id}/
│           ├── media/
│           │   ├── source.mp4          ← original uploaded file
│           │   ├── audio.wav           ← extracted audio (for whisper)
│           │   └── thumbnails/         ← generated frame thumbnails
│           ├── data/
│           │   ├── transcript.json     ← whisper output (word-level)
│           │   ├── edl.json            ← edit decision list
│           │   ├── suggestions.json    ← AI analysis results
│           │   ├── captions.json       ← generated caption segments
│           │   └── clips.json          ← auto-detected clip boundaries
│           ├── exports/
│           │   ├── main-1080p.mp4      ← rendered output
│           │   ├── reel-9x16.mp4       ← vertical clip
│           │   └── clip-01.mp4         ← social clip
│           └── template.json           ← applied template config
```

---

## Processing Pipeline

### 1. Import Media
```
POST /api/projects/:id/import (multipart file upload)
  → save to storage/projects/{id}/media/source.mp4
  → extract metadata with ffprobe (duration, resolution, fps, codecs)
  → generate thumbnails: ffmpeg -i source.mp4 -vf fps=1/10 thumb-%04d.jpg
  → extract audio: ffmpeg -i source.mp4 -vn -ar 16000 -ac 1 audio.wav
  → update project record in DB (duration, resolution, file_size)
  → return { status: 'imported', duration_ms, resolution }
```

### 2. Transcribe
```
POST /api/projects/:id/transcribe
  → spawn: whisper-cli -m $WHISPER_MODEL_PATH -f audio.wav -oj -ml 1
    -oj = output JSON
    -ml 1 = max segment length 1 (word-level timestamps)
  → parse whisper JSON output → transform to our transcript.json format
  → write storage/projects/{id}/data/transcript.json
  → update project status in DB
  → return { status: 'transcribed', word_count }
```

### 3. AI Analysis (optional — requires Claude API key)
```
POST /api/projects/:id/analyze
  → read transcript.json
  → send to Claude API with prompt:
    "Analyze this transcript. Identify:
     - Filler words (um, uh, like, basically, you know, so) with positions
     - Silence gaps > 1.5s
     - Opening hook strength (1-10) and suggested alternative start point
     - Pacing issues (sections that drag)
     - Top clip candidates with virality scores
     - SEO metadata suggestions (title, description, tags)"
  → parse response → write suggestions.json
  → return suggestions
```

### 4. Apply Edits (EDL)
```
PUT /api/projects/:id/edl
  → client sends updated EDL (cuts, reorders, inserts)
  → validate EDL against transcript
  → write edl.json
  → return confirmation
```

### 5. Render
```
POST /api/projects/:id/render { format, resolution, options }
  → read source media + edl.json + template.json
  → build FFmpeg filter chain:

  Basic cut render (no template):
    ffmpeg -i source.mp4 \
      -vf "select='...',setpts=N/FRAME_RATE/TB" \
      -af "aselect='...',asetpts=N/SR/TB" \
      output.mp4

  With captions:
    → generate ASS subtitle file from captions.json
    → add: -vf "ass=captions.ass"

  With PiP (if webcam track):
    → add: -filter_complex "[0:v][1:v]overlay=W-w-20:H-h-20"

  With title cards:
    → render title frames as PNG
    → concat: ffmpeg -f concat -i filelist.txt output.mp4

  → stream progress via stdout parsing (frame count / total frames)
  → save to exports/
  → update DB with export path
  → return { status: 'complete', path, duration_ms, file_size }
```

### 6. Generate Clips
```
POST /api/projects/:id/clips { clip_ids, formats }
  → read clips.json for boundaries
  → for each clip + format:
    → calculate crop for aspect ratio (face detection optional)
    → ffmpeg -ss start -t duration -i source.mp4 [filters] clip-N.mp4
    → if captions enabled: burn in ASS subtitles
  → save to exports/
  → return clip list with paths
```

---

## React Frontend (app/src/)

### Pages

```
/                    → Welcome (project list, quick actions)
/new                 → New Project (upload, pick template, create)
/editor/:id          → Editor (transcript, video preview, tracks, suggestions)
/templates           → Template composer (canvas, scenes, properties)
```

### Editor Page — Component Breakdown

```
Editor
├── EditorTopBar          → project name, save status, export button, user menu
├── EditorMain
│   ├── TranscriptPanel   → the document-style transcript editor
│   │   ├── DocToolbar    → undo/redo, filler toggle, captions, studio sound, clips, sulla
│   │   └── DocContent    → speaker blocks with word-level text
│   │       ├── SpeakerBlock    → avatar, name (editable), timestamp, context menu
│   │       ├── TranscriptText  → word spans with selection, filler highlighting
│   │       └── SceneDivider    → scene break markers
│   └── RightPanel        → video preview + sulla suggestions
│       ├── VideoPreview   → video player with scrub bar
│       ├── SuggestionList → filler count, silence, hooks, clips
│       └── OverlayPanels  → captions, clips, export (slide-in)
├── TrackPanel            → multi-track timeline
│   ├── TrackToolbar      → transport controls, zoom, time display
│   ├── TrackRuler        → time ruler with playhead
│   └── TrackRow[]        → video/audio tracks with clips, waveforms, mute/solo
└── CommandPalette        → Cmd+K sulla command palette
```

### State Management

No Redux — use React context + hooks:

```
useAuth()        → user, org, login, register, logout
useProject()     → project data, transcript, edl, suggestions, save/load
usePlayback()    → play/pause, seek, currentTime, duration
useEditor()      → selection, undo/redo stack, clipboard
```

### Key Interactions

```
Click word          → seek video to that timestamp
Select words        → native text selection
Delete selection    → add cut to EDL, strikethrough words
Right-click         → context menu (cut, copy, delete, keep only, split scene)
Cmd+K               → command palette
Space               → play/pause
Cmd+Z               → undo (pop from undo stack, restore EDL state)
J/K/L               → shuttle playback
Click speaker name  → inline rename
Speaker ⋮ menu      → rename, change color, merge, split, assign
```

---

## Build Order

### Phase 1 — File pipeline (make it actually process video)
1. `POST /api/projects` — create project record
2. `POST /api/projects/:id/import` — file upload + ffprobe metadata + audio extraction + thumbnails
3. `POST /api/projects/:id/transcribe` — whisper.cpp → transcript.json
4. `GET /api/projects/:id/transcript` — serve transcript to frontend
5. Wire up the Welcome page to show real projects from DB
6. Wire up New Project page to actually upload and create

### Phase 2 — Transcript editor (make it editable)
7. Build `useProject()` hook — loads transcript + edl from API
8. Build `TranscriptPanel` component — renders word-level transcript from data
9. Build `usePlayback()` hook — manages video element, current time, sync with transcript
10. Build `VideoPreview` component — HTML5 video player synced to transcript
11. Wire selection → EDL updates → save to API
12. Build undo/redo stack in `useEditor()`

### Phase 3 — AI features
13. `POST /api/projects/:id/analyze` — Claude API integration
14. Build `SuggestionList` component — renders suggestions from API
15. Wire suggestion actions (remove fillers, trim silence) to EDL mutations
16. Build command palette with action dispatch

### Phase 4 — Rendering
17. `POST /api/projects/:id/render` — FFmpeg render from EDL
18. Build export panel with real progress (parse FFmpeg stdout)
19. `POST /api/projects/:id/clips` — auto-clip generation
20. Build clips panel showing real generated clips

### Phase 5 — Templates
21. Template CRUD API
22. Template composer UI (canvas with draggable elements)
23. Apply template to project → generates scene composition for FFmpeg

---

## What's Already Done

- [x] Docker setup (docker-compose.yml, Dockerfile with whisper.cpp)
- [x] PostgreSQL + migrations
- [x] Auth flow (register, login, onboarding overlay)
- [x] React app scaffold (Welcome, NewProject, Editor, Templates pages)
- [x] Nav, routing, auth context
- [x] HTML prototype with full UX (designs/v1a-interactive/)
- [x] Architecture docs + video-as-code philosophy
- [x] Market research + roadmap

## What's Next

→ **Phase 1, Step 1**: Build the project CRUD API and wire up file upload.
  The first real milestone: upload a video, get a transcript, see it in the editor.
