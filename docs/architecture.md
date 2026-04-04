# Sulla Video Editor — System Architecture

> How the SaaS dashboard, Sulla Desktop, serverless workers, and MCP all fit together.

---

## Overview

The video editor is a **split system**:

1. **Dashboard (Cloudflare Pages)** — React SPA where users manage projects, view transcripts, edit via text, configure exports. This is the SaaS product people pay for.

2. **API (Cloudflare Workers)** — Auth, project CRUD, org management, job dispatch. Talks to D1 (database) and R2 (media storage).

3. **Workers (serverless)** — GPU/CPU workers that do the heavy lifting: transcription (Whisper), AI analysis (Claude), FFmpeg rendering, clip generation. These run on Modal/Fly.io/dedicated GPU.

4. **Sulla Desktop (Electron)** — Connects to the video editor via **MCP server**. Sulla's AI agent can create projects, trigger edits, run exports — all through MCP tool calls. Also handles local media capture (audio driver, screen recording).

```
┌─────────────────────────────────────────────────────────────────┐
│                      Sulla Desktop (Electron)                   │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ AI Agent      │  │ Audio Driver │  │ Capture Studio       │ │
│  │ (Claude API)  │  │ (mic + sys)  │  │ (screen + cam)       │ │
│  └──────┬────────┘  └──────┬───────┘  └──────────┬───────────┘ │
│         │                  │                      │             │
│         │ MCP tool calls   │ local media files    │             │
│         ▼                  ▼                      ▼             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              MCP Client (video-editor tools)              │  │
│  └──────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────────┘
                              │ MCP over stdio/SSE
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                MCP Server (sulla-video-editor)                  │
│  Exposes tools: create_project, import_media, transcribe,       │
│  clean_fillers, trim_silence, add_captions, generate_clips,     │
│  apply_template, export_video, list_projects, get_transcript    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    API (Cloudflare Workers)                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ Auth     │  │ Projects │  │ Orgs      │  │ Job Dispatch  │  │
│  └──────────┘  └──────────┘  └───────────┘  └───────┬───────┘  │
│                                                      │          │
│  ┌──────────────────────┐  ┌─────────────────────┐  │          │
│  │ D1 (SQLite)          │  │ R2 (Media Storage)  │  │          │
│  │ users, orgs, projects│  │ video, audio, JSON  │  │          │
│  └──────────────────────┘  └─────────────────────┘  │          │
└──────────────────────────────────────────────────────┼──────────┘
                                                       │
                           Cloudflare Queues / webhook  │
                                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Serverless Workers (GPU/CPU)                   │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │ Transcribe    │  │ AI Analysis   │  │ FFmpeg Render     │   │
│  │ (Whisper)     │  │ (Claude API)  │  │ (video export)    │   │
│  ├───────────────┤  ├───────────────┤  ├───────────────────┤   │
│  │ Input: audio  │  │ Input: transc │  │ Input: EDL + media│   │
│  │ Output: JSON  │  │ Output: edits │  │ Output: mp4/clips │   │
│  │ → R2 + D1     │  │ → D1          │  │ → R2              │   │
│  └───────────────┘  └───────────────┘  └───────────────────┘   │
│  ┌───────────────┐  ┌───────────────┐                          │
│  │ Clip Gen      │  │ Audio Enhance │                          │
│  │ (auto-clip)   │  │ (studio sound)│                          │
│  └───────────────┘  └───────────────┘                          │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    Dashboard (Cloudflare Pages)                   │
│  React SPA — talks to API via fetch                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Welcome  │ │ New Proj │ │ Editor   │ │ Templates         │  │
│  │ (list)   │ │ (import) │ │ (edit)   │ │ (scene composer)  │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: End to End

### 1. Create Project (from Dashboard or Sulla Desktop)

**Dashboard flow:**
```
User drops file → browser uploads to R2 (presigned URL) → API creates project record in D1
→ dispatches "transcribe" job to queue → worker picks up job
→ downloads media from R2 → runs Whisper → uploads transcript JSON to R2
→ updates project status in D1 → dashboard polls or gets WebSocket push
→ transcript appears in editor
```

**Sulla Desktop flow (via MCP):**
```
User says "edit my recording from today"
→ Sulla agent calls MCP tool: create_project(name, media_path)
→ MCP server uploads local file to R2 via API presigned URL
→ API creates project + dispatches transcribe job
→ MCP server polls until transcript ready
→ Returns transcript summary to Sulla agent
→ Sulla agent calls: clean_fillers(project_id) → trim_silence(project_id)
→ Sulla agent calls: export_video(project_id, format="youtube")
→ Worker renders → video URL returned to agent
→ Agent: "Your video is ready. Saved 2:24 of dead air, removed 23 fillers."
```

### 2. Edit via Transcript (Dashboard)

```
User selects words → presses Delete
→ Frontend updates local EDL (edit decision list)
→ PUT /api/projects/:id/edl with updated EDL
→ EDL stored in D1
→ Preview plays back with cuts applied (client-side skip)
→ On export: EDL sent to FFmpeg worker → worker reads source from R2 + applies EDL → output to R2
```

### 3. AI-Driven Editing (Sulla Agent via MCP)

```
Agent calls: analyze_content(project_id)
→ API sends transcript to Claude API
→ Claude returns: filler positions, silence regions, hook score, clip candidates, pacing issues
→ Stored as "suggestions" on the project in D1
→ Dashboard shows suggestions in right panel
→ User approves → frontend applies to EDL → export
```

### 4. Template Application

```
User picks "Podcast" template for a project
→ Template defines: scene sequence, transition types, caption style, lower third config, intro/outro
→ API maps transcript scenes to template scenes
→ EDL generated from template + transcript
→ On export: FFmpeg worker composes video using scene definitions
  - PiP camera overlay at specified position/size
  - Lower third with speaker name
  - Animated captions in chosen style
  - Intro/outro title cards
  - Transitions between scenes
