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

// Padding added before/after each cut to compensate for whisper timestamp drift.
// Whisper base.en timestamps can be off by 50-200ms; 80ms covers most drift
// without eating into adjacent words.
const CUT_PAD_BEFORE_MS = 80
const CUT_PAD_AFTER_MS = 60

interface UndoEntry {
  edl: Edl
  desc: string
}

/**
 * Pad a cut range to compensate for whisper timestamp inaccuracy,
 * then clamp to zero.
 */
function padCut(startMs: number, endMs: number): { start_ms: number; end_ms: number } {
  return {
    start_ms: Math.max(0, startMs - CUT_PAD_BEFORE_MS),
    end_ms: endMs + CUT_PAD_AFTER_MS,
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
  const undoStack = useRef<UndoEntry[]>([])
  const redoStack = useRef<UndoEntry[]>([])
  const [undoCount, setUndoCount] = useState(0) // force re-renders on undo/redo
  const [lastAction, setLastAction] = useState<string | null>(null)

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

  // Add a cut with padding for timestamp accuracy
  function addCut(startMs: number, endMs: number, reason: string) {
    // Don't add duplicate cuts
    if (isCut(startMs, endMs)) return
    const padded = padCut(startMs, endMs)
    const newCuts = mergeCuts([...edl.cuts, { type: 'remove' as const, ...padded, reason }])
    pushUndo(reason, { ...edl, cuts: newCuts })
  }

  // Remove cuts in a range (restore)
  function removeCutsInRange(startMs: number, endMs: number) {
    const newEdl = {
      ...edl,
      cuts: edl.cuts.filter(c => !(c.start_ms >= startMs && c.end_ms <= endMs)),
    }
    pushUndo('Restore cut region', newEdl)
  }

  // Bulk: remove all fillers with padding for timestamp accuracy
  function removeAllFillers(words: { start: number; end: number; filler?: boolean }[]) {
    const fillerCuts: EdlCut[] = words
      .filter(w => w.filler && !isCut(w.start * 1000, w.end * 1000))
      .map(w => {
        const padded = padCut(Math.round(w.start * 1000), Math.round(w.end * 1000))
        return { type: 'remove' as const, ...padded, reason: 'filler' }
      })

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
        const padded = padCut(Math.round(s.start * 1000), Math.round(s.end * 1000))
        return { type: 'remove' as const, ...padded, reason: `silence:${s.duration.toFixed(1)}s` }
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
