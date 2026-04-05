import styles from './AutoClipsPanel.module.css'

interface Props {
  open: boolean
  onClose: () => void
  onExportAll?: () => void
}

const clips = [
  { id: '1', title: '"The key innovation here is the teleprompter"', dur: '0:42', format: '16:9', score: 92, level: 'high' as const, time: '00:34' },
  { id: '2', title: '"Think of it like having a multi-camera setup from your laptop"', dur: '0:38', format: '9:16', score: 87, level: 'high' as const, time: '00:22' },
  { id: '3', title: '"Let me show you how the layout system works"', dur: '0:55', format: '16:9', score: 74, level: 'med' as const, time: '01:12' },
  { id: '4', title: '"You hit record and all active sources start capturing"', dur: '0:28', format: '9:16', score: 71, level: 'med' as const, time: '03:45' },
  { id: '5', title: '"The audio driver handles mic and system audio separately"', dur: '1:12', format: '16:9', score: 65, level: 'med' as const, time: '04:20' },
  { id: '6', title: '"Each video source can be toggled independently"', dur: '0:45', format: '1:1', score: 61, level: 'med' as const, time: '01:58' },
  { id: '7', title: '"Everything gets saved as separate files"', dur: '0:22', format: '16:9', score: 48, level: 'low' as const, time: '05:40' },
]

export default function AutoClipsPanel({ open, onClose, onExportAll }: Props) {
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
      </div>
    </div>
  )
}
