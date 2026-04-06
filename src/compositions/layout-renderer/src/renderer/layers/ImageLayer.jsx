import React from 'react'

export function ImageLayer({ layer }) {
  const { src, fit } = layer.props

  if (!src) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(58,127,158,0.08))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 4,
        borderRadius: layer.borderRadius ? `${layer.borderRadius}%` : 4,
        border: '1px dashed rgba(255,255,255,0.12)',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 24, height: 24, color: 'rgba(255,255,255,0.2)' }}>
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'Inter, sans-serif' }}>
          {layer.name || 'Image'}
        </span>
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
