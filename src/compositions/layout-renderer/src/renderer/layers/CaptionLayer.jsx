import React from 'react'

/**
 * Caption layer — shows styled caption preview with animated highlight cycling.
 * In render mode, actual word-level captions come from transcript data.
 */
export function CaptionLayer({ layer, frame, fps }) {
  const { style, fontFamily, fontSize, fontColor, highlightColor, maxWordsPerLine } = layer.props
  const sampleWords = ['Building', 'amazing', 'products', 'together']

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
    flexWrap: 'wrap',
  }

  // Cycle through highlighted word based on frame
  const cycleSpeed = fps * 0.7
  const highlightIdx = Math.floor(frame / cycleSpeed) % sampleWords.length

  return (
    <div style={baseStyle}>
      {sampleWords.map((word, i) => {
        const isHighlighted = i === highlightIdx

        if (style === 'pop') {
          return (
            <span key={i} style={{
              background: isHighlighted ? (highlightColor || '#3a7f9e') : 'transparent',
              color: '#ffffff',
              padding: '3px 8px',
              borderRadius: 5,
              transform: isHighlighted ? 'scale(1.08)' : 'scale(1)',
              display: 'inline-block',
              transition: 'all 0.12s',
            }}>{word}</span>
          )
        }

        if (style === 'underline') {
          return (
            <span key={i} style={{
              textDecoration: isHighlighted ? 'underline' : 'none',
              textDecorationColor: highlightColor || '#3a7f9e',
              textUnderlineOffset: 4,
              textDecorationThickness: 3,
              padding: '0 2px',
            }}>{word}</span>
          )
        }

        if (style === 'karaoke') {
          return (
            <span key={i} style={{
              color: isHighlighted ? (highlightColor || '#fbbf24') : 'rgba(255,255,255,0.4)',
              transition: 'color 0.15s',
              padding: '0 2px',
            }}>{word}</span>
          )
        }

        if (style === 'box') {
          return (
            <span key={i} style={{
              background: isHighlighted ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.45)',
              padding: '4px 8px',
              borderRadius: 4,
              transition: 'background 0.12s',
            }}>{word}</span>
          )
        }

        // Default: plain with subtle highlight
        return (
          <span key={i} style={{
            opacity: isHighlighted ? 1 : 0.7,
            padding: '0 2px',
          }}>{word}</span>
        )
      })}
    </div>
  )
}
