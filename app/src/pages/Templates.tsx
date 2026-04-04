import { useState } from 'react'
import styles from './Templates.module.css'

const templates = [
  { id: 'podcast', name: 'Podcast Episode', color: 'var(--accent)', scenes: 7 },
  { id: 'youtube', name: 'YouTube Video', color: 'var(--red)', scenes: 9 },
  { id: 'social', name: 'Social Clips', color: 'var(--green)', scenes: 4 },
  { id: 'tutorial', name: 'Tutorial', color: 'var(--purple)', scenes: 6 },
  { id: 'interview', name: 'Interview', color: 'var(--yellow)', scenes: 5 },
]

const scenes = [
  { num: 1, name: 'Brand Intro', type: 'Title Card', dur: '0:04' },
  { num: 2, name: 'Welcome', type: 'Full Frame', dur: '0:34' },
  { num: 3, name: 'Main Content', type: 'PiP + Lower Third', dur: '2:18' },
  { num: 4, name: 'B-Roll Cut', type: 'B-Roll Overlay', dur: '0:12' },
  { num: 5, name: 'Deep Dive', type: 'PiP', dur: '1:45' },
  { num: 6, name: 'Highlight Quote', type: 'Caption Focus', dur: '0:08' },
  { num: 7, name: 'CTA + Outro', type: 'Title Card', dur: '0:06' },
]

export default function Templates() {
  const [selectedTemplate, setSelectedTemplate] = useState('podcast')
  const [selectedScene, setSelectedScene] = useState(3)

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sbSection}>
          <div className={styles.sbHeader}>
            <h3>Templates</h3>
            <div className={styles.spacer} />
            <button className={styles.sbAdd}>+</button>
          </div>
          <div className={styles.sbList}>
            {templates.map(t => (
              <div
                key={t.id}
                className={`${styles.sbItem} ${selectedTemplate === t.id ? styles.selected : ''}`}
                onClick={() => setSelectedTemplate(t.id)}
              >
                <div className={styles.sbDot} style={{ background: t.color }} />
                <span>{t.name}</span>
                <span className={styles.sbCount}>{t.scenes}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.sbSection} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className={styles.sbHeader}>
            <h3>Scenes</h3>
            <div className={styles.spacer} />
            <button className={styles.sbAdd}>+</button>
          </div>
          <div className={styles.scenesList}>
            {scenes.map(s => (
              <div
                key={s.num}
                className={`${styles.sceneItem} ${selectedScene === s.num ? styles.selected : ''}`}
                onClick={() => setSelectedScene(s.num)}
              >
                <div className={`${styles.sceneNum} ${selectedScene === s.num ? styles.activeNum : ''}`}>{s.num}</div>
                <div className={styles.sceneInfo}>
                  <div className={styles.sceneName}>{s.name}</div>
                  <div className={styles.sceneType}>{s.type}</div>
                </div>
                <span className={styles.sceneDur}>{s.dur}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className={styles.canvas}>
        <div className={styles.canvasFrame}>
          <div className={styles.canvasPlaceholder}>
            <p>Visual canvas editor</p>
            <p className={styles.canvasHint}>
              Drag PiP, lower thirds, and captions on the canvas.
              Full implementation in prototype at <code>designs/v1a-interactive/templates/</code>
            </p>
          </div>
        </div>
        <div className={styles.formatBadge}>1920 × 1080</div>
      </div>

      {/* Properties bar */}
      <div className={styles.propsBar}>
        <span className={styles.propsEmpty}>Click an element on the canvas to edit its properties</span>
      </div>
    </div>
  )
}
