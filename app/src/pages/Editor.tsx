import { Link, useParams } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useProject } from '../hooks/useProjects'
import { useEditor } from '../hooks/useEditor'
import ExportPanel from '../components/ExportPanel'
import styles from './Editor.module.css'

interface Word { word: string; start: number; end: number; confidence: number; speaker: string; filler?: boolean }
interface Silence { start: number; end: number; duration: number; after_word_index: number }
interface Transcript { speakers: { id: string; name: string; color: string }[]; words: Word[]; silences: Silence[]; duration_ms: number; word_count: number }

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const { project, files, loading, transcribe, getTranscript, saveEdl, getEdl, renderVideo } = useProject(id!)
  const editor = useEditor()
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
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
  const [mutedTracks, setMutedTracks] = useState<Set<string>>(new Set())
  const [soloTrack, setSoloTrack] = useState<string | null>(null)
  const [suggestionsCollapsed, setSuggestionsCollapsed] = useState(false)
  const [audioCollapsed, setAudioCollapsed] = useState(false)
  const [studioSoundApplied, setStudioSoundApplied] = useState(false)
  const [normalizeApplied, setNormalizeApplied] = useState(false)
  const [speakerMenuOpen, setSpeakerMenuOpen] = useState<number | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  const cmdInputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()
  const appRef = useRef<HTMLDivElement>(null)

  // Load transcript + EDL
  useEffect(() => {
    if (files.hasTranscript) {
      getTranscript().then(setTranscript).catch(() => {})
    }
    if (files.hasEdl) {
      getEdl().then(edl => editor.setEdl(edl)).catch(() => {})
    }
  }, [files.hasTranscript, files.hasEdl])

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

  // EDL-aware playback: skip cut regions
  useEffect(() => {
    if (!isPlaying || !videoRef.current) return
    const interval = setInterval(() => {
      const v = videoRef.current
      if (!v || v.paused) return
      const timeMs = v.currentTime * 1000
      const next = editor.nextPlayableTime(timeMs)
      if (next > timeMs + 50) {
        v.currentTime = next / 1000
      }
    }, 100)
    return () => clearInterval(interval)
  }, [isPlaying, editor.edl])

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

  // Context menu handler
  function handleContextMenu(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest(`.${styles.docContent}`)) return
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
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
    else if (action === 'studioSound') { setStudioSoundApplied(true); toast('Studio Sound applied') }
    else if (action === 'normalize') { setNormalizeApplied(true); toast('Audio normalized to -14 LUFS') }
    else if (action === 'export') setExportOpen(true)
    else toast(action + ': coming soon')
  }

  // Generate waveform bars
  const micWaveBars = useMemo(() => Array.from({ length: 200 }, () => 15 + Math.random() * 70), [])
  const sysWaveBars = useMemo(() => Array.from({ length: 200 }, () => 15 + Math.random() * 70), [])

  // Compute playhead position as percentage of duration
  const durationSec = (project?.duration_ms || 0) / 1000
  const playPercent = durationSec > 0 ? (currentTime / durationSec) * 100 : 0

  // Ruler marks
  const rulerMarks = useMemo(() => {
    const marks: { left: number; label: string }[] = []
    for (let i = 0; i <= 12; i++) {
      marks.push({ left: 140 + i * 100, label: `${String(i).padStart(2, '0')}:00` })
    }
    return marks
  }, [])

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
  const originalDur = (project.duration_ms || 0) / 1000
  const editedDur = originalDur - totalCutSec
  const isClean = fillerCount === 0 && silenceCount === 0

  // Group words into blocks
  function groupWords(words: Word[], silences: Silence[]) {
    const blocks: { speaker: string; startTime: number; items: { type: 'word' | 'silence'; idx: number; data: Word | Silence }[] }[] = []
    const silenceByIdx = new Map(silences.map(s => [s.after_word_index, s]))
    let current: typeof blocks[0] | null = null

    words.forEach((w, i) => {
      if (!current || (current.items.length > 60 && silenceByIdx.has(i - 1))) {
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
        <div className={styles.breadcrumb}><span>/</span> <strong>{project.name}</strong></div>
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
            <button className={styles.tbBtn} onClick={() => toast('Scene breaks toggled')} title="Scenes">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              <span className={styles.tbTip}>Scene Breaks</span>
            </button>
          </div>

          {/* Captions / Studio Sound / Clips / Translate group */}
          <div className={`${styles.tbGroup} ${styles.tbGroupBorder}`}>
            <button className={styles.tbBtn} onClick={() => toast('Captions: coming soon')} title="Captions">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/></svg>
              <span className={styles.tbTip}>Captions</span>
            </button>
            <button className={styles.tbBtn} onClick={() => { setStudioSoundApplied(true); toast('Studio Sound applied') }} title="Studio sound">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              <span className={styles.tbTip}>Studio Sound</span>
            </button>
            <button className={styles.tbBtn} onClick={() => toast('Auto clips: coming soon')} title="Auto clips">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M10 2v20"/><path d="M2 12h8"/></svg>
              <span className={styles.tbTip}>Auto Clips</span>
            </button>
            <button className={styles.tbBtn} onClick={() => toast('Translation: coming soon')} title="Translate">
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
                return (
                  <div key={bi} className={styles.speakerBlock}>
                    {/* Drag handle */}
                    <div className={styles.dragHandle}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                    </div>
                    <div className={styles.speakerHeader}>
                      <div className={styles.speakerAvatar} style={{ borderColor: speaker?.color, color: speaker?.color }}>
                        {(speaker?.name || 'S')[0].toUpperCase()}
                      </div>
                      <div className={styles.speakerInfo}>
                        <div className={styles.speakerName}>{speaker?.name || 'Speaker'}</div>
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
                        <button className={styles.smItem} onClick={() => { setSpeakerMenuOpen(null); toast('Rename: coming soon') }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                          Rename Speaker
                        </button>
                        <button className={styles.smItem} onClick={() => { setSpeakerMenuOpen(null); toast('Change color: coming soon') }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                          Change Color
                        </button>
                        <div className={styles.smDivider} />
                        <button className={styles.smItem} onClick={() => { setSpeakerMenuOpen(null); toast('Merge: coming soon') }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>
                          Merge with Above
                        </button>
                        <button className={styles.smItem} onClick={() => { setSpeakerMenuOpen(null); toast('Split: coming soon') }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><polyline points="17 7 12 2 7 7"/><polyline points="17 17 12 22 7 17"/></svg>
                          Split Block
                        </button>
                        <div className={styles.smDivider} />
                        <button className={styles.smItem} onClick={() => { setSpeakerMenuOpen(null); toast('Assign speaker: coming soon') }}>
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

                        return (
                          <span
                            key={`w${item.idx}`}
                            data-word-idx={item.idx}
                            className={`${styles.word} ${word.filler ? styles.filler : ''} ${isCurrent ? styles.current : ''} ${currentTime > word.end ? styles.played : ''} ${cut ? styles.cut : ''}`}
                            onClick={() => {
                              if (cut) {
                                editor.removeCutsInRange(word.start * 1000, word.end * 1000)
                              } else {
                                seekTo(word.start)
                              }
                            }}
                          >
                            {word.word}{' '}
                          </span>
                        )
                      })}
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
          <div className={styles.videoFrame}>
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
                    <button className={styles.sugAction} onClick={() => toast('Hook fix: coming soon')}>Preview</button>
                  </div>
                  {/* Clips suggestion */}
                  <div className={styles.sugCard}>
                    <div className={`${styles.sugIndicator} ${styles.sugIndicatorGreen}`} />
                    <div className={styles.sugContent}>
                      <div className={styles.sugTitle}>Social clips detected</div>
                      <div className={styles.sugDesc}>Auto-clipped with virality scores</div>
                    </div>
                    <button className={styles.sugAction} onClick={() => toast('Auto clips: coming soon')}>View</button>
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
                    <button className={styles.sugAction} onClick={() => { setStudioSoundApplied(true); toast('Studio Sound applied') }}>Apply</button>
                  </div>
                  <div className={`${styles.sugCard} ${normalizeApplied ? styles.sugCardDone : ''}`}>
                    <div className={`${styles.sugIndicator} ${styles.sugIndicatorBlue}`} />
                    <div className={styles.sugContent}>
                      <div className={styles.sugTitle}>Normalize loudness</div>
                      <div className={styles.sugDesc}>Target -14 LUFS for YouTube</div>
                    </div>
                    <span className={styles.sugDoneLabel}>Applied</span>
                    <button className={styles.sugAction} onClick={() => { setNormalizeApplied(true); toast('Audio normalized to -14 LUFS') }}>Apply</button>
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

        {/* Export panel overlay */}
        <ExportPanel
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          onExport={renderVideo}
          projectName={project.name}
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
          <span className={styles.tpTrackCount}>4 tracks</span>
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
            <button className={styles.tpZoomBtn} onClick={() => toast('Zoom out')}>-</button>
            <button className={styles.tpZoomBtn} onClick={() => toast('Zoom in')}>+</button>
          </div>
        </div>

        <div className={styles.trackBody}>
          {/* Ruler */}
          <div className={styles.trackRuler}>
            {rulerMarks.map((mark, i) => (
              <span key={i} className={styles.rulerMark} style={{ left: mark.left }}>{mark.label}</span>
            ))}
            <div className={styles.rulerPlayhead} style={{ left: 140 + (playPercent / 100) * 1200 }} />
          </div>

          {/* Track rows */}
          <div className={styles.trackRows}>
            {/* Screen track */}
            <div
              className={`${styles.trackRow} ${selectedTrack === 'track-video' ? styles.trackRowSelected : ''} ${isTrackMuted('track-video') ? styles.trackRowMuted : ''}`}
              onClick={() => setSelectedTrack('track-video')}
            >
              <div className={styles.trackMeta}>
                <div className={styles.trackColor} style={{ background: 'var(--accent)' }} />
                <svg className={styles.trackIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                <span className={styles.trackName}>Screen</span>
                <div className={styles.trackControls}>
                  <button className={`${styles.trkBtn} ${mutedTracks.has('track-video') ? styles.trkBtnActiveMute : ''}`} onClick={(e) => { e.stopPropagation(); toggleMute('track-video') }} title="Mute">M</button>
                  <button className={`${styles.trkBtn} ${soloTrack === 'track-video' ? styles.trkBtnActiveSolo : ''}`} onClick={(e) => { e.stopPropagation(); toggleSolo('track-video') }} title="Solo">S</button>
                </div>
              </div>
              <div className={styles.trackContent}>
                <div className={`${styles.trackClip} ${styles.videoClip}`} style={{ left: 0, right: '3%' }}>
                  <span className={styles.clipLabel}>screen-recording.mp4</span>
                </div>
                {editor.edl.cuts.map((cut, i) => {
                  const start = durationSec > 0 ? (cut.start_ms / 1000 / durationSec) * 100 : 0
                  const width = durationSec > 0 ? ((cut.end_ms - cut.start_ms) / 1000 / durationSec) * 100 : 0
                  return <div key={i} className={styles.trackCut} style={{ left: `${start}%`, width: `${width}%` }} />
                })}
                <div className={styles.trackPlayhead} style={{ left: `${playPercent}%` }} />
              </div>
            </div>

            {/* Camera track */}
            <div
              className={`${styles.trackRow} ${selectedTrack === 'track-camera' ? styles.trackRowSelected : ''} ${isTrackMuted('track-camera') ? styles.trackRowMuted : ''}`}
              onClick={() => setSelectedTrack('track-camera')}
            >
              <div className={styles.trackMeta}>
                <div className={styles.trackColor} style={{ background: '#785adc' }} />
                <svg className={styles.trackIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                <span className={styles.trackName}>Camera</span>
                <div className={styles.trackControls}>
                  <button className={`${styles.trkBtn} ${mutedTracks.has('track-camera') ? styles.trkBtnActiveMute : ''}`} onClick={(e) => { e.stopPropagation(); toggleMute('track-camera') }} title="Mute">M</button>
                  <button className={`${styles.trkBtn} ${soloTrack === 'track-camera' ? styles.trkBtnActiveSolo : ''}`} onClick={(e) => { e.stopPropagation(); toggleSolo('track-camera') }} title="Solo">S</button>
                </div>
              </div>
              <div className={styles.trackContent}>
                <div className={`${styles.trackClip} ${styles.cameraClip}`} style={{ left: 0, right: '3%' }}>
                  <span className={styles.clipLabel}>webcam.mp4</span>
                </div>
                <div className={styles.trackPlayhead} style={{ left: `${playPercent}%` }} />
              </div>
            </div>

            {/* Microphone track */}
            <div
              className={`${styles.trackRow} ${selectedTrack === 'track-mic' ? styles.trackRowSelected : ''} ${isTrackMuted('track-mic') ? styles.trackRowMuted : ''}`}
              onClick={() => setSelectedTrack('track-mic')}
            >
              <div className={styles.trackMeta}>
                <div className={styles.trackColor} style={{ background: 'var(--green)' }} />
                <svg className={styles.trackIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                <span className={styles.trackName}>Microphone</span>
                <div className={styles.trackControls}>
                  <button className={`${styles.trkBtn} ${mutedTracks.has('track-mic') ? styles.trkBtnActiveMute : ''}`} onClick={(e) => { e.stopPropagation(); toggleMute('track-mic') }} title="Mute">M</button>
                  <button className={`${styles.trkBtn} ${soloTrack === 'track-mic' ? styles.trkBtnActiveSolo : ''}`} onClick={(e) => { e.stopPropagation(); toggleSolo('track-mic') }} title="Solo">S</button>
                  <input type="range" className={styles.volSlider} min="0" max="100" defaultValue="85" onClick={(e) => e.stopPropagation()} />
                </div>
              </div>
              <div className={styles.trackContent}>
                <div className={`${styles.trackClip} ${styles.micClip}`} style={{ left: 0, right: '3%' }}>
                  <div className={styles.waveBars}>
                    {micWaveBars.map((h, i) => (
                      <div key={i} className={styles.wb} style={{ height: `${h}%`, background: 'var(--green)', opacity: 0.4 }} />
                    ))}
                  </div>
                </div>
                {editor.edl.cuts.map((cut, i) => {
                  const start = durationSec > 0 ? (cut.start_ms / 1000 / durationSec) * 100 : 0
                  const width = durationSec > 0 ? ((cut.end_ms - cut.start_ms) / 1000 / durationSec) * 100 : 0
                  return <div key={i} className={styles.trackCut} style={{ left: `${start}%`, width: `${width}%` }} />
                })}
                <div className={styles.trackPlayhead} style={{ left: `${playPercent}%` }} />
              </div>
            </div>

            {/* System Audio track */}
            <div
              className={`${styles.trackRow} ${selectedTrack === 'track-sys' ? styles.trackRowSelected : ''} ${isTrackMuted('track-sys') ? styles.trackRowMuted : ''}`}
              onClick={() => setSelectedTrack('track-sys')}
            >
              <div className={styles.trackMeta}>
                <div className={styles.trackColor} style={{ background: 'var(--yellow)' }} />
                <svg className={styles.trackIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                <span className={styles.trackName}>System Audio</span>
                <div className={styles.trackControls}>
                  <button className={`${styles.trkBtn} ${mutedTracks.has('track-sys') ? styles.trkBtnActiveMute : ''}`} onClick={(e) => { e.stopPropagation(); toggleMute('track-sys') }} title="Mute">M</button>
                  <button className={`${styles.trkBtn} ${soloTrack === 'track-sys' ? styles.trkBtnActiveSolo : ''}`} onClick={(e) => { e.stopPropagation(); toggleSolo('track-sys') }} title="Solo">S</button>
                  <input type="range" className={styles.volSlider} min="0" max="100" defaultValue="60" onClick={(e) => e.stopPropagation()} />
                </div>
              </div>
              <div className={styles.trackContent}>
                <div className={`${styles.trackClip} ${styles.sysClip}`} style={{ left: 0, right: '3%' }}>
                  <div className={styles.waveBars}>
                    {sysWaveBars.map((h, i) => (
                      <div key={i} className={styles.wb} style={{ height: `${h}%`, background: 'var(--yellow)', opacity: 0.4 }} />
                    ))}
                  </div>
                </div>
                <div className={styles.trackPlayhead} style={{ left: `${playPercent}%` }} />
              </div>
            </div>
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
