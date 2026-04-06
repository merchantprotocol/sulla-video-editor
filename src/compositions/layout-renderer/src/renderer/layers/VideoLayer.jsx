import React from 'react'

/**
 * Video layer — renders a video track frame.
 * In Puppeteer render mode: loads extracted frame image from tracks path.
 * In editor preview mode: shows a placeholder with the track role label.
 */
export function VideoLayer({ layer, frame, fps, tracks }) {
  const { trackRole, fit, clipShape } = layer.props
  const trackInfo = tracks?.[trackRole]

  const containerStyle = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: clipShape === 'circle' ? '50%' : clipShape === 'rounded' ? '12%' : 0,
  }

  // Render mode: load extracted frame image
  if (trackInfo?.basePath) {
    const frameNum = String(frame).padStart(6, '0')
    const src = `${trackInfo.basePath}frame-${frameNum}.jpg`
    return (
      <div style={containerStyle}>
        <img
          src={src}
          alt={trackRole}
          style={{ width: '100%', height: '100%', objectFit: fit || 'cover', display: 'block' }}
          onError={(e) => { e.target.style.display = 'none' }}
        />
      </div>
    )
  }

  // Preview mode: placeholder
  return (
    <div style={{
      ...containerStyle,
      background: trackRole === 'camera'
        ? 'linear-gradient(135deg, #2a1a3e, #1a1a2e)'
        : 'linear-gradient(135deg, #1a1a2e, #16213e)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 4,
    }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24" opacity={0.3}>
        {trackRole === 'camera'
          ? <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>
          : <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>
        }
      </svg>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {layer.name || trackRole}
      </span>
    </div>
  )
}
