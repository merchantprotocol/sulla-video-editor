import { useState } from 'react'
import styles from './CaptionsPanel.module.css'

interface Props {
  open: boolean
  onClose: () => void
  onGenerate?: (options: any) => void
}

const captionStyles = [
  { id: 'bold', name: 'Bold', demo: <span style={{ fontWeight: 700 }}>Bold</span> },
  { id: 'highlight', name: 'Highlight', demo: <><span style={{ background: 'var(--accent)', color: 'white', padding: '1px 4px', borderRadius: 3 }}>High</span>light</> },
  { id: 'outline', name: 'Outline', demo: <span style={{ color: 'transparent', WebkitTextStroke: '1.5px var(--text-primary)' }}>Outline</span> },
  { id: 'box', name: 'Box', demo: <span style={{ background: 'rgba(0,0,0,0.7)', color: 'white', padding: '2px 6px', borderRadius: 4 }}>Box</span> },
]

export default function CaptionsPanel({ open, onClose, onGenerate }: Props) {
  const [style, setStyle] = useState('bold')
  const [burnIn, setBurnIn] = useState(true)
  const [wordByWord, setWordByWord] = useState(true)
  const [emoji, setEmoji] = useState(false)
  const [position, setPosition] = useState('bottom-center')
  const [fontSize, setFontSize] = useState(32)
  const [maxWords, setMaxWords] = useState(4)

  if (!open) return null

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>Captions</h3>
        <button className={styles.close} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.label}>Caption Style</div>
        <div className={styles.styleGrid}>
          {captionStyles.map(s => (
            <div key={s.id} className={`${styles.styleCard} ${style === s.id ? styles.styleCardSelected : ''}`} onClick={() => setStyle(s.id)}>
              <div className={styles.demoText}>{s.demo}</div>
              <div className={styles.styleName}>{s.name}</div>
            </div>
          ))}
        </div>

        <div className={styles.label} style={{ marginTop: 16 }}>Options</div>
        <div className={styles.optRow}>
          <span>Burn into video</span>
          <div className={`${styles.toggle} ${burnIn ? styles.toggleOn : ''}`} onClick={() => setBurnIn(!burnIn)} />
        </div>
        <div className={styles.optRow}>
          <span>Word-by-word highlight</span>
          <div className={`${styles.toggle} ${wordByWord ? styles.toggleOn : ''}`} onClick={() => setWordByWord(!wordByWord)} />
        </div>
        <div className={styles.optRow}>
          <span>Emoji detection</span>
          <div className={`${styles.toggle} ${emoji ? styles.toggleOn : ''}`} onClick={() => setEmoji(!emoji)} />
        </div>
        <div className={styles.optRow}>
          <span>Position</span>
          <select className={styles.select} value={position} onChange={e => setPosition(e.target.value)}>
            <option value="bottom-center">Bottom center</option>
            <option value="top-center">Top center</option>
            <option value="center">Center</option>
          </select>
        </div>
        <div className={styles.optRow}>
          <span>Font size</span>
          <div className={styles.sliderRow}>
            <input type="range" min="16" max="48" value={fontSize} className={styles.slider} onChange={e => setFontSize(Number(e.target.value))} />
            <span className={styles.sliderVal}>{fontSize}px</span>
          </div>
        </div>
        <div className={styles.optRow}>
          <span>Max words per line</span>
          <select className={styles.select} value={maxWords} onChange={e => setMaxWords(Number(e.target.value))}>
            {[3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <button className={styles.generateBtn} onClick={() => onGenerate?.({ style, burnIn, wordByWord, emoji, position, fontSize, maxWords })}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
          Generate Captions
        </button>
      </div>
    </div>
  )
}
