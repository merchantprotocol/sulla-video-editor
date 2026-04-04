# Sulla Video Editor — UI/UX Production Readiness Assessment

> Based on interactive prototype: `designs/v1a-interactive.html`
> Date: 2026-04-04

---

## What Works Well

- Document-first layout is clear and intuitive
- Toolbar icon bar is easy to scan — feels like editing a document
- Filler/silence detection + one-click cleanup is the killer flow
- Right panel suggestion cards are scannable with good action hierarchy
- Overlay panels (Captions, Clips, Export) slide in cleanly
- Track panel with mute/solo/volume is functional
- Playhead animation syncs across ruler, tracks, and scrub bar
- Light mode gives natural reading hierarchy

---

## Production Gaps

### Critical (must fix)

1. **No right-click context menu on words** — need Cut, Copy, Delete, "Remove to here", "Keep only this" options when right-clicking transcript text
2. **No text selection / range delete** — can't click-drag to select a range of words and delete them (the core Descript interaction)
3. **No drag-to-reorder on transcript blocks** — should be able to drag a sentence/paragraph to reorder the video
4. **Keyboard shortcuts missing** — Space for play/pause, Cmd+Z undo, Delete for selected text, J/K/L for shuttle
5. **Scrub bar in video section not interactive** — clicking it doesn't seek
6. **No undo/redo stack** — the undo/redo buttons toast but don't actually reverse actions
7. **Track clips aren't draggable** — can't move or trim clips on the timeline
8. **Track ruler click-to-seek doesn't update the transcript highlight position**

### Major (should fix before v1)

9. **No import/drop zone** — need a way to drag+drop media files or show an empty state with "Import Video" CTA
10. **No empty state** — what does the app look like before a project is loaded?
11. **Video preview is just a placeholder** — needs at least a static image or color frame to feel real
12. **No waveform on video tracks** — Screen and Camera tracks show a flat clip bar but no visual content (thumbnail strip or waveform)
13. **Clip cards in Clips panel aren't interactive** — clicking them should seek to that clip, show a preview, or open a trim view
14. **Export panel options aren't functional** — Resolution/Quality show static text, should be dropdowns
15. **No progress/loading states** — when you click "Export Video" or "Generate Captions", there's no spinner, progress bar, or status update
16. **Caption position/font-size in Captions panel are static text** — should be dropdowns or sliders
17. **No speaker management** — can't rename speakers, merge, or split speaker blocks
18. **Search/find missing** — no Cmd+F to search within transcript
19. **Track panel collapse animation is instant** — should smoothly animate height (transition was removed for resize fix, need to re-enable conditionally)
20. **Zoom buttons don't actually zoom the timeline** — ruler marks should spread/compress

### Polish (nice to have for v1)

21. **No responsive/narrow breakpoint** — layout breaks on windows < 900px wide
22. **No dark mode toggle** — users will want both (dark version exists already)
23. **No tooltip on volume sliders** — should show percentage
24. **Waveform bars are random/static** — in a real app they'd reflect actual audio content
25. **Scene dividers don't have add/remove scene interaction**
26. **No marker/bookmark system** — ability to drop pins on the timeline
27. **No B-roll insertion UI** — nowhere to drag B-roll onto the timeline or insert at a transcript position
28. **Cleanup summary count doesn't animate** when individual fillers are clicked
29. **Ask Sulla button should open a chat/command palette**, not just a toast
30. **No project save indicator** — no "Saved" / "Unsaved changes" state
31. **Track row height isn't resizable** — individual tracks should be expandable for finer waveform editing
32. **No split clip tool** — clicking at a point on a track clip to split it into two segments
33. **No snap-to-grid on timeline** — clips should snap to scene boundaries and other clip edges
34. **Missing transition indicators between clips** — the scene composer design had these, this view doesn't

### Accessibility

35. **No focus rings on buttons** — keyboard navigation has no visible focus indicators
36. **Toolbar icon-only buttons need aria-labels** — screen readers can't identify them
37. **Color-only indicators** (red filler, yellow silence) need secondary signals for color-blind users — wavy underline on fillers is good, silence markers rely solely on yellow

---

## Recommended Build Order

### Phase A — Core Editing (make it actually edit)
Items 1-3, 5-6, 8

- Text selection and range delete across words
- Right-click context menu on words and selections
- Drag-to-reorder transcript blocks
- Scrub bar click-to-seek
- Undo/redo stack with real state management
- Transcript highlight syncs with timeline seek

### Phase B — Real Data Flow
Items 9-11, 15, 17

- Import/drop zone and empty state
- Video preview with real frame or placeholder image
- Progress/loading states for export and AI operations
- Speaker management (rename, merge, split)

### Phase C — Timeline Functionality
Items 7, 12, 20, 32-33

- Draggable and trimmable track clips
- Thumbnail strips or waveform on video tracks
- Functional timeline zoom
- Split clip tool
- Snap-to-grid behavior

### Phase D — Polish
Items 14, 16, 19, 21-22, 28-31, 35-37

- Functional dropdowns for export options and caption settings
- Smooth collapse/expand animations
- Responsive layout for narrow windows
- Dark mode toggle
- Accessibility (focus rings, aria-labels, color-blind signals)
- Ask Sulla chat/command palette
- Project save state indicator
