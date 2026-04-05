# Feature Status — What's Done vs What's Stubbed

> Updated: 2026-04-05

## Working End-to-End (Frontend + Backend + Tested)

| Feature | Status |
|---------|--------|
| User registration / onboarding | ✅ Working |
| User login (JWT + cookie) | ✅ Working |
| API key bypass auth (SULLA_API_KEY) | ✅ Working |
| Project create / list / delete | ✅ Working |
| File upload (chunked) | ✅ Working |
| FFprobe metadata extraction | ✅ Working |
| Audio extraction (16kHz WAV) | ✅ Working |
| Thumbnail generation | ✅ Working |
| Track detection from media streams | ✅ Working (auto-generates on first load) |
| Whisper transcription (word-level) | ✅ Working |
| Filler word detection | ✅ Working |
| Silence gap detection | ✅ Working |
| Transcript display (word-level) | ✅ Working |
| Word click → video seek | ✅ Working |
| Text selection → delete (EDL cuts) | ✅ Working |
| Bulk filler removal | ✅ Working |
| Bulk silence trimming | ✅ Working |
| EDL save/load (auto-save) | ✅ Working |
| Undo/redo stack | ✅ Working |
| Video playback skips cut regions | ✅ Working |
| FFmpeg render with EDL cuts | ✅ Working |
| Export panel (format/resolution/quality) | ✅ Working |
| Download rendered video | ✅ Working |
| React-to-video composition | ✅ Working (Puppeteer + FFmpeg) |
| Template CRUD (create/list/update/delete) | ✅ Working |
| System templates (podcast/youtube/social/tutorial/interview) | ✅ Working |
| Dynamic tracks from real media streams | ✅ Working |
| Transcript words on audio tracks | ✅ Working |
| Structured logging with request IDs | ✅ Working |
| 99 unit tests | ✅ Passing |

## UI Present But Not Wired (Shows "coming soon" toast)

| Feature | What's missing | Effort |
|---------|---------------|--------|
| **Edit project title** | No inline edit on breadcrumb, PUT /projects/:id exists but UI doesn't call it | Small — add click-to-edit on breadcrumb |
| **Edit speaker names** | Speaker menu → Rename shows toast | Small — inline input, PUT /projects/:id/transcript to update speaker name in JSON |
| **Change speaker color** | Speaker menu → Change Color shows toast | Small — color picker, save to transcript.json |
| **Merge speaker blocks** | Speaker menu → Merge shows toast | Medium — merge transcript word ranges, update JSON |
| **Split speaker block** | Speaker menu → Split shows toast | Medium — split word array at cursor, create new speaker block |
| **Assign to different speaker** | Speaker menu → Assign shows toast | Medium — change speaker ID on word range |
| **Captions toolbar button** | Toast "coming soon" | Medium — open caption style panel, burn captions on export (backend exists: caption.service.js) |
| **Auto clips** | Suggestion card + toolbar both toast | Large — AI analysis to find clip boundaries, clip extraction exists in render.service but needs frontend |
| **Translation** | Toolbar button toasts | Large — needs translation API integration |
| **Studio Sound** | Toggles a local boolean, doesn't call backend | Medium — needs FFmpeg audio filter chain on export |
| **Audio normalization** | Same as studio sound — local toggle only | Medium — needs FFmpeg loudnorm filter on export |
| **Hook fix** | Suggestion card toasts "coming soon" | Small — cut the weak opening in EDL (logic exists, just needs wiring) |
| **Scene breaks toggle** | Toolbar button toasts | Small — show/hide scene dividers in transcript |
| **Command palette actions** | Palette opens, filter works, but most actions toast | Small — wire each action to the existing function (most already exist) |
| **Track rename** | Track context menu toasts | Small |
| **Track duplicate/delete** | Track context menu toasts | Medium — multi-track project management |
| **Detach audio** | Track context menu toasts | Medium — FFmpeg extract audio to separate track |
| **Split at playhead** | Track context menu toasts | Medium — EDL split at current time |
| **Add effect** | Track context menu toasts | Large — audio/video effect pipeline |

## Backend Exists But No Frontend

| Feature | Backend | Frontend needed |
|---------|---------|-----------------|
| PUT /projects/:id (update name, status) | ✅ | Click-to-edit title in editor |
| GET /projects/:id/suggestions | ✅ | Display AI analysis results (currently shows hardcoded suggestions) |
| POST /projects/:id/clips (render clip) | ✅ | Clip selection UI, clip list, batch export |
| GET /projects/:id/exports (list exports) | ✅ | Export history panel showing all rendered files |
| Caption ASS generation (caption.service.js) | ✅ | Caption style picker, preview, burn-in toggle on export |
| POST /compose/react (React composition render) | ✅ | Composition project creation UI |

## Not Built At All

| Feature | Effort | Notes |
|---------|--------|-------|
| **AI content analysis (Claude API)** | Medium | POST /projects/:id/analyze — send transcript to Claude, get filler/hook/pacing/clip suggestions |
| **Speaker diarization** | Large | Whisper outputs single speaker — need pyannote or similar for multi-speaker |
| **Auto-reframe (face tracking)** | Large | MediaPipe face detection + FFmpeg crop |
| **ElevenLabs TTS / voice cloning** | Medium | API integration for audio generation |
| **Google OAuth** | Small | Both login + register show "OAuth coming soon" |
| **Forgot password (real)** | Small | Backend returns fake success, needs email sending |
| **Profile / Settings pages** | Medium | Nav menu links to /profile and /settings which don't exist |
| **Org member management** | Medium | Backend exists (invite, remove), no UI |
| **Dark mode toggle** | Small | CSS variables exist for dark mode, no toggle wired |
| **Responsive layout** | Medium | Editor breaks below ~900px |

## Priority Order to Complete

### Quick wins (< 1 hour each):
1. Edit project title (click breadcrumb → inline input → PUT)
2. Edit speaker names (click name → inline input → save transcript)
3. Wire command palette actions to existing functions
4. Scene breaks toggle
5. Hook fix suggestion
6. Dark mode toggle

### Medium effort (2-4 hours each):
7. Caption style panel + burn-in on export
8. Studio sound + normalize as FFmpeg filters on export
9. AI analysis with Claude API → real suggestions
10. Speaker color picker
11. Merge/split speaker blocks
12. Export history panel
13. Profile/Settings pages

### Larger features (1+ days):
14. Auto-clip detection + clip list UI
15. Multi-speaker diarization
16. Translation API
17. Google OAuth
18. Auto-reframe with face tracking
19. ElevenLabs TTS
