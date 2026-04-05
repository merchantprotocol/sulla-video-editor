import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useProjects, type Project } from '../hooks/useProjects'
import styles from './Welcome.module.css'

function formatDuration(ms: number | null) {
  if (!ms) return '--:--'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return `${Math.floor(days / 7)} weeks ago`
}

export default function Welcome() {
  const { projects, loading, deleteProject } = useProjects()
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this project and all its files?')) return
    setDeleting(id)
    await deleteProject(id)
    setDeleting(null)
  }

  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <div className={styles.hero}>
          <h1 className={styles.greeting}>Welcome back</h1>
          <p className={styles.sub}>What are you editing today?</p>
        </div>

        <div className={styles.quickActions}>
          <Link to="/new" className={styles.qaCard}>
            <div className={`${styles.qaIcon} ${styles.blue}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div className={styles.qaTitle}>New Project</div>
            <div className={styles.qaDesc}>Import video or audio files and start editing</div>
          </Link>
          <Link to="/templates" className={styles.qaCard}>
            <div className={`${styles.qaIcon} ${styles.purple}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </div>
            <div className={styles.qaTitle}>Templates</div>
            <div className={styles.qaDesc}>Create reusable scenes, styles, and rule sets</div>
          </Link>
          <Link to="/new" className={styles.qaCard}>
            <div className={`${styles.qaIcon} ${styles.green}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <div className={styles.qaTitle}>Quick Edit</div>
            <div className={styles.qaDesc}>Drop a file and let Sulla auto-clean it</div>
          </Link>
        </div>

        <div className={styles.sectionTitle}>
          Projects <span className={styles.count}>{projects.length}</span>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="48" height="48"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            </div>
            <p>No projects yet</p>
            <Link to="/new" className={styles.emptyBtn}>Create your first project</Link>
          </div>
        ) : (
          <div className={styles.projectsList}>
            {projects.map(p => (
              <div key={p.id} className={styles.projectRow}>
                {/* Thumbnail / Video preview */}
                <div className={styles.projectThumb}>
                  {p.status === 'exported' && playingId === p.id ? (
                    <video
                      className={styles.thumbVideo}
                      src={`/api/projects/${p.id}/exports/composition.mp4`}
                      autoPlay
                      controls
                      onEnded={() => setPlayingId(null)}
                    />
                  ) : (
                    <div className={styles.thumbPlaceholder} onClick={() => p.status === 'exported' && setPlayingId(p.id)}>
                      {p.status === 'exported' ? (
                        <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" width="32" height="32"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                      )}
                    </div>
                  )}
                  {p.duration_ms && <span className={styles.durationBadge}>{formatDuration(p.duration_ms)}</span>}
                </div>

                {/* Project info */}
                <div className={styles.projectInfo}>
                  <Link to={`/editor/${p.id}`} className={styles.projectName}>{p.name}</Link>
                  <div className={styles.projectMeta}>
                    <span className={`${styles.statusTag} ${styles[p.status]}`}>{p.status}</span>
                    {p.resolution && <span>{p.resolution}</span>}
                    {p.file_size ? <span>{formatSize(p.file_size)}</span> : null}
                    <span>{timeAgo(p.updated_at)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className={styles.projectActions}>
                  {p.status === 'exported' && (
                    <a
                      className={styles.actionBtn}
                      href={`/api/projects/${p.id}/exports/composition.mp4`}
                      download={`${p.name}.mp4`}
                      title="Download"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                  )}
                  <Link className={styles.actionBtn} to={`/editor/${p.id}`} title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  </Link>
                  <button
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    onClick={(e) => handleDelete(e, p.id)}
                    disabled={deleting === p.id}
                    title="Delete"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
