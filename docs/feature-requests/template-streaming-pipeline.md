# Feature Request: Template Streaming Pipeline

**Status:** Proposed  
**Priority:** High  
**Category:** Core Pipeline  

## Summary

Apply a template in the editor, feed raw audio/video into it, and get a properly formatted video out the other side — with minimal manual intervention. The template defines the entire look, feel, and processing rules; the user just provides the raw media.

## Problem

Today, producing a finished video requires multiple manual steps in the editor:

1. Import media
2. Transcribe
3. Edit transcript / make cuts
4. Apply audio processing (normalize, studio sound)
5. Configure layout (PiP, captions, overlays)
6. Choose export format and render

Each step is disconnected. A user who records a podcast episode must manually walk through every stage even though the workflow is identical every time. Templates exist but only pre-fill settings — they don't drive an automated pipeline.

## Proposed Solution

### One-Shot Pipeline: "Apply Template & Render"

A single operation that chains all existing services into an automated pipeline driven by the template configuration.

```
Raw Media → Template Selection → Auto Pipeline → Finished Video
```

### Pipeline Stages

```
┌─────────────┐
│  1. INGEST   │  Import media, extract metadata (ffprobe),
│              │  generate thumbnails, extract waveform
└──────┬───────┘
       │
┌──────▼───────┐
│ 2. TRANSCRIBE │  Run speech-to-text on extracted audio
│               │  (16kHz mono WAV → Whisper)
└──────┬────────┘
       │
┌──────▼───────────┐
│ 3. APPLY RULES    │  Template `rules` drive automated edits:
│                   │  - removeFillers → cut filler words from EDL
│                   │  - trimSilence → detect & cut dead air
│                   │  - studioSound → audio enhancement filters
│                   │  - normalize → loudnorm to -14 LUFS
│                   │  - autoCaptions → generate caption track
│                   │  - autoClips → extract social clips
└──────┬────────────┘
       │
┌──────▼───────────┐
│ 4. BUILD SCENES   │  Template `scenes` define the composition:
│                   │  - Scene types (intro, body, outro)
│                   │  - PiP position, size, shape
│                   │  - Transitions (fade, crossfade)
│                   │  - Layer layout (video, text, shapes, captions)
└──────┬────────────┘
       │
┌──────▼───────────┐
│ 5. RENDER         │  FFmpeg render with SSE progress streaming
│                   │  - Apply EDL cuts with micro-fades
│                   │  - Burn-in captions (drawtext)
│                   │  - Apply scene transitions
│                   │  - Export per template format/resolution/codec
└──────┬────────────┘
       │
┌──────▼───────────┐
│ 6. OUTPUT         │  Finished video(s) in configured formats
│                   │  (16:9, 9:16, 1:1, etc.)
└───────────────────┘
```

### Live Preview During Capture

While recording (or after import, before render), the user should see a real-time preview of how their content will look inside the selected template:

- Use the existing `LayoutRenderer` React composition to render a preview in the browser
- Template scenes, PiP layout, caption style, and overlays are visible in real time
- The native `<video>` element feeds into the composition preview
- This is a **preview only** — the final render is still a batch FFmpeg job

### API Design

#### New Endpoint

```
POST /api/projects/:id/pipeline
```

**Request Body:**
```json
{
  "templateId": "podcast",
  "overrides": {
    "export": { "defaultResolution": "1080p" },
    "rules": { "autoCaptions": false }
  },
  "streamProgress": true
}
```

**Response:** SSE stream (reuses existing render SSE infrastructure)

```
data: {"stage": "ingest", "progress": 100}
data: {"stage": "transcribe", "progress": 45}
data: {"stage": "rules", "progress": 80}
data: {"stage": "scenes", "progress": 100}
data: {"stage": "render", "progress": 33}
data: {"type": "done", "exports": ["16x9-1080p.mp4"]}
```

#### New Service

```
src/services/pipeline.service.js
```

Orchestrates the existing services in sequence:

```javascript
async function runPipeline(projectId, templateSlug, overrides, emitter) {
  const template = await templateService.resolve(templateSlug, overrides);
  const project = await projectService.get(projectId);

  // Stage 1: Ingest (already done if media is imported)
  emitter.emit('progress', { stage: 'ingest', progress: 100 });

  // Stage 2: Transcribe
  await transcribeService.transcribe(project);
  emitter.emit('progress', { stage: 'transcribe', progress: 100 });

  // Stage 3: Apply rules
  await applyRules(project, template.rules);
  emitter.emit('progress', { stage: 'rules', progress: 100 });

  // Stage 4: Build scenes
  const composition = await buildScenes(project, template.scenes, template.theme);
  emitter.emit('progress', { stage: 'scenes', progress: 100 });

  // Stage 5: Render
  const result = await renderService.renderComposed(project, composition, template.export, emitter);
  emitter.emit('done', result);
}
```

### Frontend Integration

#### Template Selection Panel

Add a "Quick Render" flow to the editor:

1. User imports media (or finishes capture)
2. Template picker appears — shows available templates with previews
3. User selects template, optionally tweaks overrides
4. "Apply & Render" button triggers the pipeline
5. SSE progress UI shows stage-by-stage progress (reuses ExportPanel progress bar pattern)

#### Preview Mode

When a template is selected (before rendering):

- Editor switches to a preview layout matching the template's scene structure
- LayoutRenderer shows the composition with the user's media embedded
- User can scrub through the timeline to preview how it will look
- Adjustments made in preview update the template overrides

## Existing Infrastructure to Reuse

| Component | Location | Role in Pipeline |
|-----------|----------|-----------------|
| Media import & metadata | `project.service.js` | Stage 1 |
| Transcription | `transcribe.js` | Stage 2 |
| Audio processing | `audio.service.js` | Stage 3 |
| EDL generation | `render.service.js` | Stage 3 |
| Caption generation | `caption.service.js` | Stage 3 |
| Scene composition | `compose.service.js` | Stage 4 |
| Layout rendering | `compositions/layout-renderer/` | Stage 4 (preview) |
| FFmpeg render + SSE | `render.service.js` | Stage 5 |
| Template definitions | `templates/system/` | Pipeline config |
| SSE progress UI | `ExportPanel.tsx` | Frontend progress |

## New Code Required

| Component | Description |
|-----------|-------------|
| `pipeline.service.js` | Orchestrator that chains existing services |
| `pipeline.controller.js` | Express route handler for `/api/projects/:id/pipeline` |
| `applyRules()` | Maps template rules to service calls (some logic exists, needs consolidation) |
| `buildScenes()` | Maps template scenes + media to a composition definition |
| `TemplatePicker.tsx` | UI component for selecting and previewing templates |
| Pipeline progress UI | Multi-stage progress display (extends ExportPanel pattern) |

## Template Schema Extensions

The existing template schema supports this with minor additions:

```json
{
  "pipeline": {
    "autoTranscribe": true,
    "autoProcess": true,
    "autoRender": true,
    "multiFormat": ["16:9", "9:16"]
  },
  "scenes": [
    {
      "type": "intro",
      "duration": "auto",
      "layers": [
        { "type": "video", "source": "primary", "fit": "cover" },
        { "type": "text", "content": "{{project.name}}", "position": "bottom-center" }
      ]
    }
  ]
}
```

The `"auto"` duration means the scene lasts as long as the input media (minus cuts). Template variables like `{{project.name}}` are resolved at pipeline time.

## Out of Scope (Future Work)

- **Real-time FFmpeg encoding** — not feasible; batch rendering is the correct approach
- **Cloud rendering** — could offload FFmpeg to a remote worker, but local-first for now
- **Multi-source stitching** — combining multiple input files into one template (e.g., two camera angles for an interview). This is valuable but adds significant complexity.
- **Template marketplace** — sharing/importing community templates

## Success Criteria

1. A user can import a raw recording, pick a template, and get a finished video with one click
2. The pipeline reuses existing services without duplicating rendering logic
3. SSE progress covers all stages, not just the final FFmpeg render
4. Live preview in the editor shows the template applied before committing to render
5. Processing time is no worse than manually performing each step
