import { useState, useCallback, useRef } from 'react'

export interface EdlCut {
  type: 'remove'
  start_ms: number
  end_ms: number
  reason: string
}

export interface Edl {
  version: number
  cuts: EdlCut[]
}

// Max search window when snapping cuts to silence in waveform (ms)
const SNAP_WINDOW_MS = 150
// Amplitude threshold below which audio is considered silence (0-1 normalized)
const SILENCE_THRESHOLD = 0.08

interface UndoEntry {
  edl: Edl
  desc: string
}

/**
 * Snap a cut edge to the nearest silence boundary in the waveform.
 * Searches within SNAP_WINDOW_MS around the timestamp for the quietest point.
 * Falls back to a small fixed pad if no waveform data is available.
 */
function snapToSilence(
  timeMs: number,
  direction: 'before' | 'after',
  waveform: number[] | null,
  durationSec: number,
): number {
  if (!waveform || !waveform.length || durationSec <= 0) {
    // No waveform — use small fixed padding as fallback
    return direction === 'before'
      ? Math.max(0, timeMs - 50)
      : timeMs + 50
  }

  const samplesPerSec = 100
  const totalSamples = waveform.length
  const msPerSample = (durationSec * 1000) / totalSamples
  const centerSample = Math.round(timeMs / msPerSample)

  const windowSamples = Math.round(SNAP_WINDOW_MS / msPerSample)
  const searchStart = Math.max(0, centerSample - windowSamples)
  const searchEnd = Math.min(totalSamples - 1, centerSample + windowSamples)

  // Find the quietest sample in the search window
  let bestSample = centerSample
  let bestAmp = Infinity

  for (let i = searchStart; i <= searchEnd; i++) {
    const amp = waveform[i]
    if (amp < bestAmp) {
      bestAmp = amp
      bestSample = i
    }
  }

  // If the quietest point is below silence threshold, snap to it.
  // Otherwise, bias slightly in the cut direction to avoid clipping speech.
  if (bestAmp < SILENCE_THRESHOLD) {
    return Math.max(0, bestSample * msPerSample)
  }

  // No silence found — use minimal padding in the safe direction
  return direction === 'before'
    ? Math.max(0, timeMs - 30)
    : timeMs + 30
}

/**
 * Create a snapped cut range using waveform silence detection.
 */
function snapCut(
  startMs: number,
  endMs: number,
  waveform: number[] | null,
  durationSec: number,
): { start_ms: number; end_ms: number } {
  return {
    start_ms: snapToSilence(startMs, 'before', waveform, durationSec),
    end_ms: snapToSilence(endMs, 'after', waveform, durationSec),
  }
}

/**
 * Merge overlapping/adjacent cuts so the skip logic doesn't have gaps.
 * Sorted by start_ms ascending.
 */
function mergeCuts(cuts: EdlCut[]): EdlCut[] {
  if (cuts.length <= 1) return cuts
  const sorted = [...cuts].sort((a, b) => a.start_ms - b.start_ms)
  const merged: EdlCut[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1]
    const cur = sorted[i]
    if (cur.start_ms <= prev.end_ms) {
      // Overlap or adjacent — extend
      prev.end_ms = Math.max(prev.end_ms, cur.end_ms)
      prev.reason = prev.reason.includes(cur.reason) ? prev.reason : `${prev.reason}+${cur.reason}`
    } else {
      merged.push({ ...cur })
    }
  }
  return merged
}

