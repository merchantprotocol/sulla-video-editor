import styles from './AutoClipsPanel.module.css'

export interface AutoClip {
  id: string
  title: string
  dur: string
  format: string
  score: number
  level: 'high' | 'med' | 'low'
  time: string
  start_ms: number
  end_ms: number
}

interface Props {
  open: boolean
  onClose: () => void
  onExportAll?: () => void
  clips: AutoClip[]
}

export default function AutoClipsPanel({ open, onClose, onExportAll, clips }: Props) {
  if (!open) return null

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>Auto Clips</h3>
        <span className={styles.clipCount}>{clips.length} clips</span>
        <div className={styles.spacer} />
        <button className={styles.close} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className={styles.body}>
        {clips.length === 0 ? (
          <div className={styles.emptyState} style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted, #888)', fontSize: 13 }}>
            No clips detected yet — transcribe your video first
          </div>
        ) : (
          <>
            {clips.map(clip => (
              <div key={clip.id} className={styles.clipCard}>
                <div className={styles.clipThumb}>
                  {clip.format}
                  <span className={styles.clipDur}>{clip.dur}</span>
                </div>
                <div className={styles.clipInfo}>
                  <div className={styles.clipTitle}>{clip.title}</div>
                  <div className={styles.clipMeta}>
                    <span className={`${styles.virality} ${clip.level === 'high' ? styles.viralityHigh : clip.level === 'med' ? styles.viralityMed : ''}`}>{clip.score} viral</span>
                    <span>{clip.time}</span>
                  </div>
                </div>
              </div>
            ))}

            <button className={styles.exportBtn} onClick={onExportAll}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export All Clips
            </button>
          </>
        )}
      </div>
    </div>
  )
}
