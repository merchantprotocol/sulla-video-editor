import { useNavigate } from 'react-router-dom'
import { useState, useRef } from 'react'
import styles from './NewProject.module.css'

const ruleTemplates = [
  { id: 'podcast', icon: '🎙️', name: 'Podcast', desc: 'Clean fillers, normalize, add intro/outro' },
  { id: 'youtube', icon: '🎬', name: 'YouTube', desc: 'Hook optimization, B-roll, captions, end card' },
  { id: 'social', icon: '📱', name: 'Social Clips', desc: 'Extract highlights, reformat, add captions' },
  { id: 'tutorial', icon: '📚', name: 'Tutorial', desc: 'Section headers, code callouts, pacing' },
  { id: 'interview', icon: '🎤', name: 'Interview', desc: 'Speaker labels, split-screen, Q&A segments' },
  { id: 'custom', icon: '+', name: 'Custom', desc: 'Start with no rules, build your own' },
]

export default function NewProject() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedRule, setSelectedRule] = useState('podcast')
  const [file, setFile] = useState<File | null>(null)
  const [projectName, setProjectName] = useState('')
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

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

    try {
      const token = localStorage.getItem('sulla_token')
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      }

      // 1. Create project
      setProgress('Creating project...')
      const createRes = await fetch('/api/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: projectName, rule_template: selectedRule }),
      })
      if (!createRes.ok) throw new Error((await createRes.json()).error)
      const { project } = await createRes.json()

      // 2. Upload media (if file selected)
      if (file) {
        setProgress(`Uploading ${file.name}...`)
        const uploadRes = await fetch(`/api/projects/${project.id}/import`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
            'X-Filename': file.name,
          },
          body: file,
        })
        if (!uploadRes.ok) throw new Error((await uploadRes.json()).error)

        // 3. Transcribe
        setProgress('Transcribing audio...')
        const transcribeRes = await fetch(`/api/projects/${project.id}/transcribe`, {
          method: 'POST',
          headers,
        })
        if (!transcribeRes.ok) {
          // Non-fatal — user can transcribe later
          console.warn('Transcription failed, continuing')
        }
      }

      navigate(`/editor/${project.id}`)
    } catch (err: any) {
      setError(err.message || 'Failed to create project')
      setCreating(false)
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

        {/* Rule template */}
        <div className={styles.formSection}>
          <label className={styles.formLabel}>Editing Rules</label>
          <div className={styles.ruleGrid}>
            {ruleTemplates.map(r => (
              <div
                key={r.id}
                className={`${styles.ruleCard} ${selectedRule === r.id ? styles.selected : ''}`}
                onClick={() => setSelectedRule(r.id)}
              >
                <div className={styles.ruleIcon}>{r.icon}</div>
                <div className={styles.ruleInfo}>
                  <div className={styles.ruleName}>{r.name}</div>
                  <div className={styles.ruleDesc}>{r.desc}</div>
                </div>
                <div className={styles.ruleCheck}>
                  {selectedRule === r.id && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {/* Actions */}
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={() => navigate('/')}>Cancel</button>
          <button className={styles.createBtn} onClick={handleCreate} disabled={creating || !projectName}>
            {creating ? (
              <>{progress}</>
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
