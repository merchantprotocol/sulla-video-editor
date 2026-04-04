# Sulla Video Editor — Roadmap

> Sulla-driven video editor that combines programmatic composition (like Remotion)
> with transcript-based editing (like Descript). You provide audio and video files,
> Sulla handles the editing decisions, and produces the final video.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Sulla Agent Layer                  │
│  (orchestrates editing decisions via Claude API)     │
├──────────┬──────────┬───────────┬───────────────────┤
│ Transcript│ Scene    │ Rule      │ Export            │
│ Engine   │ Composer │ Engine    │ Pipeline          │
├──────────┴──────────┴───────────┴───────────────────┤
│              Core Video Engine                       │
│  (FFmpeg + Web Audio API + HTML5 Video)              │
├─────────────────────────────────────────────────────┤
│              Media Store                             │
│  (local filesystem — audio, video, images, fonts)    │
└─────────────────────────────────────────────────────┘
```

**Tech Stack:**
- TypeScript / Node.js
- FFmpeg (via fluent-ffmpeg) for rendering and media processing
- Whisper (via API or whisper.cpp) for transcription
- Web Audio API for waveform analysis and audio processing
- React for preview UI (optional — Sulla can operate headless)
- Claude API for intelligent editing decisions

---

## Phase 1 — Media Ingestion & Transcription

**Goal:** Accept audio/video files, extract metadata, generate word-level transcripts.

### 1.1 Media Import
- Accept video files (mp4, mov, webm) and audio files (wav, mp3, aac, m4a)
- Extract metadata: duration, resolution, fps, codec, audio channels
- Generate thumbnails at configurable intervals
- Store media references in a project manifest (JSON)

### 1.2 Audio Extraction
- Separate audio tracks from video using FFmpeg
- Support multi-track audio (separate speaker tracks if provided)
- Generate waveform data for visualization and analysis

### 1.3 Transcription Engine
- Integrate Whisper (whisper.cpp for local, OpenAI Whisper API for cloud)
- Produce word-level timestamps with confidence scores
- Speaker diarization — identify and label different speakers
- Output format: structured JSON with word, start, end, confidence, speaker

### 1.4 Project File Format
- Define `.sulla-project` JSON format:
  - Media references (paths, metadata)
  - Transcript data
  - Edit decision list (EDL)
  - Scene definitions
  - Export settings
- All edits are non-destructive — original media is never modified

**Deliverables:**
- `src/core/media-import.ts` — file ingestion and metadata extraction
- `src/core/audio-extract.ts` — audio separation via FFmpeg
- `src/core/transcribe.ts` — Whisper integration with word-level output
- `src/core/project.ts` — project file read/write
- CLI: `sulla-video import <file>` → creates project with transcript

---

## Phase 2 — Edit Decision List & Transcript Editing

**Goal:** Represent all edits as an EDL that maps transcript regions to timeline segments.

### 2.1 Edit Decision List (EDL)
- Data structure that defines what parts of the source media appear in the output
- Each entry: source file, in-point, out-point, timeline position, track
- Supports: cuts, trims, reorder, gaps (silence/black), crossfades
- All operations are reversible (undo/redo stack)

### 2.2 Transcript-Based Editing
- Map transcript words → media timestamps
- Delete words from transcript → corresponding media segment is cut
- Reorder sentences → media segments reorder on timeline
- Mark regions as "keep" or "remove"
- Paragraph breaks in transcript = scene boundaries

### 2.3 Filler Word Detection & Removal
- Detect filler words: "um", "uh", "like", "you know", "so", "actually", "basically"
- Detect repeated words and false starts
- Detect long pauses (configurable threshold, default >1.5s)
- One-command removal: `sulla-video clean-fillers`
- Sulla reviews and confirms removals (no blind deletion)

### 2.4 Silence & Dead Air Handling
- Detect silence regions below dB threshold
- Configurable: remove, shorten, or keep silence
- Smart gap: leave small pauses for natural pacing (configurable min gap)

**Deliverables:**
- `src/core/edl.ts` — edit decision list data structure and operations
- `src/core/transcript-edit.ts` — transcript-to-EDL mapping
- `src/core/filler-detection.ts` — filler word and pause detection
- `src/core/silence-detection.ts` — silence analysis via waveform data
- CLI: `sulla-video clean <project>` → apply filler/silence removal

---

## Phase 3 — Scene Composition

**Goal:** Composable scene system for building video layouts programmatically (the Remotion-like part).

### 3.1 Scene Types
Define a library of composable scene templates:

- **FullFrame** — single video source, full screen
- **PictureInPicture** — main video + corner overlay (configurable position/size)
- **SideBySide** — two sources split horizontally or vertically
- **ContentCard** — text/graphic overlay on background
- **BRoll** — cutaway footage over continuous audio
- **TitleCard** — animated text with background (intro/outro/section headers)
- **LowerThird** — speaker name/title overlay
- **CaptionOverlay** — burned-in captions (word-by-word highlight style)

### 3.2 Scene Definition Format
```typescript
interface Scene {
  id: string;
  type: SceneType;
  startFrame: number;
  durationFrames: number;
  layers: Layer[];        // video, audio, text, graphics
  transitions: {
    in?: Transition;      // fade, cut, wipe, dissolve
    out?: Transition;
  };
  props: Record<string, any>;  // scene-type-specific config
}
```

### 3.3 Layer System
- Video layers: source file + crop/position/scale/opacity
- Audio layers: source file + volume/pan/fade
- Text layers: content + font/size/color/position/animation
- Graphics layers: images, shapes, branded elements
- Z-ordering and compositing

### 3.4 Transitions
- Cut (default)
- Crossfade / dissolve
- Fade to/from black
- Wipe (directional)
- Custom transition support via easing functions

### 3.5 Theme System
- Reuse design tokens: colors, fonts, spacing, effects
- Port the Merchant Protocol noir theme as a built-in theme
- Themes apply to all text, graphics, and overlay elements
- Custom themes via JSON config

**Deliverables:**
- `src/scenes/` — scene type implementations
- `src/core/layers.ts` — layer composition engine
- `src/core/transitions.ts` — transition library
- `src/themes/` — theme definitions (default + merchant-protocol)
- `src/core/timeline.ts` — scene sequencing and timeline assembly

---

## Phase 4 — Sulla Agent Integration (Rule-Based Editing)

**Goal:** Sulla analyzes content and makes intelligent editing decisions automatically.

### 4.1 Sulla Editing Rules
Sulla connects via Claude API to analyze transcript + media and apply rules:

- **Content analysis** — identify key points, tangents, repetitions
- **Pacing** — detect sections that drag, suggest tightening
- **Structure** — suggest intro/body/outro segmentation
- **B-roll placement** — identify moments where cutaway footage fits
- **Caption timing** — generate caption segments synced to speech
- **Music/SFX cues** — suggest where background music or effects enhance the video

### 4.2 Editing Workflow
```
1. Import media → auto-transcribe
2. Sulla reads transcript, analyzes content
3. Sulla generates an edit plan (proposed EDL + scene composition)
4. User reviews plan (approve / modify / reject per-section)
5. Sulla applies approved edits
6. User can manually adjust via transcript editing
7. Export final video
```

### 4.3 Rule Templates
Pre-built rule sets for common formats:

- **Podcast Episode** — clean fillers, normalize audio, add intro/outro, chapter markers
- **YouTube Video** — hook optimization, B-roll suggestions, caption overlay, end card
- **Social Clip** — extract highlight, reformat aspect ratio, add captions, CTA
- **Tutorial** — section headers, code/screen callouts, pacing for learning
- **Interview** — speaker labels, split-screen, question/answer segmentation

### 4.4 Sulla Command Interface
```bash
sulla-video edit <project> --rules podcast
sulla-video edit <project> --rules youtube --style merchant-protocol
sulla-video suggest <project>          # Sulla proposes edits, doesn't apply
sulla-video apply <project> <plan-id>  # Apply a previously generated plan
```

### 4.5 Iterative Refinement
- Sulla can watch for user corrections and learn preferences per-project
- "More of this / less of this" feedback loop
- Save editing preferences as custom rule sets

**Deliverables:**
- `src/agent/sulla-editor.ts` — Claude API integration for edit analysis
- `src/agent/rules/` — rule template definitions
- `src/agent/planner.ts` — edit plan generation and approval workflow
- `src/agent/feedback.ts` — preference learning from user corrections

---

## Phase 5 — Render & Export Pipeline

**Goal:** Produce final video files from the EDL and scene composition.

### 5.1 FFmpeg Render Engine
- Assemble final video from EDL + scene definitions
- Apply all cuts, transitions, overlays, and effects
- Support rendering segments in parallel for speed
- Progress reporting during render

### 5.2 Output Formats
- **Full HD** — 1920x1080, 30/60fps
- **4K** — 3840x2160
- **Square** — 1080x1080 (Instagram)
- **Vertical** — 1080x1920 (Reels/TikTok/Shorts)
- **Audio only** — mp3/wav export of edited audio
- Custom resolution and aspect ratio

### 5.3 Export Presets
- YouTube (h264, high bitrate, 1080p/4K)
- Social media (optimized file size, platform constraints)
- Podcast (audio-only, normalized loudness)
- Archive (lossless/ProRes for master copies)

### 5.4 Caption Rendering
- Burn-in captions with configurable styles
- Word-by-word highlight animation (the Descript/social media style)
- Position: bottom, top, center
- Background: box, shadow, none
- Font, size, color from theme

### 5.5 Batch Export
- Export multiple formats from one project in a single command
- `sulla-video export <project> --presets youtube,instagram-reel,podcast`

**Deliverables:**
- `src/render/ffmpeg-renderer.ts` — FFmpeg command builder and executor
- `src/render/caption-renderer.ts` — caption overlay generation
- `src/render/presets.ts` — export preset definitions
- `src/render/batch.ts` — multi-format batch export
- CLI: `sulla-video export <project> [--preset] [--format]`

---

## Phase 6 — Audio Enhancement

**Goal:** AI-powered audio processing to improve recording quality.

### 6.1 Noise Reduction
- Background noise profiling and removal
- Hum/buzz elimination (50/60Hz and harmonics)
- De-essing (reduce harsh sibilance)

### 6.2 Loudness Normalization
- LUFS-based loudness normalization (target: -14 LUFS for YouTube, -16 for podcasts)
- Per-speaker volume leveling
- Dynamic range compression for consistency

### 6.3 Studio Sound Effect
- EQ enhancement for voice clarity
- Room reverb reduction
- Microphone proximity effect correction
- Make laptop mic audio sound professional

### 6.4 Implementation
- FFmpeg audio filters for basic processing
- RNNoise or similar ML model for advanced noise reduction
- All processing is non-destructive (applied at export time)

**Deliverables:**
- `src/audio/noise-reduction.ts` — noise profiling and removal
- `src/audio/normalize.ts` — loudness normalization
- `src/audio/enhance.ts` — voice enhancement pipeline
- `src/audio/filters.ts` — FFmpeg audio filter chain builder

---

## Phase 7 — Preview UI (Optional)

**Goal:** Browser-based preview for reviewing edits before export.

> Note: Sulla can operate fully headless via CLI. The preview UI is for
> visual review when needed, not a full NLE (non-linear editor).

### 7.1 Transcript View
- Display transcript with word-level highlighting during playback
- Click-to-seek on any word
- Visual markers for cuts, fillers, scene boundaries
- Strikethrough for removed sections

### 7.2 Timeline View
- Simplified timeline showing scenes, cuts, and transitions
- Waveform display for audio tracks
- Thumbnail strip for video track

### 7.3 Video Preview
- HTML5 video playback of source media
- Preview edits without full render (approximate using skip/seek)
- Side-by-side: original vs. edited

### 7.4 Implementation
- React + Vite dev server
- Launches via `sulla-video preview <project>`
- Opens in browser, communicates with backend via WebSocket

**Deliverables:**
- `src/ui/` — React preview application
- `src/ui/TranscriptView.tsx` — interactive transcript
- `src/ui/TimelineView.tsx` — visual timeline
- `src/ui/VideoPreview.tsx` — playback component
- `src/server/preview-server.ts` — local preview server

---

## Phase 8 — Advanced Features (Future)

These are stretch goals for after the core is solid.

### 8.1 Voice Cloning / Overdub
- Clone speaker voice from existing audio
- Generate new speech from typed text
- Use for fixing flubs or adding pickup lines without re-recording

### 8.2 Eye Contact Correction
- AI model to adjust eye gaze toward camera
- Useful for screen recordings where speaker reads from notes

### 8.3 Auto B-Roll
- Sulla analyzes transcript topics
- Searches provided B-roll library for relevant footage
- Automatically inserts cutaways at appropriate moments

### 8.4 Multi-Project Templates
- Save a full editing workflow as a reusable template
- Apply the same edit style across a video series
- "Edit this week's episode like last week's"

### 8.5 Live Collaboration
- Multiple Sulla agents working on different sections
- Merge edit plans from parallel agents

---

## Project Structure

```
sulla-video-editor/
├── docs/
│   ├── roadmap.md              # This file
│   ├── architecture.md         # Detailed technical architecture
│   └── project-format.md       # .sulla-project file spec
├── src/
│   ├── core/                   # Media import, transcript, EDL, project
│   ├── scenes/                 # Scene type implementations
│   ├── themes/                 # Visual theme definitions
│   ├── agent/                  # Sulla/Claude API integration
│   ├── render/                 # FFmpeg export pipeline
│   ├── audio/                  # Audio processing and enhancement
│   ├── ui/                     # Optional preview UI
│   ├── server/                 # Preview server
│   └── cli/                    # CLI entry points
├── templates/                  # Rule templates (podcast, youtube, etc.)
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## Implementation Priority