export function useEditor(initialEdl?: Edl) {
  const [edl, setEdl] = useState<Edl>(initialEdl || { version: 1, cuts: [] })
  const waveformRef = useRef<number[] | null>(null)
  const durationRef = useRef(0)
  const undoStack = useRef<UndoEntry[]>([])
  const redoStack = useRef<UndoEntry[]>([])
  const [undoCount, setUndoCount] = useState(0) // force re-renders on undo/redo
  const [lastAction, setLastAction] = useState<string | null>(null)

  // Call this when waveform data and duration become available
  function setWaveformContext(waveform: number[] | null, durationSec: number) {
    waveformRef.current = waveform
    durationRef.current = durationSec
  }

  const pushUndo = useCallback((desc: string, newEdl: Edl) => {
    undoStack.current.push({ edl: structuredClone(edl), desc })
    redoStack.current = []
    setEdl(newEdl)
    setUndoCount(c => c + 1)
    setLastAction(desc)
    // Clear action toast after 3s
    setTimeout(() => setLastAction(null), 3000)
  }, [edl])

  const undo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return
    redoStack.current.push({ edl: structuredClone(edl), desc: entry.desc })
    setEdl(entry.edl)
    setUndoCount(c => c + 1)
    setLastAction(`Undone: ${entry.desc}`)
    setTimeout(() => setLastAction(null), 3000)
  }, [edl])

  const redo = useCallback(() => {
    const entry = redoStack.current.pop()
    if (!entry) return
    undoStack.current.push({ edl: structuredClone(edl), desc: entry.desc })
    setEdl(entry.edl)
    setUndoCount(c => c + 1)
  }, [edl])

  // Check if a time range is cut
  function isCut(startMs: number, endMs: number): boolean {
    return edl.cuts.some(c => c.start_ms <= startMs && c.end_ms >= endMs)
  }

  // Add a cut with waveform-snapped edges for accurate boundaries
  function addCut(startMs: number, endMs: number, reason: string) {
    if (isCut(startMs, endMs)) return
    const snapped = snapCut(startMs, endMs, waveformRef.current, durationRef.current)
    const newCuts = mergeCuts([...edl.cuts, { type: 'remove' as const, ...snapped, reason }])
    pushUndo(reason, { ...edl, cuts: newCuts })
  }

  // Remove cuts that overlap a range (restore)
  // Uses overlap check (not containment) so padded cuts can be restored
  // by clicking the original unpadded word/silence range.
  function removeCutsInRange(startMs: number, endMs: number) {
    const newEdl = {
      ...edl,
      cuts: edl.cuts.filter(c => !(c.start_ms < endMs && c.end_ms > startMs)),
    }
    pushUndo('Restore cut region', newEdl)
  }

  // Bulk: remove all fillers with padding for timestamp accuracy.
  // Also absorbs adjacent punctuation-only words (Whisper emits ".", "," etc. as separate tokens).
  function removeAllFillers(words: { word: string; start: number; end: number; filler?: boolean }[]) {
    const isPunct = (w: { word: string }) => /^[.,!?;:\u2026]+$/.test(w.word.trim())
    const fillerCuts: EdlCut[] = []

    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      if (!w.filler || isCut(w.start * 1000, w.end * 1000)) continue

      let startMs = Math.round(w.start * 1000)
      let endMs = Math.round(w.end * 1000)

      // Absorb punctuation immediately after the filler
      while (i + 1 < words.length && isPunct(words[i + 1]) && !isCut(words[i + 1].start * 1000, words[i + 1].end * 1000)) {
        i++
        endMs = Math.round(words[i].end * 1000)
      }
      // Absorb punctuation immediately before the filler
      const firstIdx = fillerCuts.length === 0 ? 0 : i
      const prevIdx = words.findIndex(ww => ww === w) - 1
      if (prevIdx >= 0 && isPunct(words[prevIdx]) && !isCut(words[prevIdx].start * 1000, words[prevIdx].end * 1000)) {
        startMs = Math.round(words[prevIdx].start * 1000)
      }

      const snapped = snapCut(startMs, endMs, waveformRef.current, durationRef.current)
      fillerCuts.push({ type: 'remove' as const, ...snapped, reason: 'filler' })
    }

    if (fillerCuts.length === 0) return 0

    const newCuts = mergeCuts([...edl.cuts, ...fillerCuts])
    pushUndo(`Remove ${fillerCuts.length} fillers`, { ...edl, cuts: newCuts })
    return fillerCuts.length
  }

  // Bulk: trim all silence with padding
  function trimAllSilence(silences: { start: number; end: number; duration: number }[], thresholdMs = 1500) {
    const silenceCuts: EdlCut[] = silences
      .filter(s => s.duration * 1000 >= thresholdMs && !isCut(s.start * 1000, s.end * 1000))
      .map(s => {
        const snapped = snapCut(Math.round(s.start * 1000), Math.round(s.end * 1000), waveformRef.current, durationRef.current)
        return { type: 'remove' as const, ...snapped, reason: `silence:${s.duration.toFixed(1)}s` }
      })

    if (silenceCuts.length === 0) return { count: 0, savedMs: 0 }

    const savedMs = silenceCuts.reduce((sum, c) => sum + (c.end_ms - c.start_ms), 0)
    const newCuts = mergeCuts([...edl.cuts, ...silenceCuts])
    pushUndo(`Trim ${silenceCuts.length} pauses`, { ...edl, cuts: newCuts })
    return { count: silenceCuts.length, savedMs }
  }

  // Cut selected word range (addCut already applies padding)
  function cutWords(words: { start: number; end: number }[]) {
    if (words.length === 0) return
    const startMs = Math.round(words[0].start * 1000)
    const endMs = Math.round(words[words.length - 1].end * 1000)
    addCut(startMs, endMs, `cut:${words.length} words`)
  }

  // Get total cut time
  function totalCutMs(): number {
    return edl.cuts.reduce((sum, c) => sum + (c.end_ms - c.start_ms), 0)
  }

  // Get effective duration after cuts
  function effectiveDuration(totalMs: number): number {
    return totalMs - totalCutMs()
  }

  // Get next non-cut time after a given time (for skip playback)
  function nextPlayableTime(timeMs: number): number {
    for (const cut of edl.cuts.sort((a, b) => a.start_ms - b.start_ms)) {
      if (timeMs >= cut.start_ms && timeMs < cut.end_ms) {
        return cut.end_ms
      }
    }
    return timeMs
  }

  return {
    edl,
    setEdl,
    setWaveformContext,
    isCut,
    addCut,
    removeCutsInRange,
    removeAllFillers,
    trimAllSilence,
    cutWords,
    totalCutMs,
    effectiveDuration,
    nextPlayableTime,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    lastAction,
    undoCount, // subscribe to changes
  }
}
