import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
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
  const [selectedRule, setSelectedRule] = useState('podcast')
  const [hasFile, setHasFile] = useState(false)
  const [projectName, setProjectName] = useState('')

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <h1 className={styles.title}>New Project</h1>
        <p className={styles.desc}>Import your media and choose how Sulla should edit it.</p>

        <div
          className={`${styles.dropZone} ${hasFile ? styles.hasFile : ''}`}
          onClick={() => setHasFile(true)}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); setHasFile(true); }}
        >
          {!hasFile ? (
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
                <div className={styles.fileName}>product-demo-april.mp4</div>
                <div className={styles.fileMeta}>12:47 · 1920x1080 · 1.2 GB</div>
              </div>
              <button className={styles.fileRemove} onClick={e => { e.stopPropagation(); setHasFile(false); }}>✕</button>
            </div>
          )}
        </div>

        <div className={styles.formSection}>
          <label className={styles.formLabel}>Project Name</label>
          <input
            className={styles.formInput}
            value={projectName || 'product-demo-april'}
            onChange={e => setProjectName(e.target.value)}
          />
        </div>

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

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={() => navigate('/')}>Cancel</button>
          <button className={styles.createBtn} onClick={() => navigate('/editor/new-project')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            Create Project & Import
          </button>
        </div>
      </div>
    </div>
  )
}
