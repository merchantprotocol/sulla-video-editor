import React from 'react'

/**
 * Video layer — renders a video track frame.
 * In Puppeteer render mode: loads extracted frame image from tracks path.
 * In editor preview mode: shows a rich placeholder with the track role label.
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

  // Preview mode: show a realistic placeholder
  const isCamera = trackRole === 'camera'

  return (
    <div style={{
      ...containerStyle,
      background: isCamera
        ? 'linear-gradient(145deg, #1e1233, #1a1a2e, #12192e)'
        : 'linear-gradient(145deg, #0d1117, #161b22, #1c2128)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 6,
      position: 'relative',
    }}>
      {/* Fake desktop UI for screen placeholder */}
      {!isCamera && (
        <>
          {/* Title bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '8%', minHeight: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 3%', gap: '1.5%' }}>
            <div style={{ width: '2%', minWidth: 4, height: '2%', minHeight: 4, borderRadius: '50%', background: '#e5534b' }} />
            <div style={{ width: '2%', minWidth: 4, height: '2%', minHeight: 4, borderRadius: '50%', background: '#d29922' }} />
            <div style={{ width: '2%', minWidth: 4, height: '2%', minHeight: 4, borderRadius: '50%', background: '#3fb950' }} />
            <div style={{ flex: 1 }} />
            <div style={{ width: '20%', height: '40%', background: 'rgba(255,255,255,0.08)', borderRadius: 3 }} />
            <div style={{ flex: 1 }} />
          </div>
          {/* Fake content lines */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2%', alignItems: 'flex-start', width: '70%', marginTop: '4%' }}>
            <div style={{ width: '80%', height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3 }} />
            <div style={{ width: '60%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }} />
            <div style={{ width: '90%', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }} />
            <div style={{ width: '40%', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginTop: 4 }} />
          </div>
          {/* Code block mockup */}
          <div style={{ width: '70%', height: '25%', background: 'rgba(0,0,0,0.3)', borderRadius: 4, marginTop: '2%', padding: '3%', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ width: '50%', height: 4, background: 'rgba(80,150,179,0.3)', borderRadius: 2 }} />
            <div style={{ width: '70%', height: 4, background: 'rgba(63,185,80,0.2)', borderRadius: 2 }} />
            <div style={{ width: '45%', height: 4, background: 'rgba(210,153,34,0.2)', borderRadius: 2 }} />
          </div>
        </>
      )}

      {/* Camera: face silhouette */}
      {isCamera && (
        <>
          <div style={{
            width: '35%', height: '35%', borderRadius: '50%',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ width: '60%', height: '60%', color: 'rgba(255,255,255,0.2)' }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Inter, sans-serif' }}>
            Camera
          </span>
        </>
      )}
    </div>
  )
}