| Priority | Phase | What It Unlocks |
|----------|-------|-----------------|
| P0       | Phase 1 — Media + Transcription | Foundation — nothing works without this |
| P0       | Phase 2 — EDL + Transcript Editing | Core editing capability |
| P1       | Phase 3 — Scene Composition | Visual layouts and overlays |
| P1       | Phase 5 — Render Pipeline | Actual video output |
| P1       | Phase 4 — Sulla Agent | Automated editing (the differentiator) |
| P2       | Phase 6 — Audio Enhancement | Production quality audio |
| P2       | Phase 7 — Preview UI | Visual review workflow |
| P3       | Phase 8 — Advanced Features | Competitive features |

---

## Milestones

### M1 — "Sulla can cut a video" (Phases 1 + 2 + 5)
Import a video, transcribe it, remove fillers and dead air, export a cleaned-up version.
This is the MVP — a usable tool from day one.

### M2 — "Sulla can compose a video" (Phase 3)
Add scene composition: titles, lower thirds, captions, B-roll inserts, PiP.
Videos start looking produced, not just trimmed.

### M3 — "Sulla can edit for me" (Phase 4)
Sulla analyzes content and proposes a full edit. You review and approve.
This is the Descript-meets-AI moment.

### M4 — "Sulla can produce a video" (Phases 6 + 7)
Audio enhancement, preview UI, batch export.
End-to-end production pipeline — hand Sulla raw footage, get a finished video.
