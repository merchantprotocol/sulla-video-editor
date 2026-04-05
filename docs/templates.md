# Templates

Templates define how Sulla processes a video project — which rules to auto-apply, how scenes are laid out, visual theme, and export defaults.

## System Templates

Five system templates ship with the app as JSON files in `src/templates/system/`. They are read-only and available to all users.

| Slug | Name | Format | Key Rules |
|------|------|--------|-----------|
| `podcast` | Podcast | 16:9 | Remove fillers, trim silence (1.5s), studio sound, normalize (-14 LUFS), auto captions |
| `youtube` | YouTube | 16:9 | Remove fillers, trim silence (1.5s), studio sound, normalize, auto captions, auto clips |
| `social` | Social Media | 9:16 | Remove fillers, trim silence (1.0s), auto captions, auto clips |
| `tutorial` | Tutorial | 16:9 | Remove fillers, trim silence (2.0s), auto captions. Light theme. |
| `interview` | Interview | 16:9 | Remove fillers, trim silence (1.5s), studio sound, normalize, auto captions |

### Template JSON Structure

Each template file (`src/templates/system/<slug>.json`) has this structure:

```json
{
  "name": "Podcast",
  "slug": "podcast",
  "description": "Optimized for long-form audio and video podcasts...",
  "theme": {
    "accentColor": "#5096b3",
    "background": "dark",
    "fontFamily": "Inter",
    "captionStyle": "bold"
  },
  "scenes": [
    { "type": "TitleCard", "duration": 4, "transitionIn": "fade", "transitionOut": "crossfade" },
    { "type": "PiP", "pipPosition": "bottom-right", "pipSize": 120, "pipShape": "circle" },
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

### Adding a New System Template

1. Create a new JSON file in `src/templates/system/` (e.g., `webinar.json`)
2. Follow the structure above — the `slug` field must be unique
3. The loader (`src/templates/system/index.js`) auto-discovers all `.json` files
4. If using the DB, run `node src/cli/seed-system-templates.js` to upsert

No code changes needed — the loader picks up new files automatically.

## Custom Templates

Users can create custom templates via `POST /api/templates` or the Templates UI. Custom templates are stored in the `templates` table and scoped to the user's organization.

Custom templates can be:
- Created from scratch with full config
- Created from a system template base (pass `rule_type` to clone defaults)
- Edited: scenes, theme, and rules are all configurable
- Deleted (system templates cannot be deleted)

## Template Application

### At Project Creation

When a project is created with a `template_id`:

1. The backend resolves the template (from DB or system JSON files)
2. The full config is **snapshotted** as `template_config` JSONB on the project row
3. This means the project keeps its config even if the template is later changed

### After Transcription

When transcription completes in the editor, the project's `template_config.rules` are auto-applied:

1. `removeFillers: true` → removes all detected filler words from the EDL
2. `trimSilence.enabled: true` → trims silence gaps exceeding the threshold
3. `studioSound: true` → enables Studio Sound enhancement
4. `normalize.enabled: true` → enables audio normalization

A toast notification shows what was applied (e.g., "Template applied: 12 fillers removed, 5 pauses trimmed, Studio Sound").

## Scene Types

Templates define a sequence of scenes that describe the visual layout:

| Type | Description |
|------|-------------|
| `TitleCard` | Text overlay with accent bar. Has `duration` in seconds. |
| `FullFrame` | Full-screen video frame |
| `PiP` | Picture-in-Picture. Options: `pipPosition`, `pipSize`, `pipShape` |
| `BRoll` | B-Roll cutaway insert |
| `SideBySide` | Two speakers side-by-side (interviews) |
| `CaptionFocus` | Video with prominent caption overlay |

### Scene Transitions

Scenes can specify `transitionIn` and `transitionOut`:
- `fade` — fade from/to black
- `crossfade` — crossfade between scenes
- `cut` — hard cut (default)

## Database Schema

```sql
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES orgs(id),          -- NULL for system templates
  name TEXT NOT NULL,
  slug TEXT,                                  -- unique for system templates
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),      -- NULL for system templates
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