```

---

## MCP Server — Tool Definitions

The MCP server is the bridge between Sulla Desktop's AI agent and the video editor API. It runs as a local process that Sulla Desktop connects to.

### Project Tools
```
create_project(name, template?) → project_id
import_media(project_id, file_path) → upload status
list_projects(org_id?) → project[]
get_project(project_id) → project details + status
delete_project(project_id) → confirmation
```

### Transcription Tools
```
transcribe(project_id) → job_id (async)
get_transcript(project_id) → word-level transcript JSON
get_transcript_text(project_id) → plain text version
```

### Editing Tools
```
clean_fillers(project_id, words?) → removed count
trim_silence(project_id, threshold_ms?) → trimmed duration
apply_hook_fix(project_id) → new start point
cut_range(project_id, start_ms, end_ms) → confirmation
reorder_segments(project_id, segment_order[]) → confirmation
get_edl(project_id) → current edit decision list
```

### AI Analysis Tools
```
analyze_content(project_id) → suggestions (fillers, silence, hooks, clips, pacing)
suggest_clips(project_id, count?) → clip candidates with virality scores
suggest_broll(project_id, moments[]) → b-roll placement suggestions
generate_seo(project_id) → title, description, tags, chapters
```

### Composition Tools
```
apply_template(project_id, template_id) → scene composition
set_scene_layout(project_id, scene_idx, layout) → confirmation
set_caption_style(project_id, style) → confirmation
add_lower_third(project_id, speaker, title) → confirmation
list_templates(org_id?) → template[]
```

### Export Tools
```
export_video(project_id, format?, resolution?, preset?) → job_id (async)
export_clips(project_id, clip_ids[], formats[]) → job_id (async)
get_export_status(job_id) → progress + download URL
```

### Audio Tools
```
apply_studio_sound(project_id) → confirmation
normalize_audio(project_id, target_lufs?) → confirmation
```

---

## React Composition System (Remotion-style)

Templates use a React-based composition system for defining how scenes look. This runs in the **FFmpeg render worker**, not in the browser.

### How it works:

1. **Template** = a JSON config that defines scene sequence + visual properties
2. **Scene** = a React component that renders a single frame given props + current time
3. **Worker** takes template + source media + EDL → renders each frame → encodes to video

### Scene component pattern:
```tsx
// This runs in the render worker, NOT in the browser
interface PiPSceneProps {
  mainVideo: string       // R2 URL
  cameraVideo: string     // R2 URL
  pipPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  pipSize: number         // px
  pipShape: 'circle' | 'rounded' | 'square'
  pipBorderColor: string
  lowerThird?: { name: string; title: string; accentColor: string }
  caption?: { text: string; highlightWord: string; style: CaptionStyle }
}

