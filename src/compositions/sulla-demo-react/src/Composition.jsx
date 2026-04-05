import React from 'react'

/**
 * Sulla Demo Video Composition
 *
 * This is a regular React component. It receives the current frame number
 * and renders the visual state for that exact frame. Every CSS property,
 * opacity, transform, color — all driven by the frame number.
 *
 * Sulla can build ANY React component here. Custom animations, SVGs,
 * data visualizations, code walkthroughs, product demos — anything
 * React can render, this system can capture as video.
 */

const SLIDES = [
  {
    duration: 5,
    title: 'Sulla Video Editor',
    subtitle: 'AI-Powered Video Editing As Code',
    accent: '#5096b3',
  },
  {
    duration: 5,
    title: 'Edit By Transcript',
    subtitle: 'Delete words from the text — they disappear from the video',
    accent: '#5096b3',
    icon: 'transcript',
  },
  {
    duration: 5,
    title: 'One-Click Cleanup',
    subtitle: 'Remove fillers, trim silence, enhance audio — instantly',
    accent: '#3fb950',
    icon: 'cleanup',
  },
  {
    duration: 5,
    title: 'Auto-Generate Clips',
    subtitle: 'AI finds your best moments and formats them for social',
    accent: '#e3b341',
    icon: 'clips',
  },
  {
    duration: 5,
    title: 'Video Editing As Code',
    subtitle: 'Your project is a git repo. Every edit is a commit.',
    accent: '#b392f0',
    icon: 'code',
  },
  {
    duration: 4,
    title: 'sulla.video',
    subtitle: 'Start editing today',
    accent: '#5096b3',
  },
]

// Helper: interpolate a value based on progress (0-1)
function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

// Easing function
function easeOut(t) {
  return 1 - Math.pow(1 - t, 3)
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function Composition({ frame, fps, width, height, totalFrames }) {
  // Calculate which slide we're on
  let slideIndex = 0
  let frameInSlide = frame
  let slideStartFrame = 0

  for (let i = 0; i < SLIDES.length; i++) {
    const slideDuration = SLIDES[i].duration * fps
    if (frameInSlide < slideDuration) {
      slideIndex = i
      break
    }
    frameInSlide -= slideDuration
    slideStartFrame += slideDuration
    if (i === SLIDES.length - 1) slideIndex = i
  }

  const slide = SLIDES[slideIndex]
  const slideFrames = slide.duration * fps
  const progress = frameInSlide / slideFrames // 0 to 1 within slide

  // Transition timing
  const fadeIn = easeOut(Math.min(1, frameInSlide / (fps * 0.6)))     // 0.6s fade in
  const fadeOut = frameInSlide > slideFrames - fps * 0.4
    ? 1 - easeOut((frameInSlide - (slideFrames - fps * 0.4)) / (fps * 0.4))
    : 1

  const opacity = fadeIn * fadeOut

  // Title animation: slide up
  const titleY = lerp(30, 0, easeOut(Math.min(1, frameInSlide / (fps * 0.5))))
  // Subtitle: delayed slide up
  const subDelay = Math.max(0, frameInSlide - fps * 0.2)
  const subY = lerp(20, 0, easeOut(Math.min(1, subDelay / (fps * 0.5))))
  const subOpacity = Math.min(1, subDelay / (fps * 0.3))

  // Accent bar width animation
  const barWidth = lerp(0, 60, easeInOut(Math.min(1, (frameInSlide - fps * 0.3) / (fps * 0.4))))

  // Background particles (subtle floating dots)
  const particles = Array.from({ length: 12 }, (_, i) => {
    const seed = i * 137.5
    const x = ((seed * 7.3) % width)
    const y = ((seed * 13.7 + frame * 0.3 * (1 + i * 0.1)) % height)
    const size = 2 + (i % 3)
    return { x, y, size, opacity: 0.03 + (i % 4) * 0.01 }
  })

  return (
    <div style={{
      width, height,
      background: '#0d1117',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Background particles */}
      {particles.map((p, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: p.x,
          top: p.y,
          width: p.size,
          height: p.size,
          borderRadius: '50%',
          background: slide.accent,
          opacity: p.opacity * opacity,
        }} />
      ))}

      {/* Slide number */}
      <div style={{
        position: 'absolute',
        top: 40,
        right: 50,
        fontSize: 14,
        color: '#30363d',
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 600,
        opacity: opacity * 0.5,
      }}>
        {String(slideIndex + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
      </div>

      {/* Main content */}
      <div style={{
        opacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}>
        {/* Icon */}
        {slide.icon && (
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `${slide.accent}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 8,
            transform: `translateY(${lerp(20, 0, easeOut(Math.min(1, frameInSlide / (fps * 0.4))))}px)`,
            opacity: Math.min(1, frameInSlide / (fps * 0.3)),
          }}>
            <SlideIcon name={slide.icon} color={slide.accent} />
          </div>
        )}

        {/* Title */}
        <div style={{
          fontSize: slideIndex === 0 || slideIndex === SLIDES.length - 1 ? 80 : 64,
          fontWeight: 700,
          color: slideIndex === SLIDES.length - 1 ? slide.accent : '#e6edf3',
          letterSpacing: '-0.02em',
          transform: `translateY(${titleY}px)`,
          textAlign: 'center',
          maxWidth: '80%',
        }}>
          {slide.title}
        </div>

        {/* Accent bar */}
        <div style={{
          width: barWidth,
          height: 3,
          background: slide.accent,
          borderRadius: 2,
          marginTop: 4,
          marginBottom: 4,
        }} />

        {/* Subtitle */}
        <div style={{
          fontSize: 24,
          color: '#8b949e',
          transform: `translateY(${subY}px)`,
          opacity: subOpacity,
          textAlign: 'center',
          maxWidth: '60%',
          lineHeight: 1.5,
        }}>
          {slide.subtitle}
        </div>
      </div>

      {/* Bottom branding */}
      <div style={{
        position: 'absolute',
        bottom: 40,
        left: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        opacity: opacity * 0.3,
      }}>
        <div style={{
          width: 3,
          height: 20,
          background: slide.accent,
          borderRadius: 2,
        }} />
        <span style={{
          fontSize: 13,
          color: '#6e7681',
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 500,
        }}>
          sulla
        </span>
      </div>
    </div>
  )
}

function SlideIcon({ name, color }) {
  const style = { width: 28, height: 28, stroke: color, fill: 'none', strokeWidth: 2 }

  switch (name) {
    case 'transcript':
      return <svg viewBox="0 0 24 24" style={style}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    case 'cleanup':
      return <svg viewBox="0 0 24 24" style={style}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
    case 'clips':
      return <svg viewBox="0 0 24 24" style={style}><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M10 2v20"/><path d="M2 12h8"/></svg>
    case 'code':
      return <svg viewBox="0 0 24 24" style={style}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
    default:
      return null
  }
}
