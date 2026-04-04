# Video Editing as Code

> A video project is a git repo. Sulla writes the code. CI renders the video.

---

## The Core Idea

Instead of a traditional video editor where state lives in a database and exports are triggered via API calls, a Sulla video project is a **code repository** — just like a Remotion project.

```
my-video-project/
├── src/
│   ├── Root.tsx              ← composition entry point
│   ├── scenes/
│   │   ├── Intro.tsx         ← title card component
│   │   ├── MainContent.tsx   ← PiP scene component
│   │   ├── BRoll.tsx         ← cutaway component
│   │   └── Outro.tsx         ← CTA + end card
│   └── components/
│       ├── LowerThird.tsx    ← speaker name overlay
│       ├── CaptionOverlay.tsx ← animated captions
│       └── PiPBubble.tsx     ← camera bubble
├── media/
│   ├── screen.mp4            ← or R2 URL reference
│   ├── webcam.mp4
│   └── mic.wav
├── data/
│   ├── transcript.json       ← word-level timestamps
│   ├── edl.json              ← edit decision list (cuts, reorders)
│   ├── suggestions.json      ← Sulla's analysis results
│   └── clips.json            ← auto-detected clip boundaries
├── template.json             ← scene sequence + theme + rules
├── package.json
├── tsconfig.json
└── sulla.config.ts           ← project config (output formats, presets)
```

---

## How It Works

### 1. Create a project

Sulla (via Claude Code / Codemode MCP) scaffolds the repo:

```
User: "Create a video project from my capture session"

Sulla:
  → mkdir my-video-project && cd my-video-project
  → scaffolds package.json, tsconfig, Root.tsx
  → copies media files from capture session into media/
  → runs whisper on mic.wav → writes data/transcript.json
  → analyzes transcript → writes data/suggestions.json
  → generates data/edl.json with filler/silence cuts applied
  → creates scene components based on template
  → git init && git add . && git commit -m "Initial project from capture session"
  → git push origin main
```

### 2. Edit the video

Editing = modifying code and data files. Sulla does this through Codemode MCP:

```
User: "Remove all the filler words and tighten the pauses"

Sulla:
  → reads data/transcript.json
  → identifies filler words and long pauses
  → updates data/edl.json with cut regions
  → git commit -m "Remove 23 fillers, trim 8 pauses (saved 2:24)"
```

```
User: "Change the intro title to 'Building the Future'"

Sulla:
  → edits src/scenes/Intro.tsx → changes title prop
  → git commit -m "Update intro title"
```

```
User: "Make the PiP camera bigger and move it to top-left"

Sulla:
  → edits template.json → changes pipSize: 160, pipPosition: "top-left"
  → or edits src/scenes/MainContent.tsx directly
  → git commit -m "Resize PiP to 160px, move to top-left"
```

```
User: "Add captions in the highlight style"

Sulla:
  → updates template.json → captionStyle: "highlight"
  → generates caption segments from transcript + edl
  → writes to data/captions.json
  → git commit -m "Add highlight-style captions"
```

### 3. Preview

Two options:

**Local preview (Sulla Desktop):**
```
cd my-video-project
npm run preview  ← opens browser with composition preview (like Remotion Studio)
```

**Dashboard preview:**
The SaaS dashboard can render a live preview by reading the repo's data files (transcript, EDL, template) and displaying them in the transcript editor UI. No video rendering needed — just text + timeline visualization.

### 4. Render

**Local render:**
```
npm run render  ← FFmpeg composes video locally
```

**CI render (GitHub Actions):**
```yaml
# .github/workflows/render.yml
on:
  push:
    branches: [main]
    paths: ['data/**', 'src/**', 'template.json']

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: sulla/video-render-action@v1
        with:
          output: dist/
          formats: '16:9,9:16,1:1'
      - uses: actions/upload-artifact@v4
        with:
          name: rendered-video
          path: dist/
```

**Cloud render (API):**
```
POST /api/render
{ "repo": "user/my-video-project", "branch": "main", "formats": ["16:9", "9:16"] }
→ Worker clones repo → reads config → renders → uploads to R2
```

### 5. Iterate

Every edit is a git commit. You can:
- `git log` to see edit history
- `git diff` to see what changed between versions
- `git revert` to undo an edit
- Branch for A/B testing different edits
- PR review for collaborative editing

---

## Three Ways to Create/Edit

### A. Sulla Desktop + Codemode MCP (primary)

Sulla's AI agent uses Codemode MCP to read/write project files directly. This is the same tool that Claude Code uses to edit any codebase — but here it's editing a video project.

```
"Take my recording and make it a podcast episode"
→ Sulla scaffolds project, writes transcript, applies podcast template, commits

"The intro is too long, cut the first 10 seconds"
→ Sulla updates edl.json, commits

"Export for YouTube and make me 5 TikTok clips"
→ Sulla updates sulla.config.ts with export settings, pushes → CI renders
```

