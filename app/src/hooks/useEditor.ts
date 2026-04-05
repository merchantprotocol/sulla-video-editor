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

interface UndoEntry {
  edl: Edl
  desc: string
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

  // Add a cut
  function addCut(startMs: number, endMs: number, reason: string) {
    // Don't add duplicate cuts
    if (isCut(startMs, endMs)) return
    const newEdl = {
      ...edl,
      cuts: [...edl.cuts, { type: 'remove' as const, start_ms: startMs, end_ms: endMs, reason }],
    }
    pushUndo(reason, newEdl)
  }

  // Remove cuts in a range (restore)
  function removeCutsInRange(startMs: number, endMs: number) {
    const newEdl = {
      ...edl,
      cuts: edl.cuts.filter(c => !(c.start_ms >= startMs && c.end_ms <= endMs)),
    }
    pushUndo('Restore cut region', newEdl)
  }

  // Bulk: remove all fillers
  function removeAllFillers(words: { start: number; end: number; filler?: boolean }[]) {
    const fillerCuts: EdlCut[] = words
      .filter(w => w.filler && !isCut(w.start * 1000, w.end * 1000))
      .map(w => ({
        type: 'remove' as const,
        start_ms: Math.round(w.start * 1000),
        end_ms: Math.round(w.end * 1000),
        reason: 'filler',
      }))

    if (fillerCuts.length === 0) return 0

    const newEdl = { ...edl, cuts: [...edl.cuts, ...fillerCuts] }
    pushUndo(`Remove ${fillerCuts.length} fillers`, newEdl)
    return fillerCuts.length
  }

  // Bulk: trim all silence
  function trimAllSilence(silences: { start: number; end: number; duration: number }[], thresholdMs = 1500) {
    const silenceCuts: EdlCut[] = silences
      .filter(s => s.duration * 1000 >= thresholdMs && !isCut(s.start * 1000, s.end * 1000))
      .map(s => ({
        type: 'remove' as const,
        start_ms: Math.round(s.start * 1000),
        end_ms: Math.round(s.end * 1000),
        reason: `silence:${s.duration.toFixed(1)}s`,
      }))

    if (silenceCuts.length === 0) return { count: 0, savedMs: 0 }

    const savedMs = silenceCuts.reduce((sum, c) => sum + (c.end_ms - c.start_ms), 0)
    const newEdl = { ...edl, cuts: [...edl.cuts, ...silenceCuts] }
    pushUndo(`Trim ${silenceCuts.length} pauses`, newEdl)
    return { count: silenceCuts.length, savedMs }
  }

  // Cut selected word range
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
