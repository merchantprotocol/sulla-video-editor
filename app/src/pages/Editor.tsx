import { Link, useParams } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useProject } from '../hooks/useProjects'
import { useEditor } from '../hooks/useEditor'
import styles from './Editor.module.css'

interface Word { word: string; start: number; end: number; confidence: number; speaker: string; filler?: boolean }
interface Silence { start: number; end: number; duration: number; after_word_index: number }
interface Transcript { speakers: { id: string; name: string; color: string }[]; words: Word[]; silences: Silence[]; duration_ms: number; word_count: number }

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const { project, files, loading, transcribe, getTranscript, saveEdl, getEdl } = useProject(id!)
  const editor = useEditor()
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [saving, setSaving] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

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
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isPlaying, transcript, editor])

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
    if (count === 0) alert('No uncut fillers remaining')
  }

  function handleTrimSilence() {
    if (!transcript) return
    const { count, savedMs } = editor.trimAllSilence(transcript.silences)
    if (count === 0) alert('No untrimmed pauses remaining')
  }

  function handleCleanAll() {
    handleRemoveFillers()
    setTimeout(() => handleTrimSilence(), 50) // slight delay so undo entries are separate
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  if (loading) return <div className={styles.app}><div className={styles.loading}>Loading project...</div></div>
  if (!project) return <div className={styles.app}><div className={styles.loading}>Project not found. <Link to="/">Go home</Link></div></div>

  // Stats
  const fillerCount = transcript ? transcript.words.filter(w => w.filler && !editor.isCut(w.start * 1000, w.end * 1000)).length : 0
  const silenceCount = transcript ? transcript.silences.filter(s => !editor.isCut(s.start * 1000, s.end * 1000)).length : 0
  const totalCutSec = editor.totalCutMs() / 1000
  const originalDur = (project.duration_ms || 0) / 1000
  const editedDur = originalDur - totalCutSec

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

  return (
    <div className={styles.app}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <Link to="/" className={styles.logo}>sulla</Link>
        <div className={styles.breadcrumb}><span>/</span> <strong>{project.name}</strong></div>
        <div className={styles.spacer} />

        {/* Cleanup summary */}
        {transcript && (fillerCount > 0 || silenceCount > 0) && (
          <div className={styles.cleanupBar}>
            {fillerCount > 0 && <span className={styles.cleanupStat}><strong>{fillerCount}</strong> fillers</span>}
            {silenceCount > 0 && <span className={styles.cleanupStat}><strong>{silenceCount}</strong> pauses</span>}
            <button className={styles.cleanBtn} onClick={handleCleanAll}>Clean All</button>
          </div>
        )}

        {totalCutSec > 0 && (
          <span className={styles.savedBadge}>-{formatTime(totalCutSec)} saved</span>
        )}

        {saving && <span className={styles.savingLabel}>Saving...</span>}

        <button className={styles.exportBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export
        </button>
      </div>

      <div className={styles.main}>
        {/* Transcript panel */}
        <div className={styles.transcript}>
          <div className={styles.toolbar}>
            {/* Undo/Redo */}
            <button className={styles.tbBtn} onClick={editor.undo} title="Undo (⌘Z)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </button>
            <button className={styles.tbBtn} onClick={editor.redo} title="Redo (⌘⇧Z)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
            </button>

            <div className={styles.tbDivider} />

            {/* Edit actions */}
            {transcript && (
              <>
                <button className={styles.tbBtn} onClick={handleRemoveFillers} title="Remove all fillers">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  {fillerCount > 0 && <span className={styles.tbBadge}>{fillerCount}</span>}
                </button>
                <button className={styles.tbBtn} onClick={handleTrimSilence} title="Trim all silence">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  {silenceCount > 0 && <span className={styles.tbBadge}>{silenceCount}</span>}
                </button>
              </>
            )}

            <div className={styles.spacer} />

            {transcript && (
              <span className={styles.tbLabel}>
                {transcript.word_count.toLocaleString()} words · {formatTime(editedDur)}
                {totalCutSec > 0 && <span className={styles.tbSaved}> (-{formatTime(totalCutSec)})</span>}
              </span>
            )}
          </div>

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

        {/* Right panel */}
        <div className={styles.rightPanel}>
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
                <span className={styles.videoPlaceholder}>No video</span>
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
                <span className={styles.timeLabel}>
                  {formatTime(currentTime)} / {formatTime(editedDur)}
                </span>
              </div>
            )}
          </div>

          {/* Suggestions */}
          <div className={styles.suggestions}>
            {transcript && (
              <>
                <div className={styles.sectionTitle}>Edit Summary</div>
                <div className={styles.infoList}>
                  <div className={styles.infoRow}><span>Original</span><span>{formatTime(originalDur)}</span></div>
                  <div className={styles.infoRow}><span>Edited</span><span className={styles.accentText}>{formatTime(editedDur)}</span></div>
                  {totalCutSec > 0 && <div className={styles.infoRow}><span>Saved</span><span className={styles.greenText}>-{formatTime(totalCutSec)}</span></div>}
                  <div className={styles.infoRow}><span>Cuts</span><span>{editor.edl.cuts.length}</span></div>
                </div>

                <div className={styles.sectionTitle} style={{ marginTop: 16 }}>Quick Actions</div>
                <div className={styles.actionList}>
                  <button className={styles.actionBtn} onClick={handleRemoveFillers} disabled={fillerCount === 0}>
                    <span className={styles.actionIcon} style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </span>
                    <span className={styles.actionText}>
                      <strong>Remove fillers</strong>
                      <span>{fillerCount > 0 ? `${fillerCount} found` : 'None remaining'}</span>
                    </span>
                  </button>
                  <button className={styles.actionBtn} onClick={handleTrimSilence} disabled={silenceCount === 0}>
                    <span className={styles.actionIcon} style={{ background: 'var(--yellow-soft)', color: 'var(--yellow)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M5 12h14"/></svg>
                    </span>
                    <span className={styles.actionText}>
                      <strong>Trim silence</strong>
                      <span>{silenceCount > 0 ? `${silenceCount} pauses` : 'None remaining'}</span>
                    </span>
                  </button>
                  <button className={styles.actionBtn} onClick={handleCleanAll} disabled={fillerCount === 0 && silenceCount === 0}>
                    <span className={styles.actionIcon} style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    </span>
                    <span className={styles.actionText}>
                      <strong>Clean all</strong>
                      <span>Fillers + silence in one click</span>
                    </span>
                  </button>
                </div>

                <div className={styles.sectionTitle} style={{ marginTop: 16 }}>Info</div>
                <div className={styles.infoList}>
                  <div className={styles.infoRow}><span>Resolution</span><span>{project.resolution || '—'}</span></div>
                  <div className={styles.infoRow}><span>Words</span><span>{transcript.word_count.toLocaleString()}</span></div>
                  <div className={styles.infoRow}><span>Speakers</span><span>{transcript.speakers.length}</span></div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action toast */}
      {editor.lastAction && (
        <div className={styles.toast}>{editor.lastAction}</div>
      )}
    </div>
  )
}
