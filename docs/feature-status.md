# Feature Status — What's Done vs What's Stubbed

> Updated: 2026-04-05

## Working End-to-End (Frontend + Backend + Tested)

| Feature | Status |
|---------|--------|
| User registration / onboarding | ✅ Working |
| User login (JWT + cookie) | ✅ Working |
| API key bypass auth (SULLA_API_KEY) | ✅ Working |
| User management API (list, update, delete, password) | ✅ Working |
| Org management API (get, update, members, invites) | ✅ Working |
| Project create / list / delete | ✅ Working |
| Project template assignment (template_id → snapshot config) | ✅ Working |
| File upload (chunked) | ✅ Working |
| FFprobe metadata extraction | ✅ Working |
| Audio extraction (16kHz WAV) | ✅ Working |
| Thumbnail generation | ✅ Working |
| Track detection from media streams | ✅ Working (auto-generates on first load) |
| Whisper transcription (word-level + DTW alignment) | ✅ Working |
| Filler word detection | ✅ Working |
| Silence gap detection | ✅ Working |
| Transcript display (word-level) | ✅ Working |
| Word click → video seek | ✅ Working |
| Text selection → delete (EDL cuts) | ✅ Working |
| Bulk filler removal (with 80/60ms padding) | ✅ Working |
| Bulk silence trimming (with padding + merge) | ✅ Working |
| EDL save/load (auto-save) | ✅ Working |
| Undo/redo stack | ✅ Working |
| Video playback skips cut regions (requestAnimationFrame) | ✅ Working |
| FFmpeg render with EDL cuts (concat + micro-crossfade) | ✅ Working |
| Render with SSE progress streaming | ✅ Working |
| Export panel (format/resolution/quality) | ✅ Working |
| Download rendered video | ✅ Working |
| React-to-video composition | ✅ Working (Puppeteer + FFmpeg) |
| Template CRUD (create/list/update/delete) | ✅ Working |
| System templates (podcast/youtube/social/tutorial/interview) | ✅ Working |
| Template auto-application after transcription | ✅ Working |
| Template play/preview with scene walkthrough | ✅ Working |
| New Project page shows real templates from API | ✅ Working |
| Dynamic tracks from real media streams | ✅ Working |
| Transcript words on audio tracks | ✅ Working |
| Track context menu (mute, solo, split, rename, delete, etc.) | ✅ UI (mute/solo wired, others toast) |
| Track zoom (timeline scaling + auto-scroll playhead) | ✅ Working |
| Transcript context menu (cut, copy, delete, keep only, split, B-roll) | ✅ UI (cut/copy/delete wired, others toast) |
| Structured logging with request IDs | ✅ Working |
| OpenAPI 3.1 spec at /api/openapi.json | ✅ Working |
| 99 unit tests | ✅ Passing |

## UI Present But Not Wired (Shows "coming soon" toast)

| Feature | What's missing | Effort |
|---------|---------------|--------|
| **Edit project title** | No inline edit on breadcrumb, PUT /projects/:id exists but UI doesn't call it | Small |
| **Edit speaker names** | Speaker menu → Rename shows toast | Small |
| **Change speaker color** | Speaker menu → Change Color shows toast | Small |
| **Merge speaker blocks** | Speaker menu → Merge shows toast | Medium |
| **Split speaker block** | Speaker menu → Split shows toast | Medium |
| **Assign to different speaker** | Speaker menu → Assign shows toast | Medium |
| **Captions toolbar button** | Toast "coming soon" | Medium — caption.service.js exists |
| **Auto clips** | Suggestion card + toolbar both toast | Large — clip extraction exists in render.service |
| **Translation** | Toolbar button toasts | Large — needs translation API |
| **Studio Sound** | Toggles a local boolean, doesn't call backend | Medium — needs FFmpeg audio filter chain |
| **Audio normalization** | Same as studio sound — local toggle only | Medium — needs FFmpeg loudnorm filter |
| **Hook fix** | Suggestion card toasts | Small — cut the weak opening in EDL |
| **Scene breaks toggle** | Toolbar button toasts | Small |
| **Command palette actions** | Palette opens but most actions toast | Small — wire to existing functions |
| **Track rename** | Track context menu toasts | Small |
| **Track duplicate/delete** | Track context menu toasts | Medium |
| **Detach audio** | Track context menu toasts (video tracks only) | Medium |
| **Split at playhead** | Track context menu toasts | Medium |
| **Add effect** | Track context menu toasts | Large |
| **Change track color** | Track context menu toasts | Small |

## Backend Exists But No Frontend

| Feature | Backend | Frontend needed |
|---------|---------|-----------------|
| PUT /projects/:id (update name, status) | ✅ | Click-to-edit title in editor |
| GET /projects/:id/suggestions | ✅ | Display AI analysis results (currently hardcoded) |
| POST /projects/:id/clips (render clip) | ✅ | Clip selection UI, clip list, batch export |
| GET /projects/:id/exports (list exports) | ✅ | Export history panel |
| POST /projects/:id/render/stream (SSE) | ✅ | Render progress bar in export panel |
| Caption ASS generation (caption.service.js) | ✅ | Caption style picker, preview, burn-in toggle |
| POST /compose/react | ✅ | Composition project creation UI |
| GET/PUT /api/users (user management) | ✅ | Admin/profile page |
| GET/POST/PUT/DELETE /api/orgs/:id/members | ✅ | Team management UI |
| POST /api/orgs/:id/invites | ✅ | Invite modal |

## Not Built At All

| Feature | Effort | Notes |
|---------|--------|-------|
| **AI content analysis (Claude API)** | Medium | Send transcript to Claude for suggestions |
| **Speaker diarization** | Large | Need pyannote or similar for multi-speaker |
| **Auto-reframe (face tracking)** | Large | MediaPipe + FFmpeg crop |
| **ElevenLabs TTS / voice cloning** | Medium | API integration |
| **Google OAuth** | Small | Login shows "OAuth coming soon" |
| **Forgot password (real)** | Small | Needs email sending |
| **Profile / Settings pages** | Medium | Nav links exist, pages don't |
| **Org member management UI** | Medium | Backend complete, no UI |
| **Dark mode toggle** | Small | CSS variables ready, no toggle |
| **Responsive layout** | Medium | Editor breaks below ~900px |

## Priority Order to Complete

### Quick wins (< 1 hour each):
1. Edit project title (click breadcrumb → inline input → PUT)
2. Edit speaker names (click name → inline input → save transcript)
3. Wire command palette actions to existing functions
4. Scene breaks toggle
5. Hook fix suggestion
6. Dark mode toggle
7. Wire render SSE progress to export panel

### Medium effort (2-4 hours each):
8. Caption style panel + burn-in on export
9. Studio sound + normalize as FFmpeg filters on export
10. AI analysis with Claude API → real suggestions
11. Speaker color picker
12. Merge/split speaker blocks
13. Export history panel
14. Profile/Settings pages
15. Team management UI (invite, roles)

### Larger features (1+ days):
16. Auto-clip detection + clip list UI
17. Multi-speaker diarization
18. Translation API
19. Google OAuth
20. Auto-reframe with face tracking
21. ElevenLabs TTS
