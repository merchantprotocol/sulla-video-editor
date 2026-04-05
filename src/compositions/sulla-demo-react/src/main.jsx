import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Composition } from './Composition'

/**
 * Sulla Video Composition Entry Point
 *
 * The renderer controls frames via window.setFrame(n).
 * Config is injected via window.__SULLA__ before page load.
 */

const config = window.__SULLA__ || {
  fps: 30,
  width: 1920,
  height: 1080,
  totalFrames: 30 * 29, // 29 seconds
}

function App() {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    // Expose setFrame to Puppeteer for frame-by-frame capture
    window.setFrame = (f) => setFrame(f)

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

  return (
    <Composition
      frame={frame}
      fps={config.fps}
      width={config.width}
      height={config.height}
      totalFrames={config.totalFrames}
    />
  )
}

createRoot(document.getElementById('root')).render(<App />)