function PiPScene({ mainVideo, cameraVideo, pipPosition, ... }: PiPSceneProps) {
  // Returns JSX that represents one frame of the composition
  // The render worker captures this as an image and feeds to FFmpeg
}
```

### Available scene types:
- **TitleCard** — text + subtitle + accent bar on background
- **FullFrame** — single video source, full screen
- **PiP** — main video + camera bubble overlay
- **SideBySide** — two sources split horizontally
- **BRoll** — cutaway footage over continuous audio
- **CaptionFocus** — large animated caption as the visual focus
- **LowerThird** — speaker identification overlay
- **EndCard** — CTA + subscribe + links

### Template JSON format:
```json
{
  "id": "podcast-v1",
  "name": "Podcast Episode",
  "theme": {
    "accentColor": "#5096b3",
    "background": "dark",
    "fontFamily": "Inter",
    "captionStyle": "bold"
  },
  "scenes": [
    { "type": "TitleCard", "duration": 4, "transitionIn": "fade", "transitionOut": "crossfade" },
    { "type": "FullFrame", "transitionIn": "crossfade" },
    { "type": "PiP", "pipPosition": "bottom-right", "pipSize": 120, "pipShape": "circle" },
    { "type": "BRoll", "transitionIn": "cut", "transitionOut": "cut" },
    { "type": "PiP" },
    { "type": "CaptionFocus" },
    { "type": "TitleCard", "duration": 6, "transitionIn": "crossfade", "transitionOut": "fade" }
  ],
  "rules": {
    "removeFillers": true,
    "trimSilence": { "enabled": true, "thresholdMs": 1500 },
    "studioSound": true,
    "normalize": { "enabled": true, "targetLufs": -14 },
    "autoCaptions": true,
    "autoClips": false
  },
  "export": {
    "defaultFormat": "16:9",
    "defaultResolution": "1080p",
    "defaultCodec": "h264"
  }
}
```

---

## Render Pipeline

The render worker is where React composition meets FFmpeg:

```
1. Worker receives job: { project_id, template_id }
2. Downloads from R2: source media files, transcript JSON, EDL
3. Loads template config from D1
4. Maps transcript segments to template scenes
5. For each scene:
   a. Resolves the React scene component + props
   b. Renders frame-by-frame (headless React → canvas → PNG)
   c. Pipes frames to FFmpeg as input
6. FFmpeg composites: video frames + audio tracks + transitions
7. Output MP4 uploaded to R2
8. Project status updated in D1
9. Dashboard notified via WebSocket or poll
```

For the MVP, we skip React frame rendering and use FFmpeg filter chains directly:
- PiP = `overlay` filter
- Lower third = `drawtext` filter
- Captions = `ass` subtitle filter
- Title cards = pre-rendered PNG overlaid at start/end
- Transitions = `xfade` filter

React composition rendering (like Remotion) is Phase 2 — it unlocks custom animations and complex layouts but requires a headless browser in the render worker.

---

## Sulla Desktop ↔ Video Editor Communication

### MCP Server Setup

The video editor MCP server is a Node.js process that Sulla Desktop spawns or connects to:

```json
// sulla-desktop MCP config
{
  "mcpServers": {
    "video-editor": {
      "command": "npx",
      "args": ["sulla-video-mcp"],
      "env": {
        "SULLA_VIDEO_API_URL": "https://api.sulla.video",
        "SULLA_VIDEO_API_KEY": "user-api-key"
      }
    }
  }
}
```

### How Sulla uses it:

```
User: "Take my recording from the capture studio and make a YouTube video"

Sulla agent:
  1. Finds the latest capture session (local files from audio driver + screen recording)
  2. Calls video-editor.create_project(name: "capture-session-april-4")
  3. Calls video-editor.import_media(project_id, file_path: "/path/to/screen.mp4")
  4. Calls video-editor.import_media(project_id, file_path: "/path/to/webcam.mp4")
  5. Calls video-editor.import_media(project_id, file_path: "/path/to/mic.wav")
  6. Calls video-editor.transcribe(project_id) → waits for completion
  7. Calls video-editor.analyze_content(project_id) → gets suggestions
  8. Calls video-editor.clean_fillers(project_id)
  9. Calls video-editor.trim_silence(project_id)
  10. Calls video-editor.apply_template(project_id, template: "youtube")
  11. Calls video-editor.apply_studio_sound(project_id)
  12. Calls video-editor.export_video(project_id, format: "16:9", resolution: "1080p")
  13. Calls video-editor.export_clips(project_id, formats: ["9:16", "1:1"])
  14. Returns: "Your YouTube video is ready (10:23, saved 2:24). I also generated 7 social clips."
```

The user never opens the dashboard. Sulla handles the entire pipeline via MCP. But the dashboard is there when they want to manually review, adjust the transcript, tweak the template, or manage their organization.

---

## What Runs Where

| Component | Where it runs | What it does |
|-----------|---------------|--------------|
| Dashboard SPA | Cloudflare Pages (CDN) | User-facing web app |
| API | Cloudflare Workers (edge) | Auth, CRUD, job dispatch |
| Database | Cloudflare D1 (edge) | Users, orgs, projects, templates |
| Media Storage | Cloudflare R2 (global) | Source media, transcripts, exports |
| Job Queue | Cloudflare Queues | Dispatches work to render workers |
| Transcribe Worker | Modal (GPU) | Whisper STT → word-level JSON |
| AI Analysis Worker | Cloudflare Worker | Claude API calls for content analysis |
| Render Worker | Modal/Fly.io (CPU/GPU) | FFmpeg composition + export |
| Audio Enhance Worker | Modal (GPU) | Noise reduction, normalization |
| MCP Server | Local (Sulla Desktop spawns) | Bridges agent ↔ API |
| Sulla Desktop | Local (Electron) | Capture, AI agent, MCP client |
