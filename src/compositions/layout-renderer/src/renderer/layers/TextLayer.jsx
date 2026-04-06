import React from 'react'

export function TextLayer({ layer }) {
  const { text, fontFamily, fontSize, fontWeight, fontColor, textAlign, lineHeight, letterSpacing, background, padding } = layer.props

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      fontFamily: fontFamily || 'Inter, sans-serif',
      fontSize: fontSize || 48,
      fontWeight: fontWeight || 600,
      color: fontColor || '#ffffff',
      textAlign: textAlign || 'center',
      lineHeight: lineHeight || 1.2,
      letterSpacing: letterSpacing ? `${letterSpacing}px` : undefined,
      background: background || 'transparent',
      padding: padding || 0,
      overflow: 'hidden',
      wordBreak: 'break-word',
      borderRadius: background ? 8 : 0,
    }}>
      {text || 'Double-click to edit'}
    </div>
  )
}