No custom MCP server needed. Sulla uses the standard code editing tools (Read, Write, Edit, Bash) to manipulate the project repo. The video project IS the codebase.

### B. Dashboard (SaaS web app)

The dashboard reads project repos and provides a visual interface:
- Transcript editor (text selection, filler highlighting, cut/reorder)
- Template/scene composer (drag elements on canvas)
- Export settings

When the user makes changes in the dashboard, it writes to the project files and commits:
```
User clicks "Remove all fillers" in dashboard
→ Dashboard updates data/edl.json
→ POST /api/projects/:id/commit { message: "Remove 23 fillers", files: { "data/edl.json": ... } }
→ API commits to the project's git repo
```

### C. Manually (developer)

Since it's a code repo, any developer can:
```bash
git clone git@github.com:user/my-video-project.git
cd my-video-project
# edit src/scenes/Intro.tsx, change colors, add custom animations
# edit data/edl.json, manually adjust cut points
npm run preview  # see changes live
git push  # triggers CI render
```

---

## Project File Formats

### transcript.json
```json
{
  "speakers": [
    { "id": "s1", "name": "Jonathon", "color": "#3a7f9e" }
  ],
  "words": [
    { "word": "Welcome", "start": 0.0, "end": 0.42, "speaker": "s1", "confidence": 0.98 },
    { "word": "everyone", "start": 0.45, "end": 0.91, "speaker": "s1", "confidence": 0.97 },
    { "word": "um", "start": 1.2, "end": 1.4, "speaker": "s1", "confidence": 0.95, "filler": true }
  ],
  "duration_ms": 767000
}
```

### edl.json (Edit Decision List)
```json
{
  "version": 1,
  "cuts": [
    { "type": "remove", "start_ms": 1200, "end_ms": 1400, "reason": "filler:um" },
    { "type": "remove", "start_ms": 5600, "end_ms": 7900, "reason": "silence:2.3s" },
    { "type": "remove", "start_ms": 0, "end_ms": 14000, "reason": "hook:weak_opening" }
  ],
  "reorder": [],
  "inserts": [
    { "type": "title_card", "at_ms": 0, "duration_ms": 4000, "scene": "Intro" }
  ]
}
```

### template.json
```json
{
  "name": "Podcast Episode",
  "theme": {
    "accentColor": "#5096b3",
    "background": "#0d1117",
    "fontFamily": "Inter",
    "captionStyle": "bold"
  },
  "scenes": [
    { "type": "TitleCard", "duration": 4, "transition": "fade" },
    { "type": "PiP", "pip": { "position": "bottom-right", "size": 120, "shape": "circle" } },
    { "type": "TitleCard", "duration": 6, "transition": "fade" }
  ],
  "rules": {
    "removeFillers": true,
    "trimSilence": { "enabled": true, "thresholdMs": 1500 },
    "studioSound": true,
    "normalize": { "targetLufs": -14 },
    "autoCaptions": true
  }
}
```

### sulla.config.ts
```typescript
export default {
  compositions: [
    {
      id: 'main',
      width: 1920,
      height: 1080,
      fps: 30,
    },
    {
      id: 'reel',
      width: 1080,
      height: 1920,
      fps: 30,
    },
    {
      id: 'square',
      width: 1080,
      height: 1080,
      fps: 30,
    },
  ],
  output: {
    dir: 'dist',
    codec: 'h264',
    quality: 'high',
  },
}
```

---

## Where Each Piece Lives

| What | Where | How |
|------|-------|-----|
| Project source | GitHub repo | Git — version controlled, branchable |
| Media files | R2 (referenced by URL in repo) | Large files don't go in git |
| Transcript | `data/transcript.json` in repo | Generated by Whisper worker |
| Edit decisions | `data/edl.json` in repo | Written by Sulla or dashboard |
| Scene components | `src/scenes/*.tsx` in repo | React components |
| Template config | `template.json` in repo | JSON config |
| Render output | R2 + GitHub Releases | FFmpeg output |
| Project metadata | D1 (dashboard) | Links user → repo → org |
| Auth/billing | D1 + Cloudflare Workers | SaaS layer |

---

## Why This Is Better

1. **Git = undo history for free.** Every edit is a commit. `git revert` undoes any change. `git log` shows exactly what happened.

2. **Sulla already knows how to edit code.** No custom MCP server needed. Codemode MCP + Claude Code tools work on video projects the same way they work on any codebase.

3. **Collaborative editing via PRs.** Team member can branch, make edits, open a PR. Review the diff of transcript changes, scene modifications, template tweaks.

4. **CI/CD for video.** Push to main → video renders automatically. Same workflow developers already know.

5. **Portable.** The project repo has everything needed to render the video. No vendor lock-in. You can render locally, in CI, or in the cloud.

6. **Templates are reusable code.** A template is a set of React components + a JSON config. Publish it as an npm package. Install it in any project. `npm install @sulla/template-podcast`.

7. **Extensible.** Developers can write custom scene components with any animation, effect, or layout. The template system is just React — no proprietary format.
