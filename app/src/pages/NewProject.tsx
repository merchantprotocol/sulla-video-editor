import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { chunkedUpload, formatBytes } from '../lib/chunkedUpload'
import styles from './NewProject.module.css'

interface CaptureStream {
  id: string
  type: string
  filename: string
  format: string
  startOffset: number
  bytes: number
}

interface Capture {
  id: string
  sessionDir: string
  startedAt: string
  duration: number
  totalBytes: number
  streams: CaptureStream[]
  primaryFilePath: string | null
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function formatCaptureDate(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).replace(',', ' ·')
}

const STREAM_LABELS: Record<string, string> = {
  screen: 'Screen',
  camera: 'Cam',
  mic: 'Mic',
  'system-audio': 'Sys',
}

// Simple inline SVG icons for stream types
function ScreenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  )
}

export default function NewProject() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [projectName, setProjectName] = useState('')
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState('')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Captures state
  const [captures, setCaptures] = useState<Capture[]>([])
  const [capturesLoading, setCapturesLoading] = useState(true)
  const [selectedCapture, setSelectedCapture] = useState<Capture | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('sulla_token')
    fetch('/api/captures', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { captures: [] })
      .then(data => setCaptures(data.captures || []))
      .catch(() => setCaptures([]))
      .finally(() => setCapturesLoading(false))
  }, [])

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setSelectedCapture(null)
      if (!projectName) {
        setProjectName(f.name.replace(/\.\w+$/, '').replace(/[_-]/g, ' '))
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) {
      setFile(f)
      setSelectedCapture(null)
      if (!projectName) {
        setProjectName(f.name.replace(/\.\w+$/, '').replace(/[_-]/g, ' '))
      }
    }
  }

  function handleSelectCapture(capture: Capture) {
    setSelectedCapture(capture)
    setFile(null)
    setProjectName(formatCaptureDate(capture.startedAt))
  }

  function getPrimaryFilename(capture: Capture): string | null {
    const screenStream = capture.streams.find(s => s.type === 'screen')
    const cameraStream = capture.streams.find(s => s.type === 'camera')
    const firstWebm = capture.streams.find(s => s.format === 'webm' || s.filename?.endsWith('.webm'))
    const primary = screenStream || cameraStream || firstWebm
    return primary?.filename ?? null
  }

  async function handleCreate() {
    if (!projectName) { setError('Enter a project name'); return }
    setError('')
    setCreating(true)
    setUploadPercent(0)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const token = localStorage.getItem('sulla_token')
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      }

      if (selectedCapture && !file) {
        // Ingest capture via single POST
        setProgress('Importing capture...')
        const ingestRes = await fetch('/api/projects/ingest', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: projectName,
            filePath: selectedCapture.primaryFilePath,
          }),
          signal: abort.signal,
        })
        if (!ingestRes.ok) throw new Error((await ingestRes.json()).error)
        const { project } = await ingestRes.json()
        navigate(`/editor/${project.id}`)
      } else {
        // Create project (with optional file upload)
        setProgress('Creating project...')
        const createRes = await fetch('/api/projects', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: projectName }),
          signal: abort.signal,
        })
        if (!createRes.ok) throw new Error((await createRes.json()).error)
        const { project } = await createRes.json()

        if (file) {
          setProgress(`Uploading ${file.name}...`)
          await chunkedUpload(project.id, file, (p) => {
            setUploadPercent(p.percent)
            if (p.phase === 'uploading') {
              setProgress(`Uploading... ${p.percent}% (${formatBytes(p.bytesUploaded)} / ${formatBytes(p.totalBytes)})`)
            } else {
              setProgress('Processing media...')
            }
          }, abort.signal)
        }

        navigate(`/editor/${project.id}`)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setProgress('')
        setError('Upload cancelled')
      } else {
        setError(err.message || 'Failed to create project')
      }
      setCreating(false)
    } finally {
      abortRef.current = null
    }
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>New Project</h1>
        <p className={styles.desc}>Import your media and choose how Sulla should edit it.</p>

        {/* Drop zone */}
        <div
          className={`${styles.dropZone} ${file ? styles.hasFile : ''} ${selectedCapture ? styles.dimmed : ''}`}
          onClick={() => !file && !selectedCapture && fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          {!file ? (
            <div className={styles.dropEmpty}>
              <div className={styles.dropIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <div className={styles.dropTitle}>Drop video or audio files here</div>
              <div className={styles.dropDesc}>or click to browse</div>
              <div className={styles.dropFormats}>MP4, MOV, WebM, WAV, MP3, M4A</div>
            </div>
          ) : (
            <div className={styles.fileInfo}>
              <div className={styles.fileIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
              </div>
              <div className={styles.fileDetails}>
                <div className={styles.fileName}>{file.name}</div>
                <div className={styles.fileMeta}>{(file.size / 1e6).toFixed(1)} MB</div>
              </div>
              <button className={styles.fileRemove} onClick={e => { e.stopPropagation(); setFile(null); }}>✕</button>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="video/*,audio/*" style={{ display: 'none' }} onChange={handleFileSelect} />

        {/* Captures section */}
        <div className={styles.captureSection}>
          <label className={styles.formLabel}>Your Captures</label>
          {capturesLoading ? (
            <div className={styles.captureEmpty}>Loading captures...</div>
          ) : captures.length === 0 ? (
            <div className={styles.captureEmpty}>No captures yet — record in Capture Studio first.</div>
          ) : (
            <div className={styles.captureList}>
              {captures.map(capture => {
                const isSelected = selectedCapture?.id === capture.id
                const isPreviewing = previewId === capture.id
                const primaryFilename = getPrimaryFilename(capture)

                return (
                  <div
                    key={capture.id}
                    className={`${styles.captureCard} ${isSelected ? styles.selected : ''}`}
                    onClick={() => handleSelectCapture(capture)}
                  >
                    <div className={styles.captureCardHeader}>
                      <div className={styles.captureIcon}>
                        <ScreenIcon />
                      </div>
                      <div className={styles.captureInfo}>
                        <div className={styles.captureDate}>{formatCaptureDate(capture.startedAt)}</div>
                        <div className={styles.captureMeta}>
                          <span>{formatDuration(capture.duration)}</span>
                          <span>{formatBytes(capture.totalBytes)}</span>
                          {capture.streams.map(s => (
                            <span key={s.id} className={styles.streamBadge}>
                              {STREAM_LABELS[s.type] ?? s.type}
                            </span>
                          ))}
                        </div>
                      </div>
                      {primaryFilename && (
                        <button
                          className={styles.previewBtn}
                          onClick={e => {
                            e.stopPropagation()
                            setPreviewId(isPreviewing ? null : capture.id)
                          }}
                        >
                          {isPreviewing ? '✕ Close' : '▶ Preview'}
                        </button>
                      )}
                    </div>
                    {isPreviewing && primaryFilename && (
                      <div className={styles.capturePreview}>
                        <video
                          src={`/api/captures/${capture.id}/media/${primaryFilename}`}
                          controls
                          muted
                          style={{ width: '100%', maxHeight: 200, borderRadius: 8, marginTop: 8 }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Project name */}
        <div className={styles.formSection}>
          <label className={styles.formLabel}>Project Name</label>
          <input
            className={styles.formInput}
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            placeholder="My Project"
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {/* Upload progress bar */}
        {creating && uploadPercent > 0 && (
          <div className={styles.uploadProgress}>
            <div className={styles.uploadBar}>
              <div className={styles.uploadFill} style={{ width: `${uploadPercent}%` }} />
            </div>
            <div className={styles.uploadLabel}>{progress}</div>
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          {creating ? (
            <button className={styles.cancelBtn} onClick={() => abortRef.current?.abort()}>Cancel Upload</button>
          ) : (
            <button className={styles.cancelBtn} onClick={() => navigate('/')}>Cancel</button>
          )}
          <button className={styles.createBtn} onClick={handleCreate} disabled={creating || !projectName}>
            {creating ? (
              <>{uploadPercent === 0 ? progress : 'Uploading...'}</>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                {file ? 'Create & Import' : selectedCapture ? 'Create & Import' : 'Create Project'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
