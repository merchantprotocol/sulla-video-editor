import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { LayoutRenderer } from './renderer/LayoutRenderer'

/**
 * Sulla Layout Renderer Entry Point
 *
 * The Puppeteer capture service controls frames via window.setFrame(n).
 * Config injected via window.__SULLA__ before page load.
 * Layout injected via window.__SULLA_LAYOUT__.
 * Track paths injected via window.__SULLA_TRACKS__.
 */

const config = window.__SULLA__ || {
  fps: 30,
  width: 1920,
  height: 1080,
  totalFrames: 30 * 10,
}

const layout = window.__SULLA_LAYOUT__ || null
const tracks = window.__SULLA_TRACKS__ || {}

function App() {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    // Expose setFrame for Puppeteer frame-by-frame capture
    window.setFrame = (f) => setFrame(f)

    // Signal that the composition is ready
    window.compositionReady = true

    // For development: auto-play at real-time
    if (!window.__SULLA__) {
      let f = 0
      const interval = setInterval(() => {
        f = (f + 1) % config.totalFrames
        setFrame(f)
      }, 1000 / config.fps)
      return () => clearInterval(interval)
    }
  }, [])

  if (!layout) {
    return (
      <div style={{ width: config.width, height: config.height, background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6e7681', fontFamily: 'Inter, sans-serif' }}>
        No layout data — inject window.__SULLA_LAYOUT__
      </div>
    )
  }

  return (
    <LayoutRenderer
      layout={layout}
      frame={frame}
      fps={config.fps}
      width={config.width}
      height={config.height}
      tracks={tracks}
    />
  )
}

createRoot(document.getElementById('root')).render(<App />)
