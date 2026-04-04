import { Link } from 'react-router-dom'
import styles from './Welcome.module.css'

const recentProjects = [
  { id: 'demo-april', name: 'product-demo-april', duration: '12:47', status: 'draft', time: '2 hours ago', type: 'video' },
  { id: 'podcast-42', name: 'podcast-ep42', duration: '45:12', status: 'edited', time: 'Yesterday', type: 'audio' },
  { id: 'pitch-v3', name: 'investor-pitch-v3', duration: '8:34', status: 'edited', time: '3 days ago', type: 'video' },
  { id: 'trailer', name: 'sulla-desktop-trailer', duration: '3:22', status: 'edited', time: 'Last week', type: 'video' },
  { id: 'standup', name: 'team-standup-march28', duration: '22:15', status: 'draft', time: 'Last week', type: 'video' },
  { id: 'podcast-41', name: 'podcast-ep41', duration: '1:02:41', status: 'edited', time: '2 weeks ago', type: 'audio' },
]

export default function Welcome() {
  return (
    <div className={styles.main}>
      <div className={styles.container}>
        <div className={styles.hero}>
          <h1 className={styles.greeting}>Welcome back, Jonathon</h1>
          <p className={styles.sub}>What are you editing today?</p>
        </div>

        <div className={styles.quickActions}>
          <Link to="/new" className={styles.qaCard}>
            <div className={`${styles.qaIcon} ${styles.blue}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div className={styles.qaTitle}>New Project</div>
            <div className={styles.qaDesc}>Import video or audio files and start editing with AI-powered tools</div>
          </Link>
          <Link to="/templates" className={styles.qaCard}>
            <div className={`${styles.qaIcon} ${styles.purple}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            </div>
            <div className={styles.qaTitle}>Templates</div>
            <div className={styles.qaDesc}>Create reusable editing templates with scenes, styles, and rule sets</div>
          </Link>
          <Link to="/new" className={styles.qaCard}>
            <div className={`${styles.qaIcon} ${styles.green}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <div className={styles.qaTitle}>Quick Edit</div>
            <div className={styles.qaDesc}>Drop a file and let Sulla auto-clean fillers, silence, and generate clips</div>
          </Link>
        </div>

        <div className={styles.sectionTitle}>
          Recent Projects <span className={styles.count}>{recentProjects.length}</span>
        </div>
        <div className={styles.projectsGrid}>
          {recentProjects.map(p => (
            <Link key={p.id} to={`/editor/${p.id}`} className={styles.projectCard}>
              <div className={styles.projectThumb}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  {p.type === 'video'
                    ? <polygon points="5 3 19 12 5 21 5 3"/>
                    : <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></>
                  }
                </svg>
                <span className={styles.durationBadge}>{p.duration}</span>
                <div className={`${styles.statusDot} ${styles[p.status]}`} />
              </div>
              <div className={styles.projectBody}>
                <div className={styles.projectName}>{p.name}</div>
                <div className={styles.projectMeta}>
                  <span className={`${styles.tag} ${styles[p.status]}`}>{p.status}</span>
                  {p.time}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className={styles.sectionTitle}>
          Templates <span className={styles.count}>4</span>
        </div>
        <div className={styles.templatesRow}>
          {[
            { name: 'Podcast Episode', theme: 'podcast' },
            { name: 'YouTube Video', theme: 'youtube' },
            { name: 'Social Clips', theme: 'social' },
            { name: 'Tutorial / Course', theme: 'tutorial' },
          ].map(t => (
            <Link key={t.theme} to="/templates" className={styles.templateCard}>
              <div className={`${styles.templateThumb} ${styles[t.theme]}`}>{t.theme}</div>
              <div className={styles.templateName}>{t.name}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
