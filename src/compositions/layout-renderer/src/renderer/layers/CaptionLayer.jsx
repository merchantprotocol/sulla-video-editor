import React from 'react'

/**
 * Caption layer — shows a styled caption preview.
 * In render mode, actual word-level captions are loaded from transcript data.
 * In preview mode, shows sample text with the selected style.
 */
export function CaptionLayer({ layer, frame, fps }) {
  const { style, fontFamily, fontSize, fontColor, highlightColor } = layer.props
  const sampleWords = ['Building', 'amazing', 'products']

  const baseStyle = {
    fontFamily: fontFamily || 'Inter, sans-serif',
    fontSize: fontSize || 36,
    fontWeight: 700,
    color: fontColor || '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    gap: style === 'pop' ? 6 : 4,
    textAlign: 'center',
  }

  // Cycle through highlighted word based on frame
  const cycleSpeed = fps * 0.8
  const highlightIdx = Math.floor(frame / cycleSpeed) % sampleWords.length

  return (
    <div style={baseStyle}>
      {sampleWords.map((word, i) => {
        const isHighlighted = i === highlightIdx

        if (style === 'pop' && isHighlighted) {
          return (
            <span key={i} style={{
              background: highlightColor || '#3a7f9e',
              color: '#ffffff',
              padding: '4px 10px',
              borderRadius: 6,
              transform: 'scale(1.05)',
              display: 'inline-block',
            }}>{word}</span>
          )
        }

        if (style === 'underline' && isHighlighted) {
          return (
            <span key={i} style={{
              textDecoration: 'underline',
              textDecorationColor: highlightColor || '#3a7f9e',
              textUnderlineOffset: 4,
              textDecorationThickness: 3,
            }}>{word}</span>
          )
        }

        if (style === 'karaoke') {
          return (
            <span key={i} style={{
              color: isHighlighted ? (highlightColor || '#fbbf24') : 'rgba(255,255,255,0.5)',
              transition: 'color 0.1s',
            }}>{word}</span>
          )
        }

        if (style === 'box') {
          return (
            <span key={i} style={{
              background: isHighlighted ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.5)',
              padding: '4px 8px',
              borderRadius: 4,
            }}>{word}</span>
          )
        }

        // Default: plain text
        return <span key={i}>{word}</span>
      })}
    </div>
  )
}
