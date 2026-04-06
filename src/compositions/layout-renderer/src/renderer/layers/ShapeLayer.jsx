import React from 'react'

export function ShapeLayer({ layer }) {
  const { shape, fill, stroke } = layer.props

  if (shape === 'line') {
    return (
      <div style={{
        width: '100%',
        height: '2px',
        background: fill || '#ffffff',
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
      }} />
    )
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: fill || 'rgba(255,255,255,0.1)',
      borderRadius: shape === 'circle' ? '50%' : shape === 'badge' ? '8px' : (layer.borderRadius ? `${layer.borderRadius}%` : 0),
      border: stroke ? `${stroke.width}px solid ${stroke.color}` : undefined,
    }} />
  )
}
