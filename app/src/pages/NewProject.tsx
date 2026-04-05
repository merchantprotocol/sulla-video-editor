import { useNavigate } from 'react-router-dom'
import { useState, useRef } from 'react'
import { chunkedUpload, formatBytes } from '../lib/chunkedUpload'
import { useTemplates, type Template, type TemplateConfig } from '../hooks/useTemplates'
import styles from './NewProject.module.css'

const ruleIcons: Record<string, string> = {
  podcast: '🎙️', youtube: '🎬', social: '📱', tutorial: '📚', interview: '🎤',
}

export default function NewProject() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { templates, loading: templatesLoading } = useTemplates()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [projectName, setProjectName] = useState('')
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState('')
  const [uploadPercent, setUploadPercent] = useState(0)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
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
      if (!projectName) {
        setProjectName(f.name.replace(/\.\w+$/, '').replace(/[_-]/g, ' '))
      }
    }
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

      // 1. Create project
      setProgress('Creating project...')
      const selected = templates.find(t => t.id === selectedTemplateId)
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: projectName,
          template_id: selectedTemplateId || undefined,
          rule_template: selected?.slug || 'custom',
        }),
        signal: abort.signal,
      })
      if (!createRes.ok) throw new Error((await createRes.json()).error)
      const { project } = await createRes.json()

      // 2. Upload media via chunked upload (if file selected)
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
          className={`${styles.dropZone} ${file ? styles.hasFile : ''}`}
          onClick={() => !file && fileInputRef.current?.click()}
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

        {/* Template selection */}
        <div className={styles.formSection}>
          <label className={styles.formLabel}>Template</label>
          <div className={styles.ruleGrid}>
            {templatesLoading ? (
              <div style={{ padding: 12, color: 'var(--text-dim)', fontSize: 12 }}>Loading templates...</div>
            ) : (
              <>
                {templates.map(t => {
                  const cfg = t.config as TemplateConfig | undefined
                  const icon = ruleIcons[t.slug || ''] || '🎞️'
                  const rulesDesc = cfg?.rules ? [
                    cfg.rules.removeFillers && 'Remove fillers',
                    cfg.rules.trimSilence?.enabled && 'Trim silence',
                    cfg.rules.studioSound && 'Studio sound',
                    cfg.rules.autoCaptions && 'Auto captions',
                    cfg.rules.autoClips && 'Auto clips',
                  ].filter(Boolean).join(', ') : ''

                  return (
                    <div
                      key={t.id}
                      className={`${styles.ruleCard} ${selectedTemplateId === t.id ? styles.selected : ''}`}
                      onClick={() => setSelectedTemplateId(t.id)}
                    >
                      <div className={styles.ruleIcon}>{icon}</div>
                      <div className={styles.ruleInfo}>
                        <div className={styles.ruleName}>
                          {t.name}
                          {t.is_system && <span className={styles.systemBadge}>system</span>}
                        </div>
                        <div className={styles.ruleDesc}>{t.description || rulesDesc}</div>
                      </div>
                      <div className={styles.ruleCheck}>
                        {selectedTemplateId === t.id && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                    </div>
                  )
                })}
                {/* Custom / no template option */}
                <div
                  className={`${styles.ruleCard} ${selectedTemplateId === null ? styles.selected : ''}`}
                  onClick={() => setSelectedTemplateId(null)}
                >
                  <div className={styles.ruleIcon}>+</div>
                  <div className={styles.ruleInfo}>
                    <div className={styles.ruleName}>Custom</div>
                    <div className={styles.ruleDesc}>Start with no rules, build your own</div>
                  </div>
                  <div className={styles.ruleCheck}>
                    {selectedTemplateId === null && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                </div>
              </>
            )}
          </div>
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
                {file ? 'Create & Import' : 'Create Project'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
