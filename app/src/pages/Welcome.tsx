import { Link } from 'react-router-dom'
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
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return `${Math.floor(days / 7)} weeks ago`
}

export default function Welcome() {
  const { projects, loading } = useProjects()

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

        {/* Projects list */}
        <div className={styles.sectionTitle}>
          Recent Projects <span className={styles.count}>{projects.length}</span>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No projects yet. Create your first one!</p>
          </div>
        ) : (
          <div className={styles.projectsGrid}>
            {projects.map(p => (
              <Link key={p.id} to={`/editor/${p.id}`} className={styles.projectCard}>
                <div className={styles.projectThumb}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  {p.duration_ms && <span className={styles.durationBadge}>{formatDuration(p.duration_ms)}</span>}
                  <div className={`${styles.statusDot} ${styles[p.status]}`} />
                </div>
                <div className={styles.projectBody}>
                  <div className={styles.projectName}>{p.name}</div>
                  <div className={styles.projectMeta}>
                    <span className={`${styles.tag} ${styles[p.status]}`}>{p.status}</span>
                    {p.resolution && <span>{p.resolution}</span>}
                    {p.file_size ? <span>{formatSize(p.file_size)}</span> : null}
                    <span>{timeAgo(p.updated_at)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
