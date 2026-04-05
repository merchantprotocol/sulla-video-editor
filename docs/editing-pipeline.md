# Editing Pipeline

End-to-end flow from media import through transcription, editing, and rendering.

## Overview

```
Import → Extract → Transcribe → Edit (EDL) → Render → Export
```

Each stage produces artifacts stored on disk at `storage/<projectId>/`:

```
storage/<projectId>/
  media/
    source.mp4          # Original uploaded file
    audio.wav           # Extracted audio (for whisper)
    thumbnails/
      thumb-001.jpg     # Frame captures
  data/
    tracks.json         # Media track metadata (ffprobe)
    transcript.json     # Word-level transcript
    edl.json            # Edit Decision List
    suggestions.json    # AI suggestions (when available)
  exports/
    16x9-1080p.mp4      # Rendered output
    clip-15000-45000-9x16.mp4
```

## 1. Media Import

On upload (chunked or direct), the system:

1. **Saves** the source file to `media/source.<ext>`
2. **Extracts metadata** via FFprobe — duration, resolution, codec, tracks
3. **Extracts audio** to `media/audio.wav` (16-bit PCM, mono, 16kHz for whisper)
4. **Generates thumbnails** — frame captures at regular intervals
5. **Saves track info** to `data/tracks.json`
6. **Updates project DB** — duration_ms, resolution, file_size, status → `editing`

## 2. Transcription

Uses whisper.cpp with:
- **DTW alignment** (`--dtw tiny.en`) for precise word-level timestamps
- **Word-level output** (`-ml 1`) — each word gets its own timestamp
- **JSON output** (`-oj`) — structured token data

### Filler Detection

These words are auto-tagged as fillers during transcription:
> um, uh, like, basically, actually, literally, right, okay, so, well, you know, i mean

### Timestamp Accuracy

Whisper.cpp `base.en` timestamps have ~10ms resolution (centisecond). DTW alignment improves this significantly by aligning the audio spectrogram to token boundaries.

When DTW timestamps (`t_dtw`) are available, they are preferred over the default `t0`/`t1` values.

### Silence Detection

Gaps between words exceeding 1.5 seconds are recorded as silence regions in the transcript.

## 3. Edit Decision List (EDL)

The EDL is the core editing data structure. It records non-destructive cut operations:

```json
{
  "version": 1,
  "cuts": [
    { "type": "remove", "start_ms": 770, "end_ms": 1220, "reason": "filler" },
    { "type": "remove", "start_ms": 5140, "end_ms": 7920, "reason": "silence:2.6s" }
  ]
}
```

### Cut Padding

To compensate for whisper timestamp drift (~50-200ms), all cuts are padded:

- **80ms before** the whisper-reported start time
- **60ms after** the whisper-reported end time

This ensures the filler word or silence is fully removed rather than leaving an audible remnant.

### Cut Merging

After padding, overlapping or adjacent cuts are automatically merged. This prevents gaps in the skip logic and produces clean render output.

### EDL Operations

| Operation | Description |
|-----------|-------------|
| `removeAllFillers()` | Cuts all filler-tagged words with padding |
| `trimAllSilence(threshold)` | Cuts silence gaps exceeding the threshold |
| `cutWords(words[])` | Cuts a manually-selected word range |
| `addCut(startMs, endMs)` | Adds a single cut with padding |
| `removeCutsInRange()` | Restores a cut region |

All operations support undo/redo via an in-memory stack.

## 4. Playback

The editor provides EDL-aware playback using `requestAnimationFrame` (~16ms tick rate):

1. On each frame, check if the current playback time falls inside a cut region
2. If yes, seek to the end of the cut region
3. The skip threshold is 10ms — tight enough that cut words are inaudible

This replaced a 100ms `setInterval` approach that was too slow and allowed 0-100ms of cut audio to bleed through.

## 5. Rendering

### FFmpeg Pipeline

For projects with EDL cuts, the render uses a **concat filter graph** (not select/aselect):

1. Compute "keep" ranges (inverse of cuts)
2. For each keep range: `trim` → `fade` (5ms micro-crossfade) for both video and audio
3. Concat all segments into one output
4. Scale + pad to target dimensions

The micro-crossfade eliminates audible clicks/pops at cut boundaries that hard frame-cuts produce.

### Single-segment Optimization

If the EDL produces only one keep range, the render uses simple `-ss`/`-t` trimming instead of the full concat graph.

### Render Progress (SSE)

The streaming render endpoint (`POST /projects/:id/render/stream`) parses FFmpeg's stderr for `time=HH:MM:SS.ss` progress markers and converts them to percentage values streamed via Server-Sent Events.

### Output Formats

| Format | Dimensions | Use Case |
|--------|-----------|----------|
| 16:9 | 1920x1080 | YouTube, standard |
| 9:16 | 1080x1920 | TikTok, Reels, Shorts |
| 1:1 | 1080x1080 | Instagram, LinkedIn |
| 4:5 | 864x1080 | Instagram Feed |

### Quality Presets

| Quality | CRF Value | File Size |
|---------|-----------|-----------|
| high | 18 | Largest |
| medium | 23 | Balanced |
| low | 28 | Smallest |

## 6. Template Auto-Application

When a project has a `template_config`, the editor auto-applies rules after transcription:

```
Transcribe → Load Transcript → Check template_config.rules
  → removeFillers? → editor.removeAllFillers()
  → trimSilence?   → editor.trimAllSilence(thresholdMs)
  → studioSound?   → enable Studio Sound
  → normalize?     → enable audio normalization
  → toast("Template applied: ...")
```

This means a user can select "Podcast" template, upload a file, hit transcribe, and the filler words and silence are automatically cleaned up.
