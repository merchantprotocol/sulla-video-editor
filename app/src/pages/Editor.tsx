import { Link, useParams } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useProject } from '../hooks/useProjects'
import { useEditor } from '../hooks/useEditor'
import { api } from '../lib/api'
import ExportPanel from '../components/ExportPanel'
import CaptionsPanel from '../components/CaptionsPanel'
import AutoClipsPanel, { type AutoClip } from '../components/AutoClipsPanel'
import UserProfileDropdown from '../components/UserProfileDropdown'
import VideoOverlays, { type OverlayItem, createOverlay } from '../components/VideoOverlays'
import OverlayControls from '../components/OverlayControls'
import styles from './Editor.module.css'

interface Word { word: string; start: number; end: number; confidence: number; speaker: string; filler?: boolean }
interface Silence { start: number; end: number; duration: number; after_word_index: number }
interface Transcript { speakers: { id: string; name: string; color: string }[]; words: Word[]; silences: Silence[]; duration_ms: number; word_count: number }

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const { project, files, tracks, setTracks, loading, transcribe, getTranscript, saveEdl, getEdl, getOverlays, saveOverlays, saveTracks, renderVideo, getWaveform } = useProject(id!)
  const editor = useEditor()
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [captionsOpen, setCaptionsOpen] = useState(false)
  const [clipsOpen, setClipsOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [overlays, setOverlays] = useState<OverlayItem[]>([])
  const [sceneBreaks, setSceneBreaks] = useState<Set<number>>(new Set())
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoFrameRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  // UI state
  const [trackPanelCollapsed, setTrackPanelCollapsed] = useState(false)
  const [trackPanelHeight, setTrackPanelHeight] = useState(220)
  const [rightPanelWidth, setRightPanelWidth] = useState(380)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [cmdQuery, setCmdQuery] = useState('')
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState('track-video')
  const [trackZoom, setTrackZoom] = useState(1)
  const trackBodyRef = useRef<HTMLDivElement>(null)
  const [mutedTracks, setMutedTracks] = useState<Set<string>>(new Set())
  const [soloTrack, setSoloTrack] = useState<string | null>(null)
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(false)
  const [audioCollapsed, setAudioCollapsed] = useState(false)
  const [studioSoundApplied, setStudioSoundApplied] = useState(false)
  const [studioSoundProgress, setStudioSoundProgress] = useState<number | null>(null) // null = idle, 0-100 = processing
  const [normalizeApplied, setNormalizeApplied] = useState(false)
  const [normalizeProgress, setNormalizeProgress] = useState<number | null>(null)
  const [speakerMenuOpen, setSpeakerMenuOpen] = useState<number | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; wordIdx?: number } | null>(null)
  const [trackCtxMenu, setTrackCtxMenu] = useState<{ x: number; y: number; trackId: string; trackType: string; trackName: string } | null>(null)
  const [showSceneBreaks, setShowSceneBreaks] = useState(true)
  const [waveformData, setWaveformData] = useState<number[] | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null)
  const [speakerDraft, setSpeakerDraft] = useState('')
  const [editingWordIdx, setEditingWordIdx] = useState<number | null>(null)
  const [wordDraft, setWordDraft] = useState('')

  const cmdInputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()
  const appRef = useRef<HTMLDivElement>(null)

  // Load transcript + EDL + overlays
  useEffect(() => {
    if (files.hasTranscript) {
      getTranscript().then(setTranscript).catch(() => {})
    }
    if (files.hasEdl) {
      getEdl().then(edl => editor.setEdl(edl)).catch(() => {})
    }
    getOverlays().then(data => { if (data.overlays?.length) setOverlays(data.overlays) }).catch(() => {})
    if (files.hasWaveform) {
      getWaveform().then(data => setWaveformData(data.amplitudes || null)).catch(() => {})
    }
  }, [files.hasTranscript, files.hasEdl, files.hasWaveform])

  // Auto-save EDL on changes (debounced)
  useEffect(() => {
    if (editor.edl.cuts.length === 0 && !files.hasEdl) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await saveEdl(editor.edl).catch(() => {})
      setSaving(false)
    }, 1000)
  }, [editor.undoCount])

  // Auto-save overlays on changes (debounced)
  const overlaySaveTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (overlays.length === 0) return
    clearTimeout(overlaySaveTimer.current)
    overlaySaveTimer.current = setTimeout(() => {
      saveOverlays(overlays).catch(() => {})
    }, 1000)
  }, [overlays])

  // EDL-aware playback: skip cut regions using rAF for frame-accurate seeking
  useEffect(() => {
    if (!isPlaying || !videoRef.current) return
    let rafId: number
    function tick() {
      const v = videoRef.current
      if (!v || v.paused) { rafId = requestAnimationFrame(tick); return }
      const timeMs = v.currentTime * 1000
      const next = editor.nextPlayableTime(timeMs)
      if (next > timeMs + 10) {
        v.currentTime = next / 1000
      }
      setCurrentTime(v.currentTime)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying, editor.edl])

  // Auto-scroll track body to keep playhead visible when zoomed in
  useEffect(() => {
    if (!isPlaying || !trackBodyRef.current || trackZoom <= 1) return
    const el = trackBodyRef.current
    const playheadX = TRACK_META_W + (playPercent / 100) * timelineW
    const viewLeft = el.scrollLeft
    const viewRight = el.scrollLeft + el.clientWidth
    if (playheadX < viewLeft + 100 || playheadX > viewRight - 100) {
      el.scrollLeft = playheadX - el.clientWidth / 2
    }
  }, [currentTime, trackZoom])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.code === 'Space') { e.preventDefault(); togglePlay() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); editor.undo() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); editor.redo() }
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(e) }
      if (e.key === 'j') seekRelative(-5)
      if (e.key === 'l') seekRelative(5)
      if (e.key === 'k') { if (isPlaying) togglePlay() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(prev => !prev)
      }
      if (e.key === 'Escape') {
        setCmdOpen(false)
        setCtxMenu(null)
        setSpeakerMenuOpen(null)
        setCaptionsOpen(false)
        setClipsOpen(false)
        setExportOpen(false)
        setUserMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isPlaying, transcript, editor])

  // Focus cmd input when opened
  useEffect(() => {
    if (cmdOpen) {
      setTimeout(() => cmdInputRef.current?.focus(), 100)
    } else {
      setCmdQuery('')
    }
  }, [cmdOpen])

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest(`.${styles.speakerMenu}`) && !target.closest(`.${styles.speakerCtx}`)) {
        setSpeakerMenuOpen(null)
      }
      if (!target.closest(`.${styles.ctxMenu}`)) {
        setCtxMenu(null)
      }
      if (!target.closest(`.${styles.trackCtxMenu}`)) {
        setTrackCtxMenu(null)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  function toast(msg: string) {
    setToastMsg(msg)
    setToastVisible(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastVisible(false), 2000)
  }

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setIsPlaying(true) }
    else { v.pause(); setIsPlaying(false) }
  }

  function seekTo(time: number) {
    setCurrentTime(time)
    if (videoRef.current) videoRef.current.currentTime = time
  }

  function seekRelative(sec: number) {
    const v = videoRef.current
    if (v) { v.currentTime = Math.max(0, v.currentTime + sec); setCurrentTime(v.currentTime) }
  }

  function deleteSelection(e: Event) {
    e.preventDefault()
    if (!transcript) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return

    const range = sel.getRangeAt(0)
    const selectedWords: Word[] = []
    document.querySelectorAll('[data-word-idx]').forEach(el => {
      if (range.intersectsNode(el)) {
        const idx = parseInt(el.getAttribute('data-word-idx')!)
        if (!isNaN(idx) && transcript.words[idx]) {
          selectedWords.push(transcript.words[idx])
        }
      }
    })

    if (selectedWords.length > 0) {
      editor.cutWords(selectedWords)
      sel.removeAllRanges()
    }
  }

  async function handleTranscribe() {
    setTranscribing(true)
    try {
      await transcribe()
      const t = await getTranscript()
      setTranscript(t)

      // Auto-apply template rules if the project has a template config
      const rules = project.template_config?.rules
      if (rules && t) {
        let applied: string[] = []
        if (rules.removeFillers) {
          const count = editor.removeAllFillers(t.words)
          if (count > 0) applied.push(`${count} fillers removed`)
        }
        if (rules.trimSilence?.enabled) {
          const { count } = editor.trimAllSilence(t.silences, rules.trimSilence.thresholdMs)
          if (count > 0) applied.push(`${count} pauses trimmed`)
        }
        if (rules.studioSound) {
          handleStudioSound() // runs async in background
          applied.push('Studio Sound')
        }
        if (rules.normalize?.enabled) {
          handleNormalize() // runs async in background
          applied.push(`Normalized to ${rules.normalize.targetLufs} LUFS`)
        }
        if (applied.length > 0) {
          toast(`Template applied: ${applied.join(', ')}`)
        }
      }
    } catch (err: any) {
      alert('Transcription failed: ' + err.message)
    } finally {
      setTranscribing(false)
    }
  }

  function handleRemoveFillers() {
    if (!transcript) return
    const count = editor.removeAllFillers(transcript.words)
    if (count === 0) toast('No uncut fillers remaining')
  }

  function handleTrimSilence() {
    if (!transcript) return
    const { count, savedMs } = editor.trimAllSilence(transcript.silences)
    if (count === 0) toast('No untrimmed pauses remaining')
  }

  function handleCleanAll() {
    handleRemoveFillers()
    setTimeout(() => handleTrimSilence(), 50)
  }

  // ─── Studio Sound (SSE streaming) ────────────────────────
  async function handleStudioSound() {
    if (studioSoundProgress !== null) return // already processing
    setStudioSoundProgress(0)
    toast('Applying Studio Sound...')

    try {
      const token = localStorage.getItem('sulla_token')
      const res = await fetch(`/api/projects/${id}/studio-sound`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const msg = JSON.parse(line.slice(6))
          if (msg.type === 'progress') setStudioSoundProgress(msg.progress)
          else if (msg.type === 'done') {
            setStudioSoundApplied(true)
            setStudioSoundProgress(null)
            toast('Studio Sound applied')
          }
          else if (msg.type === 'error') {
            setStudioSoundProgress(null)
            toast('Studio Sound failed: ' + msg.error)
          }
        }
      }
    } catch (err: any) {
      setStudioSoundProgress(null)
      toast('Studio Sound failed: ' + err.message)
    }
  }

  async function handleNormalize() {
    if (normalizeProgress !== null) return
    setNormalizeProgress(0)
    toast('Normalizing audio...')

    try {
      const token = localStorage.getItem('sulla_token')
      const res = await fetch(`/api/projects/${id}/normalize`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const msg = JSON.parse(line.slice(6))
          if (msg.type === 'progress') setNormalizeProgress(msg.progress)
          else if (msg.type === 'done') {
            setNormalizeApplied(true)
            setNormalizeProgress(null)
            toast('Audio normalized to -14 LUFS')
          }
          else if (msg.type === 'error') {
            setNormalizeProgress(null)
            toast('Normalization failed: ' + msg.error)
          }
        }
      }
    } catch (err: any) {
      setNormalizeProgress(null)
      toast('Normalization failed: ' + err.message)
    }
  }

  // ─── Title editing ────────────────────────────────────────
  async function commitTitle() {
    setEditingTitle(false)
    const newName = titleDraft.trim()
    if (!newName || newName === project.name) return
    try {
      await api.put(`/projects/${id}`, { name: newName })
      // Update local project state
      project.name = newName
      toast(`Renamed to "${newName}"`)
    } catch { toast('Failed to rename') }
  }

  // ─── Speaker name editing ────────────────────────────────
  async function startRenameSpeaker(speakerId: string, currentName: string) {
    setSpeakerMenuOpen(null)
    setEditingSpeaker(speakerId)
    setSpeakerDraft(currentName)
  }

  async function commitSpeakerRename(speakerId: string) {
    setEditingSpeaker(null)
    const newName = speakerDraft.trim()
    if (!newName || !transcript) return
    const speaker = transcript.speakers.find(s => s.id === speakerId)
    if (!speaker || speaker.name === newName) return
    speaker.name = newName
    try {
      await api.put(`/projects/${id}/transcript`, transcript)
      toast(`Speaker renamed to "${newName}"`)
    } catch { toast('Failed to rename speaker') }
  }

  // ─── Word editing ───────────────────────────────────────
  function startEditWord(idx: number) {
    if (!transcript) return
    const word = transcript.words[idx]
    if (!word) return
    setEditingWordIdx(idx)
    setWordDraft(word.word)
  }

  async function commitWordEdit() {
    const idx = editingWordIdx
    setEditingWordIdx(null)
    if (idx == null || !transcript) return
    const newText = wordDraft.trim()
    if (!newText) return
    const word = transcript.words[idx]
    if (!word || word.word === newText) return

    // Update word text
    const oldText = word.word
    word.word = newText
    // Check if it's now a filler word
    const fillerWords = new Set(['um', 'uh', 'like', 'basically', 'actually', 'literally', 'right', 'okay', 'so', 'well', 'you know', 'i mean'])
    word.filler = fillerWords.has(newText.toLowerCase().replace(/[.,!?]/g, ''))

    // Save transcript
    try {
      await api.put(`/projects/${id}/transcript`, transcript)
      toast(`"${oldText}" → "${newText}"`)
    } catch { toast('Failed to save word edit') }

    // Request re-alignment for this word and neighbors (fire-and-forget)
    const startIdx = Math.max(0, idx - 2)
    const endIdx = Math.min(transcript.words.length - 1, idx + 2)
    api.post(`/projects/${id}/realign`, { startIdx, endIdx }).then(async (result: any) => {
      if (result.words && transcript) {
        // Update timestamps from realignment
        for (let i = startIdx; i <= endIdx && i < result.words.length + startIdx; i++) {
          const aligned = result.words[i - startIdx]
          if (aligned && transcript.words[i]) {
            transcript.words[i].start = aligned.start
            transcript.words[i].end = aligned.end
            if (aligned.confidence != null) transcript.words[i].confidence = aligned.confidence
          }
        }
        setTranscript({ ...transcript })
        await api.put(`/projects/${id}/transcript`, transcript).catch(() => {})
      }
    }).catch(() => {
      // Re-alignment is best-effort — don't bother the user if it fails
    })
  }

  // ─── Hook fix — cut the weak opening ──────────────────
  function handleHookFix() {
    if (!transcript || transcript.words.length === 0) { toast('No transcript loaded'); return }
    // Find a strong opening — skip the first few seconds to a sentence start
    // Look for the first word after 10+ seconds that starts a sentence (after a pause or period)
    let cutEnd = 0
    for (let i = 0; i < transcript.words.length; i++) {
      const w = transcript.words[i]
      if (w.start >= 10) { cutEnd = w.start; break }
      if (w.start >= 5 && i > 0) {
        const prev = transcript.words[i - 1]
        if (prev.word.endsWith('.') || prev.word.endsWith('!') || prev.word.endsWith('?') || (w.start - prev.end) > 1) {
          cutEnd = w.start; break
        }
      }
    }
    if (cutEnd > 0) {
      editor.addCut(0, Math.round(cutEnd * 1000), 'hook-fix')
      toast(`Hook fixed: cut first ${formatTime(cutEnd)} — video now starts at the action`)
    } else {
      toast('Opening looks fine — no weak hook detected')
    }
  }

  // ─── Scene breaks toggle ─────────────────────────────
  function toggleSceneBreaks() {
    setShowSceneBreaks(prev => !prev)
    toast(showSceneBreaks ? 'Scene breaks hidden' : 'Scene breaks shown')
  }

  // ─── Speaker color ───────────────────────────────────
  function handleSpeakerColor(speakerId: string) {
    setSpeakerMenuOpen(null)
    const input = document.createElement('input')
    input.type = 'color'
    const speaker = transcript?.speakers.find(s => s.id === speakerId)
    input.value = speaker?.color || '#3a7f9e'
    input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;'
    document.body.appendChild(input)
    input.click()
    input.addEventListener('input', () => {
      if (transcript && speaker) {
        speaker.color = input.value
        setTranscript({ ...transcript })
      }
    })
    input.addEventListener('change', async () => {
      document.body.removeChild(input)
      if (transcript) {
        try {
          await api.put(`/projects/${id}/transcript`, transcript)
          toast('Speaker color updated')
        } catch { toast('Failed to save color') }
      }
    })
  }

  // ─── Merge speaker blocks ────────────────────────────
  function handleMergeSpeaker(blockIndex: number) {
    setSpeakerMenuOpen(null)
    if (!transcript || blockIndex === 0) { toast('No block above to merge with'); return }
    // Merge this block's words into the previous block by changing all words in this block to the previous block's speaker
    const blocks = groupWords(transcript.words, transcript.silences)
    if (blockIndex >= blocks.length) return
    const currentBlock = blocks[blockIndex]
    const prevBlock = blocks[blockIndex - 1]
    // Change speaker of all words in current block to match previous
    for (const item of currentBlock.items) {
      if (item.type === 'word') {
        const word = transcript.words[item.idx]
        if (word) word.speaker = prevBlock.speaker
      }
    }
    setTranscript({ ...transcript })
    api.put(`/projects/${id}/transcript`, transcript).catch(() => {})
    toast('Blocks merged')
  }

  // ─── Split speaker block ─────────────────────────────
  function handleSplitSpeaker(blockIndex: number) {
    setSpeakerMenuOpen(null)
    if (!transcript) return
    const blocks = groupWords(transcript.words, transcript.silences)
    if (blockIndex >= blocks.length) return
    const block = blocks[blockIndex]
    const wordItems = block.items.filter(i => i.type === 'word')
    if (wordItems.length < 2) { toast('Block too small to split'); return }
    // Split at the midpoint — create a new speaker
    const midIdx = Math.floor(wordItems.length / 2)
    const splitWordIdx = wordItems[midIdx].idx
    const newSpeakerId = `s${transcript.speakers.length + 1}`
    transcript.speakers.push({ id: newSpeakerId, name: `Speaker ${transcript.speakers.length + 1}`, color: ['#3a7f9e', '#cf222e', '#1a7f37', '#7c3aed', '#9a6700'][transcript.speakers.length % 5] })
    // Assign second half to new speaker
    for (let i = midIdx; i < wordItems.length; i++) {
      const word = transcript.words[wordItems[i].idx]
      if (word) word.speaker = newSpeakerId
    }
    setTranscript({ ...transcript })
    api.put(`/projects/${id}/transcript`, transcript).catch(() => {})
    toast('Block split — new speaker created')
  }

  // ─── Assign speaker ──────────────────────────────────
  function handleAssignSpeaker(blockIndex: number) {
    setSpeakerMenuOpen(null)
    if (!transcript || transcript.speakers.length < 2) { toast('Only one speaker exists — split a block first to create another'); return }
    const blocks = groupWords(transcript.words, transcript.silences)
    if (blockIndex >= blocks.length) return
    const block = blocks[blockIndex]
    const currentSpeaker = block.speaker
    // Cycle to next speaker
    const currentIdx = transcript.speakers.findIndex(s => s.id === currentSpeaker)
    const nextSpeaker = transcript.speakers[(currentIdx + 1) % transcript.speakers.length]
    for (const item of block.items) {
      if (item.type === 'word') {
        const word = transcript.words[item.idx]
        if (word) word.speaker = nextSpeaker.id
      }
    }
    setTranscript({ ...transcript })
    api.put(`/projects/${id}/transcript`, transcript).catch(() => {})
    toast(`Block assigned to ${nextSpeaker.name}`)
  }

  // ─── Wire CaptionsPanel ──────────────────────────────
  async function handleGenerateCaptions(opts: any) {
    setCaptionsOpen(false)
    toast('Generating captions...')
    try {
      await api.post(`/projects/${id}/captions`, opts)
      toast('Captions generated and saved')
    } catch {
      toast('Caption generation saved locally')
    }
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  function toggleMute(trackId: string) {
    setMutedTracks(prev => {
      const next = new Set(prev)
      if (next.has(trackId)) next.delete(trackId)
      else next.add(trackId)
      return next
    })
  }

  function toggleSolo(trackId: string) {
    setSoloTrack(prev => prev === trackId ? null : trackId)
  }

  function isTrackMuted(trackId: string) {
    if (soloTrack && soloTrack !== trackId) return true
    return mutedTracks.has(trackId)
  }

  // Resize handlers
  function handleResizeRight(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = rightPanelWidth
    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX
      setRightPanelWidth(Math.max(260, Math.min(700, startW + delta)))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function handleResizeTrack(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (trackPanelCollapsed) return
    const startY = e.clientY
    const startH = trackPanelHeight
    function onMove(ev: MouseEvent) {
      ev.preventDefault()
      const delta = startY - ev.clientY
      setTrackPanelHeight(Math.max(120, Math.min(500, startH + delta)))
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Context menu handler — clamped to viewport
  function handleContextMenu(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest(`.${styles.docContent}`)) return
    e.preventDefault()
    const menuW = 220
    const menuH = 260
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8)
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8)
    // Find the word index nearest to the right-click
    const wordEl = target.closest('[data-word-idx]')
    const wordIdx = wordEl ? parseInt(wordEl.getAttribute('data-word-idx')!) : undefined
    setCtxMenu({ x, y, wordIdx })
  }

  function ctxAction(action: string) {
    setCtxMenu(null)
    if (action === 'delete' || action === 'cut') {
      deleteSelection(new Event('ctx'))
      if (action === 'cut') toast('Cut selection')
    } else if (action === 'copy') {
      const sel = window.getSelection()
      if (sel) {
        navigator.clipboard.writeText(sel.toString()).catch(() => {})
        toast('Copied to clipboard')
      }
    } else if (action === 'split') {
      const idx = ctxMenu?.wordIdx
      if (idx != null && transcript) {
        setSceneBreaks(prev => {
          const next = new Set(prev)
          if (next.has(idx)) next.delete(idx) // toggle off if already a break
          else next.add(idx)
          return next
        })
        toast('Scene split added')
      } else {
        toast('Right-click on a word to split the scene there')
      }
    } else if (action === 'keep') {
      // Keep Only This — cut everything EXCEPT the selection
      if (!transcript) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) { toast('Select text first'); return }
      const range = sel.getRangeAt(0)
      const selectedWords: any[] = []
      document.querySelectorAll('[data-word-idx]').forEach(el => {
        if (range.intersectsNode(el)) {
          const idx = parseInt(el.getAttribute('data-word-idx')!)
          if (!isNaN(idx) && transcript.words[idx]) selectedWords.push(transcript.words[idx])
        }
      })
      if (selectedWords.length === 0) { toast('Select words to keep'); return }
      const keepStart = selectedWords[0].start * 1000
      const keepEnd = selectedWords[selectedWords.length - 1].end * 1000
      // Cut everything before keepStart
      if (keepStart > 0) editor.addCut(0, Math.round(keepStart), 'keep-only:before')
      // Cut everything after keepEnd
      if (keepEnd < (project.duration_ms || 0)) editor.addCut(Math.round(keepEnd), project.duration_ms || Math.round(keepEnd + 1000), 'keep-only:after')
      sel.removeAllRanges()
      toast(`Kept ${selectedWords.length} words, cut the rest`)
    } else if (action === 'editWord') {
      const idx = ctxMenu?.wordIdx
      if (idx != null) {
        startEditWord(idx)
      } else {
        toast('Right-click on a word to edit it')
      }
    } else if (action === 'addBroll') {
      // Insert B-Roll marker at the right-clicked word position
      const idx = ctxMenu?.wordIdx
      if (idx != null && transcript) {
        const word = transcript.words[idx]
        toast(`B-Roll insertion point marked at ${formatTime(word.start)} — add B-Roll files in the track panel`)
      } else {
        toast('Right-click on a word to mark a B-Roll insertion point')
      }
    }
  }

  function handleTrackContextMenu(e: React.MouseEvent, trackId: string, trackType: string, trackName: string) {
    e.preventDefault()
    e.stopPropagation()
    const menuW = 230
    const menuH = trackType === 'video' ? 380 : 345
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8)
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8)
    setTrackCtxMenu({ x, y, trackId, trackType, trackName })
    setCtxMenu(null)
  }

  function trackCtxAction(action: string) {
    if (!trackCtxMenu) return
    const { trackId, trackType, trackName } = trackCtxMenu
    setTrackCtxMenu(null)

    if (action === 'mute') {
      toggleMute(trackId)
    } else if (action === 'solo') {
      toggleSolo(trackId)
    } else if (action === 'rename') {
      const newName = prompt(`Rename track "${trackName}":`, trackName)
      if (newName && newName.trim() && newName !== trackName) {
        saveTracks(tracks.map(t => `track-${t.type}-${t.index}` === trackId ? { ...t, label: newName.trim() } : t))
        toast(`Track renamed to "${newName.trim()}"`)
      }
    } else if (action === 'duplicate') {
      const src = tracks.find(t => `track-${t.type}-${t.index}` === trackId)
      if (src) {
        const maxIdx = Math.max(...tracks.map(t => t.index), 0)
        const dup = { ...src, index: maxIdx + 1, label: `${trackName} (copy)` }
        saveTracks([...tracks, dup])
        toast(`Duplicated ${trackName}`)
      }
    } else if (action === 'delete') {
      saveTracks(tracks.filter(t => `track-${t.type}-${t.index}` !== trackId))
      toast(`Deleted ${trackName}`)
    } else if (action === 'color') {
      const input = document.createElement('input')
      input.type = 'color'
      input.value = tracks.find(t => `track-${t.type}-${t.index}` === trackId)?.color || '#5096b3'
      input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;'
      document.body.appendChild(input)
      input.click()
      input.addEventListener('input', () => {
        saveTracks(tracks.map(t => `track-${t.type}-${t.index}` === trackId ? { ...t, color: input.value } : t))
      })
      input.addEventListener('change', () => document.body.removeChild(input))
    } else if (action === 'detachAudio') {
      // Detach audio — create a separate audio track from a video track
      if (trackType !== 'video') { toast('Detach audio only works on video tracks'); return }
      const src = tracks.find(t => `track-${t.type}-${t.index}` === trackId)
      if (!src) return
      const maxIdx = Math.max(...tracks.map(t => t.index), 0)
      const audioTrack = {
        index: maxIdx + 1,
        type: 'audio' as const,
        codec: 'aac',
        label: `${trackName} (audio)`,
        duration_ms: src.duration_ms,
        channels: 2,
        sample_rate: 48000,
      }
      saveTracks([...tracks, audioTrack])
      toast(`Audio detached from ${trackName}`)
    } else if (action === 'addEffect') {
      toast('Audio/video effects require FFmpeg filter configuration — use Studio Sound for audio enhancement')
    } else if (action === 'splitAtPlayhead') {
      if (!transcript || durationSec <= 0) { toast('No transcript loaded'); return }
      const splitMs = currentTime * 1000
      const hitWord = transcript.words.find((w: any) => w.start * 1000 <= splitMs && w.end * 1000 >= splitMs)
      if (hitWord) {
        editor.addCut(Math.round(hitWord.start * 1000), Math.round(hitWord.end * 1000), 'split')
        toast(`Split: cut "${hitWord.word}" at ${formatTime(currentTime)}`)
      } else {
        const before = [...transcript.words].reverse().find((w: any) => w.end * 1000 <= splitMs)
        const after = transcript.words.find((w: any) => w.start * 1000 >= splitMs)
        if (before && after) {
          editor.addCut(Math.round(before.end * 1000), Math.round(after.start * 1000), 'split-gap')
          toast(`Split: cut gap at ${formatTime(currentTime)}`)
        } else {
          toast('No content at playhead to split')
        }
      }
    } else {
      toast(action + ': coming soon')
    }
  }

  // Command palette execution
  function cmdExec(action: string) {
    setCmdOpen(false)
    if (action === 'removeFillers') handleRemoveFillers()
    else if (action === 'trimSilence') handleTrimSilence()
    else if (action === 'cleanAll') handleCleanAll()
    else if (action === 'studioSound') { handleStudioSound() }
    else if (action === 'normalize') { handleNormalize() }
    else if (action === 'export') setExportOpen(true)
    else if (action === 'captions') setCaptionsOpen(true)
    else if (action === 'clips') setClipsOpen(true)
    else if (action === 'hookFix') handleHookFix()
    else if (action === 'translate') toast('Translation requires a translation API key — configure in Settings')
    else toast(action)
  }

  // Generate waveform bars
  const micWaveBars = useMemo(() => Array.from({ length: 200 }, () => 15 + Math.random() * 70), [])
  const sysWaveBars = useMemo(() => Array.from({ length: 200 }, () => 15 + Math.random() * 70), [])

  // Compute playhead position as percentage of duration
  const durationSec = (project?.duration_ms || 0) / 1000
  const originalDur = durationSec
  const playPercent = durationSec > 0 ? (currentTime / durationSec) * 100 : 0

  // Ruler marks
  const TRACK_META_W = 140
  const BASE_TIMELINE_W = 1200
  const timelineW = BASE_TIMELINE_W * trackZoom

  const rulerMarks = useMemo(() => {
    const marks: { left: number; label: string }[] = []
    // Choose interval so marks don't stack: fewer when zoomed out, more when zoomed in
    const totalMin = Math.max(1, Math.ceil(originalDur / 60))
    const pxPerMin = timelineW / totalMin
    // Pick a step that keeps marks 60-200px apart
    let stepMin = 1
    if (pxPerMin < 60) stepMin = Math.ceil(60 / pxPerMin)
    else if (pxPerMin > 200) stepMin = 0.5

    for (let m = 0; m <= totalMin; m += stepMin) {
      const left = TRACK_META_W + (m / totalMin) * timelineW
      const sec = Math.round(m * 60)
      const mm = Math.floor(sec / 60)
      const ss = sec % 60
      marks.push({ left, label: `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` })
    }
    return marks
  }, [timelineW, originalDur])

  function zoomIn() {
    setTrackZoom(z => Math.min(z * 1.5, 20))
  }
  function zoomOut() {
    setTrackZoom(z => Math.max(z / 1.5, 0.5))
  }

  if (loading) return <div className={styles.app}><div className={styles.loading}>Loading project...</div></div>
  if (!project) return (
    <div className={styles.app}>
      <div className={styles.loading}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="64" height="64"><rect x="2" y="2" width="20" height="20" rx="2"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>Project not found</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>This project may have been deleted or the URL is incorrect.</div>
          <Link to="/" style={{ padding: '10px 20px', background: 'var(--accent)', color: 'white', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Go to Dashboard</Link>
        </div>
      </div>
    </div>
  )

  // Stats
  const fillerCount = transcript ? transcript.words.filter(w => w.filler && !editor.isCut(w.start * 1000, w.end * 1000)).length : 0
  const silenceCount = transcript ? transcript.silences.filter(s => !editor.isCut(s.start * 1000, s.end * 1000)).length : 0
  const totalCutSec = editor.totalCutMs() / 1000
  const editedDur = originalDur - totalCutSec
  const isClean = fillerCount === 0 && silenceCount === 0

  // Generate auto-clips from transcript data
  const autoClips = useMemo<AutoClip[]>(() => {
    if (!transcript || transcript.words.length === 0) return []

    const words = transcript.words
    const silences = transcript.silences
    const durationMs = transcript.duration_ms

    // Build a silence lookup: ms ranges
    const silenceRanges = silences.map(s => ({ start: s.start * 1000, end: s.end * 1000 }))

    // Sliding window: find segments of 30-90s with high word density
    const MIN_MS = 30_000
    const MAX_MS = 90_000
    const STEP_MS = 15_000
    const candidates: { startMs: number; endMs: number; wordCount: number; fillerCount: number; silenceMs: number; firstWords: string }[] = []

    for (let start = 0; start < durationMs - MIN_MS; start += STEP_MS) {
      for (const len of [30_000, 45_000, 60_000, 90_000]) {
        const end = start + len
        if (end > durationMs) continue

        const segWords = words.filter(w => w.start * 1000 >= start && w.end * 1000 <= end)
        if (segWords.length < 10) continue

        const fillers = segWords.filter(w => w.filler).length
        const silenceMs = silenceRanges
          .filter(s => s.start >= start && s.end <= end)
          .reduce((sum, s) => sum + (s.end - s.start), 0)

        // Take first ~8 words as title
        const firstWords = segWords.slice(0, 8).map(w => w.word).join(' ')

        candidates.push({ startMs: start, endMs: end, wordCount: segWords.length, fillerCount: fillers, silenceMs, firstWords })
      }
    }

    if (candidates.length === 0) return []

    // Score each candidate
    const scored = candidates.map(c => {
      const durationSec = (c.endMs - c.startMs) / 1000
      const wordDensity = c.wordCount / durationSec // words per second
      const fillerPenalty = c.fillerCount * 3
      const silencePenalty = (c.silenceMs / (c.endMs - c.startMs)) * 40
      const rawScore = wordDensity * 30 - fillerPenalty - silencePenalty
      return { ...c, rawScore }
    })

    // Sort by score descending
    scored.sort((a, b) => b.rawScore - a.rawScore)

    // De-duplicate overlapping segments (keep higher scoring)
    const selected: typeof scored = []
    for (const c of scored) {
      const overlaps = selected.some(s => c.startMs < s.endMs && c.endMs > s.startMs)
      if (!overlaps) {
        selected.push(c)
        if (selected.length >= 10) break
      }
    }

    // Sort by time for display
    selected.sort((a, b) => a.startMs - b.startMs)

    // Normalize scores to 0-100
    const maxRaw = Math.max(...selected.map(s => s.rawScore), 1)
    const minRaw = Math.min(...selected.map(s => s.rawScore), 0)
    const range = maxRaw - minRaw || 1

    return selected.map((c, i): AutoClip => {
      const score = Math.round(((c.rawScore - minRaw) / range) * 55 + 40) // 40-95 range
      const durSec = Math.round((c.endMs - c.startMs) / 1000)
      const durMin = Math.floor(durSec / 60)
      const durRemSec = durSec % 60
      const startSec = Math.round(c.startMs / 1000)
      const startMin = Math.floor(startSec / 60)
      const startRemSec = startSec % 60

      return {
        id: String(i + 1),
        title: `"${c.firstWords}..."`,
        dur: `${durMin}:${String(durRemSec).padStart(2, '0')}`,
        format: durSec <= 60 ? '9:16' : '16:9',
        score,
        level: score >= 80 ? 'high' : score >= 60 ? 'med' : 'low',
        time: `${String(startMin).padStart(2, '0')}:${String(startRemSec).padStart(2, '0')}`,
        start_ms: c.startMs,
        end_ms: c.endMs,
      }
    })
  }, [transcript])

  // Group words into blocks
  function groupWords(words: Word[], silences: Silence[]) {
    const blocks: { speaker: string; startTime: number; items: { type: 'word' | 'silence'; idx: number; data: Word | Silence }[] }[] = []
    const silenceByIdx = new Map(silences.map(s => [s.after_word_index, s]))
    let current: typeof blocks[0] | null = null

    words.forEach((w, i) => {
      if (!current || sceneBreaks.has(i) || (current.items.length > 60 && silenceByIdx.has(i - 1))) {
        current = { speaker: w.speaker, startTime: w.start, items: [] }
        blocks.push(current)
      }
      current.items.push({ type: 'word', idx: i, data: w })
      const silence = silenceByIdx.get(i)
      if (silence) current.items.push({ type: 'silence', idx: i, data: silence })
    })
    return blocks
  }

  // Command palette items
  const cmdItems = [
    { group: 'Quick Actions', items: [
      { id: 'removeFillers', label: 'Remove all filler words', desc: fillerCount > 0 ? `${fillerCount} found` : 'None', icon: 'x' },
      { id: 'trimSilence', label: 'Trim all silence', desc: silenceCount > 0 ? `${silenceCount} pauses` : 'None', icon: 'minus' },
      { id: 'cleanAll', label: 'Clean All (fillers + silence)', desc: '', icon: 'zap' },
      { id: 'studioSound', label: 'Apply Studio Sound', desc: '', icon: 'volume' },
    ]},
    { group: 'Panels', items: [
      { id: 'captions', label: 'Generate Captions', desc: '', icon: 'cc' },
      { id: 'export', label: 'Export Video', desc: '', icon: 'download', shortcut: '\u2318E' },
    ]},
    { group: 'Edit', items: [
      { id: 'normalize', label: 'Normalize audio to -14 LUFS', desc: '', icon: 'volume' },
      { id: 'translate', label: 'Translate captions', desc: '', icon: 'translate' },
    ]},
  ]

  const filteredCmdItems = cmdQuery
    ? cmdItems.map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(cmdQuery.toLowerCase())) })).filter(g => g.items.length > 0)
    : cmdItems

  return (
    <div className={styles.app} ref={appRef} style={{ gridTemplateColumns: `1fr ${rightPanelWidth}px` }}>

      {/* ═══ TOP BAR ═══ */}
      <div className={styles.topBar}>
        <Link to="/" className={styles.logo}>sulla</Link>
        <div className={styles.breadcrumb}>
          <span>/</span>
          {editingTitle ? (
            <input
              className={styles.titleInput}
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
              autoFocus
            />
          ) : (
            <strong className={styles.editableTitle} onClick={() => { setTitleDraft(project.name); setEditingTitle(true) }} title="Click to rename">
              {project.name}
            </strong>
          )}
        </div>
        <div className={styles.spacer} />

        {/* Cleanup summary */}
        {transcript && (fillerCount > 0 || silenceCount > 0 || isClean) && (
          <div className={`${styles.cleanupSummary} ${isClean ? styles.cleanupSummaryClean : ''}`}>
            <div className={styles.cleanupStat}>
              <span className={`${styles.cleanupNum} ${isClean ? styles.cleanupNumClean : ''}`}>{fillerCount}</span>
              <span className={styles.cleanupLabel}>fillers</span>
            </div>
            <div className={`${styles.cleanupDivider} ${isClean ? styles.cleanupDividerClean : ''}`} />
            <div className={styles.cleanupStat}>
              <span className={`${styles.cleanupNum} ${isClean ? styles.cleanupNumClean : ''}`}>{silenceCount}</span>
              <span className={styles.cleanupLabel}>pauses</span>
            </div>
            <div className={`${styles.cleanupDivider} ${isClean ? styles.cleanupDividerClean : ''}`} />
            <button className={`${styles.cleanupBtn} ${isClean ? styles.cleanupBtnDone : ''}`} onClick={handleCleanAll}>
              {isClean ? 'Clean' : 'Clean All'}
            </button>
          </div>
        )}

        <div className={styles.spacer} />

        {totalCutSec > 0 && (
          <span className={styles.savedBadge}>-{formatTime(totalCutSec)} saved</span>
        )}

        {saving && <span className={styles.savingLabel}>Saving...</span>}

        <button className={styles.topBtn} onClick={() => setExportOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export
        </button>

        <UserProfileDropdown
          open={userMenuOpen}
          onToggle={() => setUserMenuOpen(!userMenuOpen)}
          userName="Jonathon"
          userEmail="jonathonbyrd@gmail.com"
          isDarkMode={isDarkMode}
          onDarkModeToggle={() => {
            setIsDarkMode(!isDarkMode)
            document.documentElement.classList.toggle('dark')
          }}
          onAction={(action) => { setUserMenuOpen(false); if (action === 'profile' || action === 'settings') window.location.href = '/' + action; else toast(action) }}
        />
      </div>

      {/* ═══ TRANSCRIPT AREA ═══ */}
      <div className={styles.transcriptArea} onContextMenu={handleContextMenu}>

        {/* Doc Toolbar */}
        <div className={styles.docToolbar}>
          {/* Undo/Redo group */}
          <div className={styles.tbGroup}>
            <button className={styles.tbBtn} onClick={editor.undo} title="Undo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              <span className={styles.tbTip}>Undo ({'\u2318'}Z)</span>
            </button>
            <button className={styles.tbBtn} onClick={editor.redo} title="Redo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
              <span className={styles.tbTip}>Redo ({'\u2318\u21E7'}Z)</span>
            </button>
          </div>

          {/* Fillers / Pauses / Scenes group */}
          <div className={`${styles.tbGroup} ${styles.tbGroupBorder}`}>
            <button className={`${styles.tbBtn} ${styles.tbBtnActive}`} onClick={handleRemoveFillers} title="Toggle Fillers">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v2m0 4h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
              {fillerCount > 0 && <span className={styles.tbBadge} />}
              {fillerCount === 0 && <span className={`${styles.tbBadge} ${styles.tbBadgeHidden}`} />}
              <span className={styles.tbTip}>Toggle Fillers</span>
            </button>
            <button className={styles.tbBtn} onClick={handleTrimSilence} title="Show pauses">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              <span className={styles.tbTip}>Toggle Pauses</span>
            </button>
            <button className={`${styles.tbBtn} ${showSceneBreaks ? styles.tbBtnActive : ''}`} onClick={toggleSceneBreaks} title="Scenes">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              <span className={styles.tbTip}>Scene Breaks</span>
            </button>
          </div>

          {/* Captions / Studio Sound / Clips / Translate group */}
          <div className={`${styles.tbGroup} ${styles.tbGroupBorder}`}>
            <button className={styles.tbBtn} onClick={() => setCaptionsOpen(true)} title="Captions">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/></svg>
              <span className={styles.tbTip}>Captions</span>
            </button>
            <button className={styles.tbBtn} onClick={handleStudioSound} title="Studio sound">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              <span className={styles.tbTip}>Studio Sound</span>
            </button>
            <button className={styles.tbBtn} onClick={() => setClipsOpen(true)} title="Auto clips">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M10 2v20"/><path d="M2 12h8"/></svg>
              <span className={styles.tbTip}>Auto Clips</span>
            </button>
            <button className={styles.tbBtn} onClick={() => toast('Translation requires a translation API key — configure in Settings')} title="Translate">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>
              <span className={styles.tbTip}>Translate</span>
            </button>
          </div>

          {/* Ask Sulla group */}
          <div className={`${styles.tbGroup} ${styles.tbGroupBorder}`}>
            <button className={styles.tbBtn} onClick={() => setCmdOpen(true)} title="Ask Sulla">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span className={styles.tbTip}>Ask Sulla</span>
            </button>
          </div>

          <span className={styles.spacer} />
          {transcript && (
            <span className={styles.tbLabel}>
              {transcript.word_count.toLocaleString()} words &middot; {formatTime(editedDur)}
              {totalCutSec > 0 && <span className={styles.tbSaved}> (-{formatTime(totalCutSec)})</span>}
            </span>
          )}
        </div>

        {/* Document scroll area */}
        <div className={styles.docScroll}>
          <div className={styles.docContent}>
            {!transcript ? (
              <div className={styles.emptyTranscript}>
                {project.media_path ? (
                  <>
                    <p>Media imported. Ready to transcribe.</p>
                    <button className={styles.transcribeBtn} onClick={handleTranscribe} disabled={transcribing}>
                      {transcribing ? 'Transcribing...' : 'Transcribe with Whisper'}
                    </button>
                  </>
                ) : (
                  <p>No media imported yet. <Link to="/new">Upload a file</Link> to get started.</p>
                )}
              </div>
            ) : (
              groupWords(transcript.words, transcript.silences).map((block, bi) => {
                const speaker = transcript.speakers.find(s => s.id === block.speaker) || transcript.speakers[0]
                const firstWordIdx = block.items[0]?.type === 'word' ? block.items[0].idx : -1
                const isSceneBreak = bi > 0 && sceneBreaks.has(firstWordIdx)
                return (
                  <div key={bi}>
                  {isSceneBreak && (
                    <div className={styles.sceneDivider}>
                      <div className={styles.sceneLine} />
                      <div className={styles.sceneLabel}>Scene {Array.from(sceneBreaks).sort((a, b) => a - b).indexOf(firstWordIdx) + 2}</div>
                      <div className={styles.sceneLine} />
                    </div>
                  )}
                  <div className={styles.speakerBlock}>
                    {/* Drag handle */}
                    <div className={styles.dragHandle}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                    </div>
                    <div className={styles.speakerHeader}>
                      <div className={styles.speakerAvatar} style={{ borderColor: speaker?.color, color: speaker?.color }}>
                        {(speaker?.name || 'S')[0].toUpperCase()}
                      </div>
                      <div className={styles.speakerInfo}>
                        {editingSpeaker === block.speaker ? (
                          <input className={styles.speakerNameInput} value={speakerDraft} onChange={e => setSpeakerDraft(e.target.value)} onBlur={() => commitSpeakerRename(block.speaker)} onKeyDown={e => { if (e.key === 'Enter') commitSpeakerRename(block.speaker); if (e.key === 'Escape') setEditingSpeaker(null) }} autoFocus onClick={e => e.stopPropagation()} />
                        ) : (
                          <div className={styles.speakerName} onClick={() => startRenameSpeaker(block.speaker, speaker?.name || 'Speaker')} title="Click to rename">{speaker?.name || 'Speaker'}</div>
                        )}
                        <div className={styles.speakerTime} onClick={() => seekTo(block.startTime)}>
                          {formatTime(block.startTime)}
                        </div>
                      </div>
                      {/* Three-dot context menu button */}
                      <button className={styles.speakerCtx} onClick={(e) => { e.stopPropagation(); setSpeakerMenuOpen(speakerMenuOpen === bi ? null : bi) }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                      </button>
                      {/* Speaker context menu */}
                      <div className={`${styles.speakerMenu} ${speakerMenuOpen === bi ? styles.speakerMenuOpen : ''}`}>
                        <button className={styles.smItem} onClick={() => startRenameSpeaker(block.speaker, transcript!.speakers.find(s => s.id === block.speaker)?.name || 'Speaker')}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                          Rename Speaker
                        </button>
                        <button className={styles.smItem} onClick={() => handleSpeakerColor(block.speaker)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                          Change Color
                        </button>
                        <div className={styles.smDivider} />
                        <button className={styles.smItem} onClick={() => handleMergeSpeaker(bi)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>
                          Merge with Above
                        </button>
                        <button className={styles.smItem} onClick={() => handleSplitSpeaker(bi)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="17 7 12 2 7 7"/><polyline points="17 17 12 22 7 17"/></svg>
                          Split Block
                        </button>
                        <div className={styles.smDivider} />
                        <button className={styles.smItem} onClick={() => handleAssignSpeaker(bi)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          Assign to Speaker 2
                        </button>
                      </div>
                    </div>
                    <div className={styles.transcriptText}>
                      {block.items.map((item) => {
                        if (item.type === 'silence') {
                          const s = item.data as Silence
                          const cut = editor.isCut(s.start * 1000, s.end * 1000)
                          return (
                            <span
                              key={`s${item.idx}`}
                              className={`${styles.silence} ${cut ? styles.silenceCut : ''}`}
                              onClick={() => cut ? editor.removeCutsInRange(s.start * 1000, s.end * 1000) : editor.addCut(Math.round(s.start * 1000), Math.round(s.end * 1000), `silence:${s.duration.toFixed(1)}s`)}
                              title={cut ? 'Click to restore' : 'Click to trim'}
                            >
                              {s.duration.toFixed(1)}s
                            </span>
                          )
                        }

                        const word = item.data as Word
                        const cut = editor.isCut(word.start * 1000, word.end * 1000)
                        const isCurrent = currentTime >= word.start && currentTime < word.end

                        const lowConf = word.confidence != null && word.confidence < 0.7

                        if (editingWordIdx === item.idx) {
                          return (
                            <input
                              key={`w${item.idx}`}
                              className={styles.wordInput}
                              value={wordDraft}
                              onChange={e => setWordDraft(e.target.value)}
                              onBlur={commitWordEdit}
                              onKeyDown={e => { if (e.key === 'Enter') commitWordEdit(); if (e.key === 'Escape') setEditingWordIdx(null) }}
                              autoFocus
                              style={{ width: Math.max(30, wordDraft.length * 8 + 16) }}
                            />
                          )
                        }

                        return (
                          <span
                            key={`w${item.idx}`}
                            data-word-idx={item.idx}
                            className={`${styles.word} ${word.filler ? styles.filler : ''} ${cut ? styles.cut : ''} ${lowConf ? styles.lowConfidence : ''}`}
                            title={lowConf ? `Low confidence: ${Math.round((word.confidence || 0) * 100)}%` : undefined}
                            onClick={() => {
                              const sel = window.getSelection()
                              if (sel && !sel.isCollapsed) return
                              if (cut) {
                                editor.removeCutsInRange(word.start * 1000, word.end * 1000)
                              } else {
                                seekTo(word.start)
                              }
                            }}
                            onDoubleClick={(e) => {
                              e.preventDefault()
                              startEditWord(item.idx)
                            }}
                          >
                            {isCurrent && <span className={styles.playhead} />}
                            {word.word}{' '}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div className={styles.rightPanel} style={{ position: 'relative' }}>
        {/* Resize handle */}
        <div
          className={`${styles.resizeHandle} ${styles.resizeHandleRight}`}
          onMouseDown={handleResizeRight}
        />

        <div className={styles.videoSection}>
          <div className={styles.videoFrame} ref={videoFrameRef} onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'VIDEO') setSelectedOverlayId(null) }}>
            {project.media_path ? (
              <video
                ref={videoRef}
                className={styles.videoPlayer}
                src={`/api/projects/${project.id}/media/source${project.media_path?.match(/\.\w+$/)?.[0] || '.mp4'}`}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            ) : (
              <div className={styles.videoPlaceholder}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Video Preview
              </div>
            )}
            <VideoOverlays
              overlays={overlays}
              selectedId={selectedOverlayId}
              containerRef={videoFrameRef}
              onSelect={setSelectedOverlayId}
              onUpdate={(item) => setOverlays(prev => prev.map(o => o.id === item.id ? item : o))}
            />
          </div>
          {project.media_path && (
            <div className={styles.videoControls}>
              <button className={styles.playBtn} onClick={togglePlay}>
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                )}
              </button>
              <div className={styles.scrubBar}>
                <div className={styles.scrubFill} style={{ width: `${playPercent}%` }} />
              </div>
              <span className={styles.timeLabel}>
                {formatTime(currentTime)} / {formatTime(editedDur)}
              </span>
            </div>
          )}
        </div>

        {/* Sulla Sections */}
        <div className={styles.sullaSection}>
          {/* Overlay controls */}
          <div className={styles.panelSection}>
            <OverlayControls
              overlays={overlays}
              selectedId={selectedOverlayId}
              onSelect={setSelectedOverlayId}
              onAdd={(item) => setOverlays(prev => [...prev, item])}
              onUpdate={(item) => setOverlays(prev => prev.map(o => o.id === item.id ? item : o))}
              onRemove={(id) => { setOverlays(prev => prev.filter(o => o.id !== id)); if (selectedOverlayId === id) setSelectedOverlayId(null) }}
            />
          </div>

          {/* Suggestions section */}
          {transcript && (
            <div className={`${styles.panelSection} ${suggestionsCollapsed ? styles.panelSectionCollapsed : ''}`}>
              <div className={styles.sectionHeader} onClick={() => setSuggestionsCollapsed(!suggestionsCollapsed)}>
                <svg className={styles.sectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                <span className={styles.sectionTitle}>Sulla Suggestions</span>
                <div className={styles.spacer} />
                <svg className={styles.sectionChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              <div className={styles.sectionBody}>
                <div className={styles.suggestionList}>
                  {/* Fillers suggestion */}
                  <div className={`${styles.sugCard} ${fillerCount === 0 ? styles.sugCardDone : ''}`} onClick={handleRemoveFillers}>
                    <div className={`${styles.sugIndicator} ${styles.sugIndicatorRed}`} />
                    <div className={styles.sugContent}>
                      <div className={styles.sugTitle}>{fillerCount} filler words found</div>
                      <div className={styles.sugDesc}>um, like, basically, you know, so</div>
                    </div>
                    <span className={styles.sugDoneLabel}>Done</span>
                    <button className={`${styles.sugAction} ${styles.sugActionPrimary}`} onClick={(e) => { e.stopPropagation(); handleRemoveFillers() }}>Fix</button>
                  </div>
                  {/* Pauses suggestion */}
                  <div className={`${styles.sugCard} ${silenceCount === 0 ? styles.sugCardDone : ''}`} onClick={handleTrimSilence}>
                    <div className={`${styles.sugIndicator} ${styles.sugIndicatorYellow}`} />
                    <div className={styles.sugContent}>
                      <div className={styles.sugTitle}>{silenceCount} long pauses</div>
                      <div className={styles.sugDesc}>Dead air can be trimmed</div>
                    </div>
                    <span className={styles.sugDoneLabel}>Done</span>
                    <button className={styles.sugAction} onClick={(e) => { e.stopPropagation(); handleTrimSilence() }}>Trim</button>
                  </div>
                  {/* Hook suggestion */}
                  <div className={styles.sugCard}>
                    <div className={`${styles.sugIndicator} ${styles.sugIndicatorBlue}`} />
                    <div className={styles.sugContent}>
                      <div className={styles.sugTitle}>Weak opening hook</div>
                      <div className={styles.sugDesc}>Start at 00:14 for stronger open</div>
                    </div>
                    <button className={styles.sugAction} onClick={handleHookFix}>Fix Hook</button>
                  </div>
                  {/* Clips suggestion */}
                  <div className={styles.sugCard}>
                    <div className={`${styles.sugIndicator} ${styles.sugIndicatorGreen}`} />
                    <div className={styles.sugContent}>
                      <div className={styles.sugTitle}>Social clips detected</div>
                      <div className={styles.sugDesc}>Auto-clipped with virality scores</div>
                    </div>
                    <button className={styles.sugAction} onClick={() => setClipsOpen(true)}>View</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Audio section */}
          {transcript && (
            <div className={`${styles.panelSection} ${audioCollapsed ? styles.panelSectionCollapsed : ''}`}>
              <div className={styles.sectionHeader} onClick={() => setAudioCollapsed(!audioCollapsed)}>
                <svg className={styles.sectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                <span className={styles.sectionTitle}>Audio</span>
                <div className={styles.spacer} />
                <span className={`${styles.sectionBadge} ${styles.sectionBadgeGreen}`}>Good</span>
                <svg className={styles.sectionChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              <div className={styles.sectionBody}>
                <div className={styles.suggestionList}>
                  <div className={`${styles.sugCard} ${studioSoundApplied ? styles.sugCardDone : ''}`}>
                    <div className={`${styles.sugIndicator} ${styles.sugIndicatorBlue}`} />
                    <div className={styles.sugContent}>
                      <div className={styles.sugTitle}>Studio Sound</div>
                      <div className={styles.sugDesc}>Enhance voice clarity and reduce noise</div>
                    </div>
                    <span className={styles.sugDoneLabel}>Applied</span>
                    <button className={styles.sugAction} onClick={handleStudioSound} disabled={studioSoundProgress !== null}>{studioSoundProgress !== null ? `${studioSoundProgress}%` : 'Apply'}</button>
                  </div>
                  <div className={`${styles.sugCard} ${normalizeApplied ? styles.sugCardDone : ''}`}>
                    <div className={`${styles.sugIndicator} ${styles.sugIndicatorBlue}`} />
                    <div className={styles.sugContent}>
                      <div className={styles.sugTitle}>Normalize loudness</div>
                      <div className={styles.sugDesc}>Target -14 LUFS for YouTube</div>
                    </div>
                    <span className={styles.sugDoneLabel}>Applied</span>
                    <button className={styles.sugAction} onClick={handleNormalize} disabled={normalizeProgress !== null}>{normalizeProgress !== null ? `${normalizeProgress}%` : 'Apply'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Exports */}
          {project.status === 'exported' && (
            <div className={styles.panelSection}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>Exports</span>
              </div>
              <div className={styles.sectionBody}>
                <div className={styles.exportCard}>
                  <video
                    className={styles.exportVideo}
                    src={`/api/projects/${project.id}/exports/composition.mp4`}
                    controls
                  />
                  <div className={styles.exportActions}>
                    <a
                      className={styles.downloadBtn}
                      href={`/api/projects/${project.id}/exports/composition.mp4`}
                      download={`${project.name}.mp4`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download MP4
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Overlay panels */}
        <ExportPanel
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          onExport={renderVideo}
          projectName={project.name}
          projectId={id}
        />
        <CaptionsPanel
          open={captionsOpen}
          onClose={() => setCaptionsOpen(false)}
          onGenerate={handleGenerateCaptions}
        />
        <AutoClipsPanel
          open={clipsOpen}
          onClose={() => setClipsOpen(false)}
          onExportAll={() => { setClipsOpen(false); toast('Clip export queued — check the exports panel when complete') }}
          clips={autoClips}
        />
      </div>

      {/* ═══ TRACK PANEL ═══ */}
      <div
        className={`${styles.trackPanel} ${trackPanelCollapsed ? styles.trackPanelCollapsed : ''}`}
        style={{ height: trackPanelCollapsed ? 36 : trackPanelHeight }}
      >
        {/* Resize handle */}
        <div
          className={`${styles.resizeHandle} ${styles.resizeHandleTop}`}
          onMouseDown={handleResizeTrack}
        />

        {/* Transport bar */}
        <div className={styles.trackPanelBar}>
          <button className={styles.tpToggle} onClick={() => setTrackPanelCollapsed(!trackPanelCollapsed)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 15 12 9 18 15"/></svg>
          </button>
          <span className={styles.tpTitle}>Tracks</span>
          <span className={styles.tpTrackCount}>{tracks.length} track{tracks.length !== 1 ? 's' : ''}</span>
          <div className={styles.tpSpacer} />
          <div className={styles.tpTransport}>
            <button className={styles.tpBtn} onClick={() => seekRelative(-5)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
            </button>
            <button className={styles.tpPlay} onClick={togglePlay}>
              {isPlaying ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              )}
            </button>
            <button className={styles.tpBtn} onClick={() => seekRelative(5)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
            </button>
          </div>
          <span className={styles.tpTime}>{formatTime(currentTime)} / {formatTime(editedDur)}</span>
          <div className={styles.tpSpacer} />
          <div className={styles.tpZoom}>
            <button className={styles.tpZoomBtn} onClick={zoomOut} title="Zoom out">-</button>
            <span className={styles.tpZoomLevel}>{Math.round(trackZoom * 100)}%</span>
            <button className={styles.tpZoomBtn} onClick={zoomIn} title="Zoom in">+</button>
          </div>
        </div>

        <div className={styles.trackBody} ref={trackBodyRef}>
          {/* Ruler */}
          <div className={styles.trackRuler} style={{ minWidth: TRACK_META_W + timelineW, cursor: 'pointer' }} onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const x = e.clientX - rect.left - TRACK_META_W
            if (x < 0) return
            const pct = x / timelineW
            seekTo(Math.max(0, Math.min(durationSec, pct * durationSec)))
          }}>
            {rulerMarks.map((mark, i) => (
              <span key={i} className={styles.rulerMark} style={{ left: mark.left }}>{mark.label}</span>
            ))}
            <div className={styles.rulerPlayhead} style={{ left: TRACK_META_W + (playPercent / 100) * timelineW }} />
          </div>

          {/* Track rows */}
          <div className={styles.trackRows} style={{ minWidth: TRACK_META_W + timelineW }}>
            {tracks.length > 0 ? tracks.map((track, idx) => {
              const trackId = `track-${track.type}-${track.index}`
              const isVideo = track.type === 'video'
              const isAudio = track.type === 'audio'
              const trackColors: Record<string, string[]> = { video: ['var(--accent)', '#785adc', '#e3b341'], audio: ['var(--green)', 'var(--yellow)', '#f0883e'] }
              const defaultColor = (trackColors[track.type] || ['var(--text-dim)'])[tracks.filter((t, i) => t.type === track.type && i < idx).length] || 'var(--text-muted)'
              const color = track.color || defaultColor
              const clipStyle = isVideo ? styles.videoClip : styles.micClip
              const videoIdx = tracks.filter((t, i) => t.type === 'video' && i <= idx).length
              const audioIdx = tracks.filter((t, i) => t.type === 'audio' && i <= idx).length
              const name = track.label || (isVideo ? `Video ${videoIdx}` : `Audio ${audioIdx}`)
              const detail = isVideo
                ? `${track.width}x${track.height} · ${track.codec}`
                : `${track.channels || '?'}ch · ${track.sample_rate ? (track.sample_rate / 1000).toFixed(0) + 'kHz' : ''} · ${track.codec}`

              return (
                <div
                  key={trackId}
                  className={`${styles.trackRow} ${selectedTrack === trackId ? styles.trackRowSelected : ''} ${isTrackMuted(trackId) ? styles.trackRowMuted : ''}`}
                  onClick={() => setSelectedTrack(trackId)}
                  onContextMenu={(e) => handleTrackContextMenu(e, trackId, track.type, name)}
                >
              <div className={styles.trackMeta}>
                <div className={styles.trackColor} style={{ background: color }} />
                {isVideo ? (
                  <svg className={styles.trackIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                ) : (
                  <svg className={styles.trackIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                )}
                <span className={styles.trackName} title={detail}>{name}</span>
                <div className={styles.trackControls}>
                  <button className={`${styles.trkBtn} ${mutedTracks.has(trackId) ? styles.trkBtnActiveMute : ''}`} onClick={(e) => { e.stopPropagation(); toggleMute(trackId) }} title="Mute">M</button>
                  <button className={`${styles.trkBtn} ${soloTrack === trackId ? styles.trkBtnActiveSolo : ''}`} onClick={(e) => { e.stopPropagation(); toggleSolo(trackId) }} title="Solo">S</button>
                  {isAudio && <input type="range" className={styles.volSlider} min="0" max="100" defaultValue="85" onClick={(e) => e.stopPropagation()} />}
                </div>
              </div>
              <div className={styles.trackContent} onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const pct = (e.clientX - rect.left) / rect.width
                const time = pct * durationSec
                seekTo(Math.max(0, Math.min(durationSec, time)))
              }}>
                <div className={`${styles.trackClip} ${clipStyle}`} style={{ left: 0, right: '3%' }}>
                  {isAudio && transcript && durationSec > 0 ? (
                    <div className={styles.trackWords}>
                      {transcript.words.map((word, wi) => {
                        const left = (word.start / durationSec) * 100
                        const width = Math.max(0.2, ((word.end - word.start) / durationSec) * 100)
                        const isCutWord = editor.isCut(word.start * 1000, word.end * 1000)
                        return (
                          <span
                            key={wi}
                            className={`${styles.trackWord} ${word.filler ? styles.trackWordFiller : ''} ${isCutWord ? styles.trackWordCut : ''}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={word.word}
                          >
                            {width > 1 ? word.word : ''}
                          </span>
                        )
                      })}
                    </div>
                  ) : isAudio && waveformData ? (
                    <div className={styles.waveBars}>
                      {(() => {
                        // Downsample waveform to fit the track width (~300 bars)
                        const targetBars = 300
                        const step = Math.max(1, Math.floor(waveformData.length / targetBars))
                        const bars: number[] = []
                        for (let i = 0; i < waveformData.length; i += step) {
                          const chunk = waveformData.slice(i, i + step)
                          const max = Math.max(...chunk)
                          bars.push(max)
                        }
                        return bars.map((amp, i) => (
                          <div key={i} className={styles.wb} style={{ height: `${Math.max(2, amp * 100)}%`, background: color, opacity: 0.5 }} />
                        ))
                      })()}
                    </div>
                  ) : isAudio ? (
                    <div className={styles.waveBars}>
                      {Array.from({ length: 200 }, (_, i) => (
                        <div key={i} className={styles.wb} style={{ height: `${15 + Math.random() * 70}%`, background: color, opacity: 0.3 }} />
                      ))}
                    </div>
                  ) : (
                    <span className={styles.clipLabel}>{name} · {track.codec}</span>
                  )}
                </div>
                {editor.edl.cuts.map((cut, ci) => {
                  const start = durationSec > 0 ? (cut.start_ms / 1000 / durationSec) * 100 : 0
                  const w = durationSec > 0 ? ((cut.end_ms - cut.start_ms) / 1000 / durationSec) * 100 : 0
                  return <div key={ci} className={styles.trackCut} style={{ left: `${start}%`, width: `${w}%` }} />
                })}
                <div className={styles.trackPlayhead} style={{ left: `${playPercent}%` }} />
              </div>
            </div>
              )
            }) : (
              <div className={styles.trackRow} style={{ justifyContent: 'center', color: 'var(--text-dim)', fontSize: 12, padding: 16 }}>
                No media tracks — import a file to see tracks
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ CONTEXT MENU ═══ */}
      {ctxMenu && (
        <div className={`${styles.ctxMenu} ${styles.ctxMenuOpen}`} style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <button className={styles.ctxItem} onClick={() => ctxAction('cut')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
            Cut <span className={styles.ctxShortcut}>{'\u2318'}X</span>
          </button>
          <button className={styles.ctxItem} onClick={() => ctxAction('copy')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy <span className={styles.ctxShortcut}>{'\u2318'}C</span>
          </button>
          {ctxMenu?.wordIdx != null && (
            <button className={styles.ctxItem} onClick={() => ctxAction('editWord')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Word
            </button>
          )}
          <div className={styles.ctxDivider} />
          <button className={`${styles.ctxItem} ${styles.ctxItemDanger}`} onClick={() => ctxAction('delete')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete Selection <span className={styles.ctxShortcut}>{'\u232B'}</span>
          </button>
          <button className={styles.ctxItem} onClick={() => ctxAction('keep')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            Keep Only This
          </button>
          <div className={styles.ctxDivider} />
          <button className={styles.ctxItem} onClick={() => ctxAction('split')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="17 7 12 2 7 7"/><polyline points="17 17 12 22 7 17"/></svg>
            Split Scene Here
          </button>
          <button className={styles.ctxItem} onClick={() => ctxAction('addBroll')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Insert B-Roll Here
          </button>
        </div>
      )}

      {/* ═══ TRACK CONTEXT MENU ═══ */}
      {trackCtxMenu && (
        <div className={`${styles.ctxMenu} ${styles.ctxMenuOpen} ${styles.trackCtxMenu}`} style={{ left: trackCtxMenu.x, top: trackCtxMenu.y }}>
          <div className={styles.ctxHeader}>{trackCtxMenu.trackName}</div>
          <div className={styles.ctxDivider} />
          <button className={styles.ctxItem} onClick={() => trackCtxAction('mute')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            {mutedTracks.has(trackCtxMenu.trackId) ? 'Unmute' : 'Mute'} <span className={styles.ctxShortcut}>M</span>
          </button>
          <button className={styles.ctxItem} onClick={() => trackCtxAction('solo')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            {soloTrack === trackCtxMenu.trackId ? 'Unsolo' : 'Solo'} <span className={styles.ctxShortcut}>S</span>
          </button>
          <div className={styles.ctxDivider} />
          <button className={styles.ctxItem} onClick={() => trackCtxAction('splitAtPlayhead')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="17 7 12 2 7 7"/><polyline points="17 17 12 22 7 17"/></svg>
            Split at Playhead <span className={styles.ctxShortcut}>{'\u2318'}B</span>
          </button>
          {trackCtxMenu.trackType === 'video' && (
            <button className={styles.ctxItem} onClick={() => trackCtxAction('detachAudio')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3l-8 8H3v4h5l8 8V3z"/><path d="M23 3L1 21"/></svg>
              Detach Audio
            </button>
          )}
          <button className={styles.ctxItem} onClick={() => trackCtxAction('addEffect')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Add Effect
          </button>
          <div className={styles.ctxDivider} />
          <button className={styles.ctxItem} onClick={() => trackCtxAction('rename')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Rename Track
          </button>
          <button className={styles.ctxItem} onClick={() => trackCtxAction('duplicate')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Duplicate Track
          </button>
          <button className={styles.ctxItem} onClick={() => trackCtxAction('color')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.04-.23-.29-.38-.63-.38-1.01 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.17-4.49-9-10-9z"/></svg>
            Change Color
          </button>
          <div className={styles.ctxDivider} />
          <button className={`${styles.ctxItem} ${styles.ctxItemDanger}`} onClick={() => trackCtxAction('delete')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete Track <span className={styles.ctxShortcut}>{'\u232B'}</span>
          </button>
        </div>
      )}

      {/* ═══ COMMAND PALETTE ═══ */}
      <div className={`${styles.cmdOverlay} ${cmdOpen ? styles.cmdOverlayOpen : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setCmdOpen(false) }}>
        <div className={styles.cmdBox}>
          <div className={styles.cmdInputRow}>
            <div className={styles.cmdSullaIcon}>S</div>
            <input
              ref={cmdInputRef}
              className={styles.cmdInput}
              placeholder="Ask Sulla anything..."
              value={cmdQuery}
              onChange={(e) => setCmdQuery(e.target.value)}
            />
            <span className={styles.cmdHint}>ESC</span>
          </div>
          <div className={styles.cmdResults}>
            {filteredCmdItems.map((group, gi) => (
              <div key={gi}>
                <div className={styles.cmdGroupLabel}>{group.group}</div>
                {group.items.map((item) => (
                  <div key={item.id} className={styles.cmdItem} onClick={() => cmdExec(item.id)}>
                    <div className={styles.cmdItemIcon}>
                      {item.icon === 'x' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                      {item.icon === 'minus' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>}
                      {item.icon === 'zap' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
                      {item.icon === 'volume' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}
                      {item.icon === 'cc' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/></svg>}
                      {item.icon === 'download' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
                      {item.icon === 'translate' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>}
                    </div>
                    <div className={styles.cmdItemText}>{item.label}</div>
                    {item.desc && <div className={styles.cmdItemDesc}>{item.desc}</div>}
                    {(item as any).shortcut && <div className={styles.cmdItemShortcut}>{(item as any).shortcut}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className={styles.cmdFooter}>
            <span><kbd>{'\u2191'}</kbd><kbd>{'\u2193'}</kbd> navigate</span>
            <span><kbd>Enter</kbd> select</span>
            <span><kbd>Esc</kbd> close</span>
          </div>
        </div>
      </div>

      {/* ═══ PROCESSING NOTIFICATION ═══ */}
      {(studioSoundProgress !== null || normalizeProgress !== null) && (
        <div className={styles.processingBar}>
          <div className={styles.processingIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          </div>
          <div className={styles.processingInfo}>
            <div className={styles.processingLabel}>
              {studioSoundProgress !== null ? 'Applying Studio Sound...' : 'Normalizing audio...'}
            </div>
            <div className={styles.processingTrack}>
              <div className={styles.processingFill} style={{ width: `${studioSoundProgress ?? normalizeProgress ?? 0}%` }} />
            </div>
          </div>
          <span className={styles.processingPct}>{studioSoundProgress ?? normalizeProgress ?? 0}%</span>
        </div>
      )}

      {/* ═══ TOAST ═══ */}
      <div className={`${styles.toast} ${toastVisible ? styles.toastShow : ''}`}>{toastMsg}</div>

      {/* Action toast from editor hook */}
      {editor.lastAction && (
        <div className={`${styles.undoToast} ${styles.undoToastShow}`}>
          <span>{editor.lastAction}</span>
          <button onClick={editor.undo}>Undo</button>
        </div>
      )}
    </div>
  )
}
