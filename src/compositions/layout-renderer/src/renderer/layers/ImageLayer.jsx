import React from 'react'

export function ImageLayer({ layer }) {
  const { src, fit } = layer.props

  if (!src) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        background: 'rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: layer.borderRadius ? `${layer.borderRadius}%` : 0,
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24" opacity={0.2}>
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={layer.name}
      style={{
        width: '100%',
        height: '100%',
        objectFit: fit || 'cover',
        display: 'block',
        borderRadius: layer.borderRadius ? `${layer.borderRadius}%` : 0,
      }}
    />
  )
}
