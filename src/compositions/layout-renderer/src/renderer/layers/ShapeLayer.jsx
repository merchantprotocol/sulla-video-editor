import React from 'react'

export function ShapeLayer({ layer }) {
  const { shape, fill, stroke } = layer.props

  if (shape === 'line') {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
      }}>
        <div style={{
          width: '100%',
          height: 2,
          background: fill || 'rgba(255,255,255,0.3)',
        }} />
      </div>
    )
  }

  if (shape === 'badge') {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        background: fill || 'rgba(58,127,158,0.15)',
        borderRadius: 8,
        border: stroke ? `${stroke.width}px solid ${stroke.color}` : '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '40%', height: '40%', color: 'rgba(255,255,255,0.2)' }}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </div>
    )
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: fill || 'rgba(58,127,158,0.15)',
      borderRadius: shape === 'circle' ? '50%' : (layer.borderRadius ? `${layer.borderRadius}%` : 0),
      border: stroke ? `${stroke.width}px solid ${stroke.color}` : undefined,
    }} />
  )
}
