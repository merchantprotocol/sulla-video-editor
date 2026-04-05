import { useState, useEffect, useCallback } from 'react'
import styles from './ExportPanel.module.css'

interface ExportEntry {
  name: string
  size: number
  created_at: string
}

interface Props {
  open: boolean
  onClose: () => void
  onExport?: (options: { format: string; resolution: string; quality: string; studioSound?: boolean; normalizeAudio?: boolean }) => Promise<any>
  projectName: string
  projectId?: string
}

const formats = ['16:9', '9:16', '1:1', '4:5']
const resolutions = ['1080p', '720p', '4k']
const qualities = ['high', 'medium', 'low']

export default function ExportPanel({ open, onClose, onExport, projectName, projectId }: Props) {
  const [format, setFormat] = useState('16:9')
  const [resolution, setResolution] = useState('1080p')
  const [quality, setQuality] = useState('high')
  const [includeCaptions, setIncludeCaptions] = useState(true)
  const [studioSound, setStudioSound] = useState(true)
  const [autoReframe, setAutoReframe] = useState(true)
  const [normalizeAudio, setNormalizeAudio] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [exports, setExports] = useState<ExportEntry[]>([])

  const fetchExports = useCallback(async () => {
    if (!projectId) return
    try {
      const token = localStorage.getItem('sulla_token')
      const res = await fetch(`/api/projects/${projectId}/exports`, {
        headers: { Authorization: 'Bearer ' + token },
      })
      if (res.ok) {
        const data = await res.json()
        setExports(data.exports || [])
      }
    } catch { /* ignore */ }
  }, [projectId])

  useEffect(() => {
    if (open && projectId) fetchExports()
  }, [open, projectId, fetchExports])

  async function handleDeleteExport(filename: string) {
    if (!projectId) return
    try {
      const token = localStorage.getItem('sulla_token')
      await fetch(`/api/projects/${projectId}/exports/${filename}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token },
      })
      setExports(prev => prev.filter(e => e.name !== filename))
    } catch { /* ignore */ }
  }

  async function handleExportSSE() {
    setExporting(true)
    setError('')
    setProgress('Starting render...')
    setProgressPct(0)
    setResult(null)

    try {
      const token = localStorage.getItem('sulla_token')
      const res = await fetch(`/api/projects/${projectId}/render/stream`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format, resolution, quality, studioSound, normalizeAudio }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Server error ${res.status}`)
      }

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
          const json = line.slice(6).trim()
          if (!json) continue

          try {
            const evt = JSON.parse(json)
            if (evt.type === 'progress') {
              setProgressPct(evt.progress)
              setProgress(`Rendering... ${evt.progress}%`)
            } else if (evt.type === 'done') {
              setResult(evt)
              setProgress('')
              setProgressPct(100)
              fetchExports()
            } else if (evt.type === 'error') {
              throw new Error(evt.error)
            }
          } catch (parseErr: any) {
            if (parseErr.message && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Export failed')
      setProgress('')
    } finally {
      setExporting(false)
    }
  }

  async function handleExportFallback() {
    if (!onExport) return
    setExporting(true)
    setError('')
    setProgress('Applying edits and rendering...')
    setProgressPct(0)
    setResult(null)

    try {
      const data = await onExport({ format, resolution, quality, studioSound, normalizeAudio })
      setResult(data)
      setProgress('')
    } catch (err: any) {
      setError(err.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  function handleExport() {
    if (projectId) {
      handleExportSSE()
    } else {
      handleExportFallback()
    }
  }

  function formatSize(bytes: number) {
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
    return `${(bytes / 1e3).toFixed(0)} KB`
  }

  function formatTime(ms: number) {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }

  if (!open) return null

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>Export Video</h3>
        <button className={styles.close} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div className={styles.body}>
        {result ? (
          <div className={styles.resultCard}>
            <div className={styles.resultIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div className={styles.resultTitle}>Export complete</div>
            <div className={styles.resultMeta}>
              {result.name} · {formatSize(result.size)} · {formatTime(result.edited_duration_ms)}
            </div>
            {result.cuts_applied > 0 && (
              <div className={styles.resultDetail}>
                {result.cuts_applied} cuts applied · saved {formatTime(result.original_duration_ms - result.edited_duration_ms)}
              </div>
            )}
            <a className={styles.downloadBtn} href={`/api/projects/${result.path?.split('/projects/')[1]?.split('/')[0]}/exports/${result.name}`} download>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download
            </a>
            <button className={styles.anotherBtn} onClick={() => setResult(null)}>Export another format</button>
          </div>
        ) : (
          <>
            <div className={styles.section}>
              <div className={styles.label}>Format</div>
              <div className={styles.chips}>
                {formats.map(f => (
                  <button key={f} className={`${styles.chip} ${format === f ? styles.chipActive : ''}`} onClick={() => setFormat(f)}>{f}</button>
                ))}
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.label}>Resolution</div>
              <div className={styles.chips}>
                {resolutions.map(r => (
                  <button key={r} className={`${styles.chip} ${resolution === r ? styles.chipActive : ''}`} onClick={() => setResolution(r)}>{r}</button>
                ))}
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.label}>Quality</div>
              <div className={styles.chips}>
                {qualities.map(q => (
                  <button key={q} className={`${styles.chip} ${quality === q ? styles.chipActive : ''}`} onClick={() => setQuality(q)}>{q}</button>
                ))}
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.optRow}><span>Codec</span><span>H.264 (MP4)</span></div>
              <div className={styles.optRow}><span>Audio</span><span>AAC 192kbps</span></div>
            </div>

            <div className={styles.section}>
              <div className={styles.label}>Options</div>
              <div className={styles.optRow}>
                <span>Include captions</span>
                <div className={`${styles.toggle} ${includeCaptions ? styles.toggleOn : ''}`} onClick={() => setIncludeCaptions(!includeCaptions)} />
              </div>
              <div className={styles.optRow}>
                <span>Studio sound</span>
                <div className={`${styles.toggle} ${studioSound ? styles.toggleOn : ''}`} onClick={() => setStudioSound(!studioSound)} />
              </div>
              <div className={styles.optRow}>
                <span>Auto-reframe (face track)</span>
                <div className={`${styles.toggle} ${autoReframe ? styles.toggleOn : ''}`} onClick={() => setAutoReframe(!autoReframe)} />
              </div>
              <div className={styles.optRow}>
                <span>Normalize audio</span>
                <div className={`${styles.toggle} ${normalizeAudio ? styles.toggleOn : ''}`} onClick={() => setNormalizeAudio(!normalizeAudio)} />
              </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {exporting && projectId && (
              <div className={styles.progressWrap}>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                </div>
                <span className={styles.progressLabel}>{progressPct}%</span>
              </div>
            )}

            <button className={styles.exportBtn} onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <><span className={styles.spinner} /> {progress}</>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Export Video
                </>
              )}
            </button>

            {projectId && (
              <div className={styles.section} style={{ marginTop: 8 }}>
                <div className={styles.label}>Export History</div>
                {exports.length === 0 ? (
                  <div className={styles.historyEmpty}>No exports yet</div>
                ) : (
                  <div className={styles.historyList}>
                    {exports.map(exp => (
                      <div key={exp.name} className={styles.historyItem}>
                        <div className={styles.historyInfo}>
                          <a
                            className={styles.historyName}
                            href={`/api/projects/${projectId}/exports/${exp.name}`}
                            download
                          >
                            {exp.name}
                          </a>
                          <span className={styles.historyMeta}>
                            {formatSize(exp.size)} · {new Date(exp.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          className={styles.historyDelete}
                          onClick={() => handleDeleteExport(exp.name)}
                          title="Delete export"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
