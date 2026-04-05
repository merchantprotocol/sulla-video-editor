import { useRef, useCallback } from 'react'

export interface Position {
  x: number // percentage 0-100 from left
  y: number // percentage 0-100 from top
}

/**
 * Hook that makes an element draggable within a container.
 * Positions are stored as percentages so they scale with container size.
 *
 * Usage:
 *   const { onMouseDown } = useDraggable(containerRef, position, setPosition)
 *   <div onMouseDown={onMouseDown} style={{ left: `${pos.x}%`, top: `${pos.y}%` }} />
 */
export function useDraggable(
  containerRef: React.RefObject<HTMLElement | null>,
  position: Position,
  setPosition: (pos: Position) => void,
  onDragStart?: () => void,
  onDragEnd?: () => void,
) {
  const dragging = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't drag if clicking buttons/inputs inside the element
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('select')) return

    e.preventDefault()
    e.stopPropagation()
    const container = containerRef.current
    if (!container) return

    dragging.current = true
    onDragStart?.()

    const containerRect = container.getBoundingClientRect()
    const el = e.currentTarget as HTMLElement
    const elRect = el.getBoundingClientRect()

    // Offset within the element where the user clicked
    const offsetX = e.clientX - elRect.left
    const offsetY = e.clientY - elRect.top

    function onMove(ev: MouseEvent) {
      if (!dragging.current) return
      const x = ((ev.clientX - offsetX - containerRect.left) / containerRect.width) * 100
      const y = ((ev.clientY - offsetY - containerRect.top) / containerRect.height) * 100
      setPosition({
        x: Math.max(0, Math.min(90, x)),
        y: Math.max(0, Math.min(90, y)),
      })
    }

    function onUp() {
      dragging.current = false
      onDragEnd?.()
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'move'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [containerRef, position, setPosition, onDragStart, onDragEnd])

  return { onMouseDown }
}
