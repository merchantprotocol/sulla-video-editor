import { Link, useParams } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useProject } from '../hooks/useProjects'
import styles from './Editor.module.css'

interface Word {
  word: string
  start: number
  end: number
  confidence: number
  speaker: string
  filler?: boolean
}

interface Silence {
  start: number
  end: number
  duration: number
  after_word_index: number
}

interface Transcript {
  speakers: { id: string; name: string; color: string }[]
  words: Word[]
  silences: Silence[]
  duration_ms: number
  word_count: number
}

export default function Editor() {
  const { id } = useParams<{ id: string }>()
  const { project, files, loading, importMedia, transcribe, getTranscript, getEdl, saveEdl } = useProject(id!)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Load transcript if available
  useEffect(() => {
    if (files.hasTranscript) {
      getTranscript().then(setTranscript).catch(() => {})
    }
  }, [files.hasTranscript])

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

  function seekTo(time: number) {
    setCurrentTime(time)
    if (videoRef.current) {
      videoRef.current.currentTime = time
    }
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  if (loading) {
    return <div className={styles.app}><div className={styles.loading}>Loading project...</div></div>
  }

  if (!project) {
    return <div className={styles.app}><div className={styles.loading}>Project not found. <Link to="/">Go home</Link></div></div>
  }

  // Group words into speaker blocks (split on long silences or every ~50 words)
  function groupWords(words: Word[], silences: Silence[]) {
    const blocks: { speaker: string; startTime: number; words: (Word | Silence)[] }[] = []
    const silenceSet = new Set(silences.map(s => s.after_word_index))
    let current: { speaker: string; startTime: number; words: (Word | Silence)[] } | null = null

    words.forEach((w, i) => {
      if (!current || (current.words.length > 50 && silenceSet.has(i - 1))) {
        current = { speaker: w.speaker, startTime: w.start, words: [] }
        blocks.push(current)
      }
      current.words.push(w)

      // Insert silence marker if applicable
      const silence = silences.find(s => s.after_word_index === i)
      if (silence) {
        current.words.push(silence)
      }
    })
    return blocks
  }

  return (
    <div className={styles.app}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <Link to="/" className={styles.logo}>sulla</Link>
        <div className={styles.breadcrumb}>
          <span>/</span>
          <strong>{project.name}</strong>
        </div>
        <div className={styles.spacer} />
        {project.status !== 'draft' && (
          <span className={styles.statusPill}>{project.status}</span>
        )}
        <button className={styles.exportBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export
        </button>
      </div>

      <div className={styles.main}>
        {/* Transcript panel */}
        <div className={styles.transcript}>
          <div className={styles.toolbar}>
            {transcript && (
              <span className={styles.tbLabel}>{transcript.word_count.toLocaleString()} words · {formatTime(transcript.duration_ms / 1000)}</span>
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
                    <p>No media imported yet. Go to <Link to={`/new`}>New Project</Link> to upload a file.</p>
                  )}
                </div>
              ) : (
                // Render transcript blocks
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
                        {block.words.map((item, wi) => {
                          if ('duration' in item) {
                            // Silence marker
                            return (
                              <span key={`s${wi}`} className={styles.silence}>
                                {item.duration.toFixed(1)}s
                              </span>
                            )
                          }
                          const word = item as Word
                          const isCurrent = currentTime >= word.start && currentTime < word.end
                          return (
                            <span
                              key={wi}
                              className={`${styles.word} ${word.filler ? styles.filler : ''} ${isCurrent ? styles.current : ''} ${currentTime > word.end ? styles.played : ''}`}
                              onClick={() => seekTo(word.start)}
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
                />
              ) : (
                <span className={styles.videoPlaceholder}>No video</span>
              )}
            </div>
            {project.media_path && (
              <div className={styles.videoControls}>
                <button className={styles.playBtn} onClick={() => videoRef.current?.paused ? videoRef.current?.play() : videoRef.current?.pause()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
                <span className={styles.timeLabel}>
                  {formatTime(currentTime)} / {formatTime((project.duration_ms || 0) / 1000)}
                </span>
              </div>
            )}
          </div>

          <div className={styles.suggestions}>
            <div className={styles.sectionTitle}>Info</div>
            <div className={styles.infoList}>
              <div className={styles.infoRow}><span>Status</span><span>{project.status}</span></div>
              {project.resolution && <div className={styles.infoRow}><span>Resolution</span><span>{project.resolution}</span></div>}
              {project.duration_ms && <div className={styles.infoRow}><span>Duration</span><span>{formatTime(project.duration_ms / 1000)}</span></div>}
              {transcript && <div className={styles.infoRow}><span>Words</span><span>{transcript.word_count.toLocaleString()}</span></div>}
              {transcript && <div className={styles.infoRow}><span>Fillers</span><span>{transcript.words.filter(w => w.filler).length}</span></div>}
              {transcript && <div className={styles.infoRow}><span>Pauses</span><span>{transcript.silences.length}</span></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
