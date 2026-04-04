import { Link, useParams } from 'react-router-dom'
import styles from './Editor.module.css'

export default function Editor() {
  const { id } = useParams()

  return (
    <div className={styles.app}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <Link to="/" className={styles.logo}>sulla</Link>
        <div className={styles.breadcrumb}>
          <span>/</span>
          <strong>{id || 'untitled'}</strong>
        </div>
        <div className={styles.spacer} />
        <button className={styles.exportBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export
        </button>
      </div>

      {/* Main content area */}
      <div className={styles.main}>
        {/* Transcript */}
        <div className={styles.transcript}>
          <div className={styles.toolbar}>
            <span className={styles.tbLabel}>Transcript editor — full implementation in prototype</span>
          </div>
          <div className={styles.docScroll}>
            <div className={styles.docContent}>
              <p className={styles.placeholder}>
                The full transcript editor with text selection, filler word detection,
                silence trimming, speaker management, undo/redo, and keyboard shortcuts
                is implemented in the HTML prototype at <code>designs/v1a-interactive/editor/index.html</code>.
                <br /><br />
                This React scaffold will be built out as the real app — connecting to
                Cloudflare Workers for transcription, AI analysis, and video export.
              </p>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className={styles.rightPanel}>
          <div className={styles.videoSection}>
            <div className={styles.videoFrame}>
              <span className={styles.videoPlaceholder}>Video Preview</span>
            </div>
          </div>
          <div className={styles.suggestions}>
            <div className={styles.sectionTitle}>Sulla Suggestions</div>
            <div className={styles.sugCard}>
              <div className={styles.sugIndicator} />
              <div className={styles.sugContent}>
                <div className={styles.sugTitle}>Transcript not loaded</div>
                <div className={styles.sugDesc}>Import media to start editing</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Track panel */}
      <div className={styles.trackPanel}>
        <div className={styles.trackBar}>
          <span className={styles.trackTitle}>Tracks</span>
          <div className={styles.spacer} />
          <span className={styles.trackTime}>0:00 / 0:00</span>
        </div>
      </div>
    </div>
  )
}
