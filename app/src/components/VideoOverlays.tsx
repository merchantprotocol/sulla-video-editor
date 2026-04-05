import { useRef, useCallback } from 'react'
import { useDraggable, type Position } from '../hooks/useDraggable'
import styles from './VideoOverlays.module.css'

// ─── Types ───────────────────────────────────────────────

export type OverlayType = 'pip' | 'caption' | 'text' | 'logo'

export interface OverlayItem {
  id: string
  type: OverlayType
  position: Position
  size: { w: number; h: number } // percentage of container
  visible: boolean
  // Type-specific props
  label?: string
  text?: string
  fontFamily?: string
  fontSize?: number
  fontColor?: string
  bgColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number // percentage (0 = square, 50 = circle)
  opacity?: number
  src?: string // image url for logo, video url for pip
  shape?: 'circle' | 'rounded' | 'square'
}

export function createOverlay(type: OverlayType, partial?: Partial<OverlayItem>): OverlayItem {
  const defaults: Record<OverlayType, Partial<OverlayItem>> = {
    pip: {
      position: { x: 2, y: 65 },
      size: { w: 20, h: 30 },
      label: 'Camera',
      shape: 'circle',
      borderColor: '#5096b3',
      borderWidth: 3,
      borderRadius: 50,
    },
    caption: {
      position: { x: 15, y: 80 },
      size: { w: 70, h: 10 },
      label: 'Captions',
      text: 'Sample caption text',
      fontFamily: 'Inter',
      fontSize: 18,
      fontColor: '#ffffff',
      bgColor: 'rgba(0,0,0,0.7)',
      borderRadius: 6,
    },
    text: {
      position: { x: 5, y: 5 },
      size: { w: 40, h: 8 },
      label: 'Text',
      text: 'Your text here',
      fontFamily: 'Inter',
      fontSize: 16,
      fontColor: '#ffffff',
      bgColor: 'transparent',
      borderRadius: 0,
    },
    logo: {
      position: { x: 80, y: 3 },
      size: { w: 15, h: 12 },
      label: 'Logo',
      borderRadius: 8,
      opacity: 0.9,
    },
  }

  return {
    id: `${type}-${Date.now()}`,
    type,
    visible: true,
    ...defaults[type],
    ...partial,
  } as OverlayItem
}

// ─── Single draggable overlay ────────────────────────────

interface OverlayProps {
  item: OverlayItem
  containerRef: React.RefObject<HTMLElement | null>
  selected: boolean
  onSelect: () => void
  onUpdate: (item: OverlayItem) => void
}

function DraggableItem({ item, containerRef, selected, onSelect, onUpdate }: OverlayProps) {
  const setPosition = useCallback((pos: Position) => {
    onUpdate({ ...item, position: pos })
  }, [item, onUpdate])

  const { onMouseDown } = useDraggable(containerRef, item.position, setPosition)

  if (!item.visible) return null

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${item.position.x}%`,
    top: `${item.position.y}%`,
    width: `${item.size.w}%`,
    height: `${item.size.h}%`,
    cursor: 'move',
    userSelect: 'none',
    opacity: item.opacity ?? 1,
    zIndex: selected ? 20 : 10,
  }

  if (item.type === 'pip') {
    return (
      <div
        className={`${styles.overlay} ${selected ? styles.overlaySelected : ''}`}
        style={style}
        onMouseDown={(e) => { onSelect(); onMouseDown(e) }}
      >
        <div
          className={styles.pip}
          style={{
            borderRadius: item.borderRadius != null ? `${item.borderRadius}%` : '50%',
            borderColor: item.borderColor || '#5096b3',
            borderWidth: item.borderWidth || 3,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
            <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
          </svg>
        </div>
        {selected && <div className={styles.overlayLabel}>{item.label || 'PiP'}</div>}
      </div>
    )
  }

  if (item.type === 'caption') {
    return (
      <div
        className={`${styles.overlay} ${selected ? styles.overlaySelected : ''}`}
        style={style}
        onMouseDown={(e) => { onSelect(); onMouseDown(e) }}
      >
        <div
          className={styles.captionBox}
          style={{
            fontFamily: item.fontFamily || 'Inter',
            fontSize: item.fontSize ? `${item.fontSize}px` : '16px',
            color: item.fontColor || '#fff',
            background: item.bgColor || 'rgba(0,0,0,0.7)',
            borderRadius: item.borderRadius || 6,
          }}
        >
          {item.text || 'Caption text'}
        </div>
        {selected && <div className={styles.overlayLabel}>{item.label || 'Caption'}</div>}
      </div>
    )
  }

  if (item.type === 'text') {
    return (
      <div
        className={`${styles.overlay} ${selected ? styles.overlaySelected : ''}`}
        style={style}
        onMouseDown={(e) => { onSelect(); onMouseDown(e) }}
      >
        <div
          className={styles.textBox}
          style={{
            fontFamily: item.fontFamily || 'Inter',
            fontSize: item.fontSize ? `${item.fontSize}px` : '16px',
            color: item.fontColor || '#fff',
            background: item.bgColor || 'transparent',
            borderRadius: item.borderRadius || 0,
          }}
        >
          {item.text || 'Text'}
        </div>
        {selected && <div className={styles.overlayLabel}>{item.label || 'Text'}</div>}
      </div>
    )
  }

  if (item.type === 'logo') {
    return (
      <div
        className={`${styles.overlay} ${selected ? styles.overlaySelected : ''}`}
        style={style}
        onMouseDown={(e) => { onSelect(); onMouseDown(e) }}
      >
        <div
          className={styles.logoBox}
          style={{ borderRadius: item.borderRadius || 8 }}
        >
          {item.src ? (
            <img src={item.src} alt="Logo" className={styles.logoImg} />
          ) : (
            <div className={styles.logoPlaceholder}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
              <span>Logo</span>
            </div>
          )}
        </div>
        {selected && <div className={styles.overlayLabel}>{item.label || 'Logo'}</div>}
      </div>
    )
  }

  return null
}

// ─── Main component ──────────────────────────────────────

interface VideoOverlaysProps {
  overlays: OverlayItem[]
  selectedId: string | null
  containerRef: React.RefObject<HTMLElement | null>
  onSelect: (id: string | null) => void
  onUpdate: (item: OverlayItem) => void
}

export default function VideoOverlays({ overlays, selectedId, containerRef, onSelect, onUpdate }: VideoOverlaysProps) {
  return (
    <>
      {overlays.map(item => (
        <DraggableItem
          key={item.id}
          item={item}
          containerRef={containerRef}
          selected={selectedId === item.id}
          onSelect={() => onSelect(item.id)}
          onUpdate={onUpdate}
        />
      ))}
    </>
  )
}
