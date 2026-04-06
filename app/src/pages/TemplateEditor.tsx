import { useState, useEffect, useRef, useCallback, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTemplates, type TemplateConfig } from '../hooks/useTemplates'
import { useProjects } from '../hooks/useProjects'
import {
  type SceneLayout, type LayerDefinition, type LayerType, type AnimationDef,
  type VideoLayerProps, type TextLayerProps, type CaptionLayerProps, type ShapeLayerProps,
  createLayer, createSceneWithPreset, createDefaultLayout,
} from '../types/scene-layout'
// @ts-ignore — JS module from layout-renderer composition
import { LayoutRenderer } from '@sulla/layout-renderer/LayoutRenderer'
import styles from './TemplateEditor.module.css'

// ─── Context menu state ───
interface CtxMenuState { x: number; y: number; layerId: string | null }

// ─── Element definitions for the left panel ───
const ELEMENT_DEFS: { type: LayerType; label: string; icon: string; variant?: string; defaults?: Partial<LayerDefinition> }[] = [
  { type: 'video', label: 'PiP Camera', icon: 'camera', defaults: { name: 'Camera', size: { w: 18, h: 25 }, position: { x: 78, y: 68 }, borderRadius: 50, border: { width: 3, color: '#ffffff' }, props: { trackRole: 'camera', fit: 'cover', clipShape: 'circle' } as VideoLayerProps } },
  { type: 'video', label: 'Screen', icon: 'screen', defaults: { name: 'Screen', size: { w: 100, h: 100 }, position: { x: 0, y: 0 }, props: { trackRole: 'main', fit: 'cover', clipShape: 'rectangle' } as VideoLayerProps } },
  { type: 'image', label: 'Image', icon: 'image' },
  { type: 'text', label: 'Heading', icon: 'heading', defaults: { name: 'Heading', size: { w: 60, h: 12 }, position: { x: 20, y: 38 }, props: { text: 'Heading', fontFamily: 'Inter', fontSize: 64, fontWeight: 700, fontColor: '#e6edf3', textAlign: 'center', lineHeight: 1.1, letterSpacing: -1 } as TextLayerProps } },
  { type: 'text', label: 'Body Text', icon: 'body', defaults: { name: 'Body', props: { text: 'Body text here', fontFamily: 'Inter', fontSize: 24, fontWeight: 400, fontColor: '#8b949e', textAlign: 'center', lineHeight: 1.4, letterSpacing: 0 } as TextLayerProps } },
  { type: 'caption', label: 'Caption', icon: 'caption' },
  { type: 'text', label: 'Lower Third', icon: 'lower', defaults: { name: 'Lower Third', size: { w: 30, h: 8 }, position: { x: 4, y: 80 }, props: { text: 'Speaker Name', fontFamily: 'Inter', fontSize: 20, fontWeight: 700, fontColor: '#ffffff', textAlign: 'left', lineHeight: 1.3, letterSpacing: 0, background: 'rgba(0,0,0,0.7)', padding: 12 } as TextLayerProps } },
  { type: 'shape', label: 'Rectangle', icon: 'rect', defaults: { props: { shape: 'rectangle', fill: 'rgba(58,127,158,0.3)' } as ShapeLayerProps } },
  { type: 'shape', label: 'Circle', icon: 'circle', defaults: { props: { shape: 'circle', fill: 'rgba(58,127,158,0.3)' } as ShapeLayerProps, borderRadius: 50 } },
]

const ANIM_PRESETS: { type: string; label: string }[] = [
  { type: 'fadeIn', label: 'Fade In' },
  { type: 'slideUp', label: 'Slide Up' },
  { type: 'slideRight', label: 'Slide Right' },
  { type: 'scaleIn', label: 'Scale In' },
  { type: 'bounce', label: 'Bounce' },
  { type: 'pop', label: 'Pop' },
  { type: 'spin', label: 'Spin' },
]

const EXIT_PRESETS: { type: string; label: string }[] = [
  { type: 'fadeOut', label: 'Fade Out' },
  { type: 'slideDown', label: 'Slide Down' },
  { type: 'scaleOut', label: 'Scale Out' },
]

export default function TemplateEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { templates, loading: templatesLoading, updateTemplate } = useTemplates()
  const { projects, loading: projectsLoading } = useProjects()

  const [leftTab, setLeftTab] = useState<'elements' | 'templates' | 'projects'>('elements')
  const [rightTab, setRightTab] = useState<'style' | 'animate' | 'layout'>('style')
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [selectedSceneIdx, setSelectedSceneIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null)
  const [resizing, setResizing] = useState<{ layerId: string; handle: string; startX: number; startY: number; startPos: { x: number; y: number }; startSize: { w: number; h: number } } | null>(null)
  const [moving, setMoving] = useState<{ layerId: string; startX: number; startY: number; startPos: { x: number; y: number } } | null>(null)
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  const template = templates.find(t => t.id === id) || null
  const config = template?.config as TemplateConfig | undefined

  // Initialize layout from template config or create default
  const [layout, setLayout] = useState<SceneLayout | null>(null)

  useEffect(() => {
    if (!config) return
    if (config.layout) {
      setLayout(config.layout)
    } else {
      // Bootstrap layout from existing scenes
      const l = createDefaultLayout()
      if (config.scenes?.length) {
        l.scenes = config.scenes.map(s => createSceneWithPreset(s.type))
      }
      if (l.scenes.length === 0) {
        l.scenes = [createSceneWithPreset('PiP')]
      }
      if (config.theme?.background === 'light') l.canvas.background = '#f6f8fa'
      setLayout(l)
    }
  }, [config?.layout, template?.id])

  // Derived state
  const scene = layout?.scenes[selectedSceneIdx] || null
  const selectedLayer = scene?.layers.find(l => l.id === selectedLayerId) || null
  const fps = layout?.canvas.fps || 30
  const sceneDurFrames = (scene?.durationSec || 10) * fps
  const totalFrames = layout?.scenes.reduce((sum, s) => sum + (s.durationSec || 10) * fps, 0) || 0

  // Compute scene start frame offset
  const sceneStartFrame = layout?.scenes.slice(0, selectedSceneIdx).reduce((sum, s) => sum + (s.durationSec || 10) * fps, 0) || 0

  // Auto-save layout to template (debounced)
  const saveLayout = useCallback((l: SceneLayout) => {
    if (!template || !config) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      updateTemplate(template.id, { config: { ...config, layout: l } }).catch(() => {})
    }, 800)
  }, [template?.id, config, updateTemplate])

  // Cleanup save timer on unmount
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  // Update layout + trigger save
  function updateLayout(updater: (prev: SceneLayout) => SceneLayout) {
    setLayout(prev => {
      if (!prev) return prev
      const next = updater(prev)
      saveLayout(next)
      return next
    })
  }

  // ─── Layer CRUD ───

  function addLayer(type: LayerType, defaults?: Partial<LayerDefinition>) {
    if (!layout || selectedSceneIdx >= layout.scenes.length) return
    const layer = createLayer(type, {
      zIndex: (scene?.layers.length || 0),
      ...defaults,
    })
    updateLayout(l => {
      const scenes = [...l.scenes]
      scenes[selectedSceneIdx] = { ...scenes[selectedSceneIdx], layers: [...scenes[selectedSceneIdx].layers, layer] }
      return { ...l, scenes }
    })
    setSelectedLayerId(layer.id)
  }

  function updateLayer(layerId: string, updates: Partial<LayerDefinition>) {
    updateLayout(l => {
      const scenes = [...l.scenes]
      const si = selectedSceneIdx
      scenes[si] = {
        ...scenes[si],
        layers: scenes[si].layers.map(layer => layer.id === layerId ? { ...layer, ...updates } : layer),
      }
      return { ...l, scenes }
    })
  }

  function removeLayer(layerId: string) {
    updateLayout(l => {
      const scenes = [...l.scenes]
      scenes[selectedSceneIdx] = { ...scenes[selectedSceneIdx], layers: scenes[selectedSceneIdx].layers.filter(l => l.id !== layerId) }
      return { ...l, scenes }
    })
    if (selectedLayerId === layerId) setSelectedLayerId(null)
  }

  // ─── Scene CRUD ───

  function addScene(type: string) {
    const newScene = createSceneWithPreset(type)
    const newIdx = layout ? layout.scenes.length : 0
    updateLayout(l => ({ ...l, scenes: [...l.scenes, newScene] }))
    // Use callback form to get correct index after state update
    setTimeout(() => setSelectedSceneIdx(newIdx), 0)
    setSelectedLayerId(null)
  }

  function removeScene(idx: number) {
    if (!layout || layout.scenes.length <= 1) return
    updateLayout(l => ({ ...l, scenes: l.scenes.filter((_, i) => i !== idx) }))
    if (selectedSceneIdx >= (layout.scenes.length - 1)) setSelectedSceneIdx(Math.max(0, layout.scenes.length - 2))
    setSelectedLayerId(null)
  }

  // ─── Playback ───

  useEffect(() => {
    if (!isPlaying) return
    lastTimeRef.current = performance.now()
    function tick(now: number) {
      const dt = now - lastTimeRef.current
      lastTimeRef.current = now
      setCurrentFrame(f => {
        const next = f + (dt / 1000) * fps
        return next >= totalFrames ? 0 : next
      })
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [isPlaying, fps, totalFrames])

  // ─── Close context menu on click anywhere ───
  useEffect(() => {
    function handleClick() { setCtxMenu(null) }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when editing text
      if (editingTextLayerId) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      const sel = selectedLayerId
      if (!sel || !scene) return

      const layer = scene.layers.find(l => l.id === sel)
      if (!layer) return

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          removeLayer(sel)
          break
        case 'Escape':
          setSelectedLayerId(null)
          break
        case 'ArrowUp':
          e.preventDefault()
          updateLayer(sel, { position: { ...layer.position, y: layer.position.y - (e.shiftKey ? 10 : 1) } })
          break
        case 'ArrowDown':
          e.preventDefault()
          updateLayer(sel, { position: { ...layer.position, y: layer.position.y + (e.shiftKey ? 10 : 1) } })
          break
        case 'ArrowLeft':
          e.preventDefault()
          updateLayer(sel, { position: { ...layer.position, x: layer.position.x - (e.shiftKey ? 10 : 1) } })
          break
        case 'ArrowRight':
          e.preventDefault()
          updateLayer(sel, { position: { ...layer.position, x: layer.position.x + (e.shiftKey ? 10 : 1) } })
          break
        case 'd':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            const dup = { ...layer, id: `layer-${Date.now()}`, name: `${layer.name} copy`, position: { x: layer.position.x + 2, y: layer.position.y + 2 } }
            updateLayout(l => { const scenes = [...l.scenes]; scenes[selectedSceneIdx] = { ...scenes[selectedSceneIdx], layers: [...scenes[selectedSceneIdx].layers, dup] }; return { ...l, scenes } })
            setSelectedLayerId(dup.id)
          }
          break
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedLayerId, editingTextLayerId, scene, selectedSceneIdx])

  // ─── Snap-to-edge helper (5% threshold, which is ~5px at 100px canvas width) ───
  const SNAP_THRESHOLD = (5 / 640) * 100 // 5px in canvas pixels → percentage

  function snapPosition(x: number, y: number, w: number, h: number): { x: number; y: number } {
    let sx = x, sy = y
    // Left edge
    if (Math.abs(x) < SNAP_THRESHOLD) sx = 0
    // Top edge
    if (Math.abs(y) < SNAP_THRESHOLD) sy = 0
    // Right edge (layer right side to canvas right)
    if (Math.abs((x + w) - 100) < SNAP_THRESHOLD) sx = 100 - w
    // Bottom edge
    if (Math.abs((y + h) - 100) < SNAP_THRESHOLD) sy = 100 - h
    // Center horizontal
    if (Math.abs((x + w / 2) - 50) < SNAP_THRESHOLD) sx = 50 - w / 2
    // Center vertical
    if (Math.abs((y + h / 2) - 50) < SNAP_THRESHOLD) sy = 50 - h / 2
    return { x: Math.round(sx * 10) / 10, y: Math.round(sy * 10) / 10 }
  }

  function snapSize(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
    let sx = x, sy = y, sw = w, sh = h
    // Snap right edge to canvas right
    if (Math.abs((x + w) - 100) < SNAP_THRESHOLD) { sw = 100 - x }
    // Snap bottom edge to canvas bottom
    if (Math.abs((y + h) - 100) < SNAP_THRESHOLD) { sh = 100 - y }
    // Snap left edge to canvas left (for left-handle resize)
    if (Math.abs(x) < SNAP_THRESHOLD) { sw = sw + sx; sx = 0 }
    // Snap top edge to canvas top
    if (Math.abs(y) < SNAP_THRESHOLD) { sh = sh + sy; sy = 0 }
    return {
      x: Math.round(sx * 10) / 10, y: Math.round(sy * 10) / 10,
      w: Math.round(Math.max(2, sw) * 10) / 10, h: Math.round(Math.max(2, sh) * 10) / 10,
    }
  }

  // ─── Mouse move/up for drag-to-move and resize ───
  useEffect(() => {
    if (!moving && !resizing) return
    const canvas = canvasRef.current
    if (!canvas) return

    function onMouseMove(e: globalThis.MouseEvent) {
      const rect = canvas!.getBoundingClientRect()
      // Current mouse position as percentage of canvas
      const curPctX = ((e.clientX - rect.left) / rect.width) * 100
      const curPctY = ((e.clientY - rect.top) / rect.height) * 100

      if (moving) {
        // Start mouse position as percentage of canvas
        const startPctX = ((moving.startX - rect.left) / rect.width) * 100
        const startPctY = ((moving.startY - rect.top) / rect.height) * 100
        const rawX = moving.startPos.x + (curPctX - startPctX)
        const rawY = moving.startPos.y + (curPctY - startPctY)
        // Get layer size for edge snapping
        const layer = scene?.layers.find(l => l.id === moving.layerId)
        const w = layer?.size.w || 0, h = layer?.size.h || 0
        const snapped = snapPosition(rawX, rawY, w, h)
        updateLayer(moving.layerId, { position: snapped })
      }

      if (resizing) {
        const startPctX = ((resizing.startX - rect.left) / rect.width) * 100
        const startPctY = ((resizing.startY - rect.top) / rect.height) * 100
        const dx = curPctX - startPctX
        const dy = curPctY - startPctY
        const h = resizing.handle
        let newX = resizing.startPos.x, newY = resizing.startPos.y
        let newW = resizing.startSize.w, newH = resizing.startSize.h

        if (h.includes('r')) { newW = Math.max(2, resizing.startSize.w + dx) }
        if (h.includes('l')) { newW = Math.max(2, resizing.startSize.w - dx); newX = resizing.startPos.x + dx }
        if (h.includes('b')) { newH = Math.max(2, resizing.startSize.h + dy) }
        if (h.includes('t')) { newH = Math.max(2, resizing.startSize.h - dy); newY = resizing.startPos.y + dy }

        const snapped = snapSize(newX, newY, newW, newH)
        updateLayer(resizing.layerId, {
          position: { x: snapped.x, y: snapped.y },
          size: { w: snapped.w, h: snapped.h },
        })
      }
    }

    function onMouseUp() { setMoving(null); setResizing(null) }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp) }
  }, [moving, resizing])

  // ─── Drag-and-drop from element cards to canvas ───
  function handleDragStart(e: DragEvent, elIdx: number) {
    e.dataTransfer.setData('element-idx', String(elIdx))
    e.dataTransfer.effectAllowed = 'copy'
  }

  function handleCanvasDrop(e: DragEvent) {
    e.preventDefault()
    const idxStr = e.dataTransfer.getData('element-idx')
    if (!idxStr) return
    const el = ELEMENT_DEFS[Number(idxStr)]
    if (!el || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const dropX = ((e.clientX - rect.left) / rect.width) * 100
    const dropY = ((e.clientY - rect.top) / rect.height) * 100
    const defaults = el.defaults || {}
    const size = defaults.size || { w: 20, h: 15 }
    const rawX = dropX - size.w / 2
    const rawY = dropY - size.h / 2
    const snapped = snapPosition(rawX, rawY, size.w, size.h)
    addLayer(el.type, { ...defaults, position: snapped })
  }

  function handleCanvasDragOver(e: DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }

  // ─── Context menu ───
  function handleContextMenu(e: ReactMouseEvent, layerId: string | null) {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, layerId })
    if (layerId) setSelectedLayerId(layerId)
  }

  function ctxAction(action: string) {
    const layer = scene?.layers.find(l => l.id === ctxMenu?.layerId)
    setCtxMenu(null)
    if (!layer) return
    switch (action) {
      case 'duplicate': {
        if (!layout || selectedSceneIdx >= layout.scenes.length) break
        const dup = { ...layer, id: `layer-${Date.now()}`, name: `${layer.name} copy`, position: { x: layer.position.x + 2, y: layer.position.y + 2 } }
        updateLayout(l => { const scenes = [...l.scenes]; scenes[selectedSceneIdx] = { ...scenes[selectedSceneIdx], layers: [...scenes[selectedSceneIdx].layers, dup] }; return { ...l, scenes } })
        setSelectedLayerId(dup.id)
        break
      }
      case 'delete': removeLayer(layer.id); break
      case 'hide': updateLayer(layer.id, { visible: !layer.visible }); break
      case 'lock': updateLayer(layer.id, { locked: !layer.locked }); break
      case 'front': updateLayer(layer.id, { zIndex: (scene?.layers.length || 1) + 1 }); break
      case 'back': updateLayer(layer.id, { zIndex: 0 }); break
    }
  }

  // ─── Layer interaction on canvas ───
  function handleLayerMouseDown(e: ReactMouseEvent, layerId: string) {
    e.stopPropagation()
    const layer = scene?.layers.find(l => l.id === layerId)
    if (!layer || layer.locked) return
    setSelectedLayerId(layerId)
    setMoving({ layerId, startX: e.clientX, startY: e.clientY, startPos: { ...layer.position } })
  }

  function handleResizeMouseDown(e: ReactMouseEvent, layerId: string, handle: string) {
    e.stopPropagation()
    const layer = scene?.layers.find(l => l.id === layerId)
    if (!layer || layer.locked) return
    setResizing({ layerId, handle, startX: e.clientX, startY: e.clientY, startPos: { ...layer.position }, startSize: { ...layer.size } })
  }

  function handleTextDoubleClick(e: ReactMouseEvent, layerId: string) {
    e.stopPropagation()
    setEditingTextLayerId(layerId)
  }

  // ─── Render ───

  if (templatesLoading || projectsLoading) {
    return <div className={styles.loading}>Loading...</div>
  }
  if (!template || !config || !layout) {
    return <div className={styles.loading}>Template not found. <a href="/templates">Back to templates</a></div>
  }

  const canvasScale = 640 / (layout.canvas.width || 1920)

  return (
    <div className={styles.app} onContextMenu={e => e.preventDefault()} style={{ userSelect: 'none' }}>
      {/* ═══ TOP BAR ═══ */}
      <div className={styles.topbar}>
        <a className={styles.logo} href="/" onClick={e => { e.preventDefault(); navigate('/') }}>sulla</a>
        <div className={styles.breadcrumb}>
          <span>/</span>
          <a href="/templates" onClick={e => { e.preventDefault(); navigate('/templates') }}>Templates</a>
          <span>/</span>
          <strong>{template.name}</strong>
        </div>
        <div className={styles.spacer} />
        <button className={styles.topBtnSecondary} onClick={() => navigate('/templates')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <button className={styles.topBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export
        </button>
      </div>

      {/* ═══ LEFT PANEL ═══ */}
      <div className={styles.leftPanel}>
        <div className={styles.tabs}>
          <div className={`${styles.tab} ${leftTab === 'elements' ? styles.tabActive : ''}`} onClick={() => setLeftTab('elements')}>Elements</div>
          <div className={`${styles.tab} ${leftTab === 'templates' ? styles.tabActive : ''}`} onClick={() => setLeftTab('templates')}>Templates</div>
          <div className={`${styles.tab} ${leftTab === 'projects' ? styles.tabActive : ''}`} onClick={() => setLeftTab('projects')}>Projects</div>
        </div>

        {leftTab === 'elements' && (
          <div className={styles.tabContent}>
            <div className={styles.section}><div className={styles.sectionLabel}>Drag to canvas</div>
              <div className={styles.grid}>
                {ELEMENT_DEFS.map((el, i) => (
                  <div key={i} className={styles.card} draggable onDragStart={e => handleDragStart(e, i)} onClick={() => addLayer(el.type, el.defaults)}>
                    <div className={`${styles.cardIcon} ${styles[`icon${el.type.charAt(0).toUpperCase() + el.type.slice(1)}`] || styles.iconShape}`}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                        {el.icon === 'camera' && <><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></>}
                        {el.icon === 'screen' && <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>}
                        {el.icon === 'image' && <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>}
                        {el.icon === 'heading' && <><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></>}
                        {el.icon === 'body' && <><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></>}
                        {el.icon === 'caption' && <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/></>}
                        {el.icon === 'lower' && <><path d="M21 2H3v16h5v4l4-4h9V2z"/></>}
                        {el.icon === 'rect' && <><rect x="3" y="3" width="18" height="18" rx="2"/></>}
                        {el.icon === 'circle' && <><circle cx="12" cy="12" r="10"/></>}
                      </svg>
                    </div>
                    <span>{el.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Layer list for current scene */}
            {scene && scene.layers.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>Layers ({scene.layers.length})</div>
                {[...scene.layers].reverse().map(layer => (
                  <div
                    key={layer.id}
                    className={`${styles.layerItem} ${selectedLayerId === layer.id ? styles.layerItemActive : ''}`}
                    onClick={() => setSelectedLayerId(layer.id)}
                  >
                    <span className={styles.layerDot} style={{ background: layer.type === 'video' ? 'var(--accent)' : layer.type === 'text' ? '#1a7f37' : layer.type === 'caption' ? '#9a6700' : '#7c3aed' }} />
                    <span className={styles.layerName}>{layer.name}</span>
                    <button className={styles.layerDel} onClick={e => { e.stopPropagation(); removeLayer(layer.id) }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {leftTab === 'templates' && (
          <div className={styles.tabContent}>
            <div className={styles.templateList}>
              {templates.map(t => (
                <div key={t.id} className={`${styles.templateItem} ${t.id === template.id ? styles.templateItemActive : ''}`} onClick={() => navigate(`/templates/${t.id}`)}>
                  <div className={styles.templateMeta}>
                    <div className={styles.templateName}>{t.name}</div>
                    <div className={styles.templateInfo}>{(t.config as TemplateConfig)?.scenes?.length || 0} scenes{t.is_system ? ' · system' : ''}</div>
                  </div>
                  {t.id === template.id && <span className={styles.currentBadge}>Current</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {leftTab === 'projects' && (
          <div className={styles.tabContent}>
            <div className={styles.projectList}>
              {projects.length === 0 ? (
                <div className={styles.emptyState}>No projects yet</div>
              ) : projects.map(p => (
                <div key={p.id} className={styles.projectItem}>
                  <div className={styles.projectMeta}>
                    <div className={styles.projectName}>{p.name}</div>
                    <div className={styles.projectInfo}>{p.duration_ms ? `${Math.floor(p.duration_ms / 60000)}:${String(Math.floor((p.duration_ms % 60000) / 1000)).padStart(2, '0')}` : '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ CANVAS ═══ */}
      <div className={styles.canvas} onClick={() => { setSelectedLayerId(null); setEditingTextLayerId(null) }} onContextMenu={e => handleContextMenu(e, null)}>
        <div
          ref={canvasRef}
          className={styles.canvasFrame}
          style={{ width: 640, height: 360 }}
          onClick={e => e.stopPropagation()}
          onDrop={handleCanvasDrop}
          onDragOver={handleCanvasDragOver}
        >
          {/* Layer rendering + interaction — each layer is both visual AND interactive */}
          {scene?.layers.filter(l => l.visible !== false).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).map(layer => {
            const isSelected = selectedLayerId === layer.id
            const isText = layer.type === 'text'
            const isEditingText = editingTextLayerId === layer.id
            const scale = 640 / (layout.canvas.width || 1920)
            const tp = layer.props as TextLayerProps
            const vp = layer.props as VideoLayerProps
            const sp = layer.props as ShapeLayerProps
            const cp = layer.props as CaptionLayerProps
            const ip = layer.props as any

            return (
              <div
                key={layer.id}
                className={`${styles.layerOverlay} ${isSelected ? styles.layerOverlaySelected : ''} ${layer.locked ? styles.layerOverlayLocked : ''}`}
                style={{
                  left: `${layer.position.x}%`,
                  top: `${layer.position.y}%`,
                  width: `${layer.size.w}%`,
                  height: `${layer.size.h}%`,
                  cursor: layer.locked ? 'not-allowed' : (moving?.layerId === layer.id ? 'grabbing' : 'move'),
                  zIndex: (layer.zIndex || 0) + 10,
                  opacity: layer.opacity ?? 1,
                  borderRadius: layer.borderRadius ? `${layer.borderRadius}%` : undefined,
                  overflow: 'hidden',
                }}
                onMouseDown={e => handleLayerMouseDown(e, layer.id)}
                onContextMenu={e => handleContextMenu(e, layer.id)}
                onDoubleClick={isText ? e => handleTextDoubleClick(e, layer.id) : undefined}
              >
                {/* ── VIDEO LAYER ── */}
                {layer.type === 'video' && (
                  <div style={{
                    width: '100%', height: '100%',
                    background: vp.trackRole === 'camera'
                      ? 'linear-gradient(145deg, #1e1233, #1a1a2e, #12192e)'
                      : 'linear-gradient(145deg, #0d1117, #161b22, #1c2128)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4,
                    borderRadius: vp.clipShape === 'circle' ? '50%' : vp.clipShape === 'rounded' ? '12%' : 0,
                    border: layer.border ? `${layer.border.width}px solid ${layer.border.color}` : undefined,
                    position: 'relative',
                  }}>
                    {vp.trackRole !== 'camera' && (
                      <>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '8%', minHeight: 6, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 3%', gap: '1.5%' }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#e5534b' }} />
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#d29922' }} />
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#3fb950' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start', width: '70%', marginTop: '5%' }}>
                          <div style={{ width: '80%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }} />
                          <div style={{ width: '55%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }} />
                          <div style={{ width: '90%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }} />
                        </div>
                        <div style={{ width: '70%', height: '20%', background: 'rgba(0,0,0,0.3)', borderRadius: 3, marginTop: '2%', padding: '2%', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ width: '50%', height: 3, background: 'rgba(80,150,179,0.3)', borderRadius: 1 }} />
                          <div style={{ width: '65%', height: 3, background: 'rgba(63,185,80,0.2)', borderRadius: 1 }} />
                        </div>
                      </>
                    )}
                    {vp.trackRole === 'camera' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ width: '30%', height: '30%', color: 'rgba(255,255,255,0.15)' }}>
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                    )}
                    <span style={{ fontSize: 8 * Math.max(scale, 0.5), color: 'rgba(255,255,255,0.2)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontFamily: 'Inter, sans-serif' }}>
                      {layer.name}
                    </span>
                  </div>
                )}

                {/* ── TEXT LAYER ── */}
                {layer.type === 'text' && !isEditingText && (
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: tp.textAlign === 'left' ? 'flex-start' : tp.textAlign === 'right' ? 'flex-end' : 'center',
                    fontFamily: tp.fontFamily || 'Inter, sans-serif',
                    fontSize: Math.max(8, (tp.fontSize || 48) * scale),
                    fontWeight: tp.fontWeight || 600,
                    color: tp.fontColor || '#ffffff',
                    textAlign: (tp.textAlign || 'center') as any,
                    lineHeight: tp.lineHeight || 1.2,
                    background: tp.background || 'transparent',
                    padding: tp.padding ? tp.padding * scale : 0,
                    borderRadius: tp.background ? 6 : 0,
                    overflow: 'hidden', wordBreak: 'break-word' as const,
                  }}>
                    {tp.text || 'Double-click to edit'}
                  </div>
                )}

                {/* ── TEXT LAYER (editing mode) ── */}
                {isText && isEditingText && (
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className={styles.inlineTextEdit}
                    style={{
                      fontFamily: tp.fontFamily || 'Inter, sans-serif',
                      fontSize: `${Math.max(8, (tp.fontSize || 48) * scale)}px`,
                      fontWeight: tp.fontWeight || 600,
                      color: tp.fontColor || '#ffffff',
                      textAlign: (tp.textAlign || 'center') as any,
                      lineHeight: tp.lineHeight || 1.2,
                      userSelect: 'text',
                    }}
                    onBlur={e => {
                      updateLayer(layer.id, { props: { ...layer.props, text: e.currentTarget.textContent || '' } })
                      setEditingTextLayerId(null)
                    }}
                    onKeyDown={e => { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.currentTarget.blur() } }}
                    onMouseDown={e => e.stopPropagation()}
                  >
                    {tp.text}
                  </div>
                )}

                {/* ── CAPTION LAYER ── */}
                {layer.type === 'caption' && (
                  <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' as const,
                    fontFamily: cp.fontFamily || 'Inter, sans-serif',
                    fontSize: Math.max(8, (cp.fontSize || 36) * scale),
                    fontWeight: 700, color: cp.fontColor || '#ffffff',
                  }}>
                    {['Building', 'amazing', 'products'].map((word, i) => (
                      <span key={i} style={{
                        padding: '2px 5px', borderRadius: 4,
                        background: i === 1 ? (cp.highlightColor || '#3a7f9e') : (cp.style === 'box' ? 'rgba(0,0,0,0.5)' : 'transparent'),
                        color: cp.style === 'karaoke' && i !== 1 ? 'rgba(255,255,255,0.4)' : '#ffffff',
                        textDecoration: cp.style === 'underline' && i === 1 ? 'underline' : 'none',
                        textDecorationColor: cp.highlightColor || '#3a7f9e',
                        textUnderlineOffset: 3,
                        transform: cp.style === 'pop' && i === 1 ? 'scale(1.08)' : 'none',
                        display: 'inline-block',
                      }}>{word}</span>
                    ))}
                  </div>
                )}

                {/* ── SHAPE LAYER ── */}
                {layer.type === 'shape' && (
                  <div style={{
                    width: '100%', height: '100%',
                    background: sp.fill || 'rgba(58,127,158,0.3)',
                    borderRadius: sp.shape === 'circle' ? '50%' : sp.shape === 'badge' ? 8 : (layer.borderRadius ? `${layer.borderRadius}%` : 0),
                    border: sp.stroke ? `${sp.stroke.width}px solid ${sp.stroke.color}` : undefined,
                  }} />
                )}

                {/* ── IMAGE LAYER ── */}
                {layer.type === 'image' && (
                  <div style={{
                    width: '100%', height: '100%',
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(58,127,158,0.1))',
                    border: '1px dashed rgba(255,255,255,0.15)',
                    borderRadius: layer.borderRadius ? `${layer.borderRadius}%` : 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const, gap: 3,
                  }}>
                    {ip.src ? (
                      <img src={ip.src} alt={layer.name} style={{ width: '100%', height: '100%', objectFit: ip.fit || 'cover' }} />
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 20, height: 20, color: 'rgba(255,255,255,0.2)' }}>
                          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', fontWeight: 600, textTransform: 'uppercase' as const, fontFamily: 'Inter, sans-serif' }}>{layer.name}</span>
                      </>
                    )}
                  </div>
                )}

                {/* Resize handles (only when selected) */}
                {isSelected && !layer.locked && !isEditingText && (
                  <>
                    <div className={`${styles.handle} ${styles.handleTL}`} onMouseDown={e => handleResizeMouseDown(e, layer.id, 'tl')} />
                    <div className={`${styles.handle} ${styles.handleTR}`} onMouseDown={e => handleResizeMouseDown(e, layer.id, 'tr')} />
                    <div className={`${styles.handle} ${styles.handleBL}`} onMouseDown={e => handleResizeMouseDown(e, layer.id, 'bl')} />
                    <div className={`${styles.handle} ${styles.handleBR}`} onMouseDown={e => handleResizeMouseDown(e, layer.id, 'br')} />
                    <div className={`${styles.handle} ${styles.handleT}`} onMouseDown={e => handleResizeMouseDown(e, layer.id, 't')} />
                    <div className={`${styles.handle} ${styles.handleB}`} onMouseDown={e => handleResizeMouseDown(e, layer.id, 'b')} />
                    <div className={`${styles.handle} ${styles.handleL}`} onMouseDown={e => handleResizeMouseDown(e, layer.id, 'l')} />
                    <div className={`${styles.handle} ${styles.handleR}`} onMouseDown={e => handleResizeMouseDown(e, layer.id, 'r')} />
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Playback controls */}
        <div className={styles.transport}>
          <button className={styles.playBtn} onClick={() => { setIsPlaying(!isPlaying); if (!isPlaying) setCurrentFrame(0) }}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <input
            type="range" className={styles.scrubber}
            min={0} max={sceneDurFrames} value={Math.floor(currentFrame % sceneDurFrames)}
            onChange={e => { setIsPlaying(false); setCurrentFrame(Number(e.target.value)) }}
          />
          <span className={styles.frameLabel}>{Math.floor(currentFrame)}/{sceneDurFrames}f</span>
        </div>

        {/* Scene strip */}
        <div className={styles.sceneStrip}>
          <div className={styles.sceneHeader}>
            <span className={styles.sceneHeaderTitle}>Scenes</span>
            <div className={styles.spacer} />
            <div className={styles.sceneAddBtns}>
              {['PiP', 'TitleCard', 'FullFrame'].map(type => (
                <button key={type} className={styles.sceneAddBtn} onClick={() => addScene(type)}>{type}</button>
              ))}
            </div>
          </div>
          <div className={styles.sceneScroll}>
            {layout.scenes.map((s, i) => (
              <div key={s.id} className={`${styles.sceneCard} ${i === selectedSceneIdx ? styles.sceneCardActive : ''}`} onClick={() => { setSelectedSceneIdx(i); setSelectedLayerId(null); setCurrentFrame(0) }}>
                <div className={styles.sceneThumb}>
                  <span className={styles.sceneType}>{s.type}</span>
                </div>
                <div className={styles.sceneMeta}>
                  <div className={styles.sceneName}>{s.name} ({s.layers.length})</div>
                  <div className={styles.sceneInfo}>{s.durationSec}s</div>
                </div>
                {layout.scenes.length > 1 && <button className={styles.sceneRemBtn} onClick={e => { e.stopPropagation(); removeScene(i) }}>×</button>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      <div className={styles.rightPanel}>
        <div className={styles.tabs}>
          <div className={`${styles.tab} ${rightTab === 'style' ? styles.tabActive : ''}`} onClick={() => setRightTab('style')}>Style</div>
          <div className={`${styles.tab} ${rightTab === 'animate' ? styles.tabActive : ''}`} onClick={() => setRightTab('animate')}>Animate</div>
          <div className={`${styles.tab} ${rightTab === 'layout' ? styles.tabActive : ''}`} onClick={() => setRightTab('layout')}>Layout</div>
        </div>

        {/* ─── STYLE TAB ─── */}
        {rightTab === 'style' && (
          <div className={styles.tabContent}>
            {selectedLayer ? (
              <>
                <div className={styles.propSection}>
                  <div className={styles.propTitle}>{selectedLayer.name} <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>({selectedLayer.type})</span></div>
                </div>

                {/* Position & Size */}
                <div className={styles.propSection}>
                  <div className={styles.propTitle}>Position & Size</div>
                  <div className={styles.propRow}>
                    <span className={styles.propLabel}>X</span>
                    <input className={styles.propInput} type="number" value={Math.round(selectedLayer.position.x)} onChange={e => updateLayer(selectedLayer.id, { position: { ...selectedLayer.position, x: Number(e.target.value) } })} />
                    <span className={styles.propLabel}>Y</span>
                    <input className={styles.propInput} type="number" value={Math.round(selectedLayer.position.y)} onChange={e => updateLayer(selectedLayer.id, { position: { ...selectedLayer.position, y: Number(e.target.value) } })} />
                  </div>
                  <div className={styles.propRow}>
                    <span className={styles.propLabel}>W</span>
                    <input className={styles.propInput} type="number" value={Math.round(selectedLayer.size.w)} onChange={e => updateLayer(selectedLayer.id, { size: { ...selectedLayer.size, w: Number(e.target.value) } })} />
                    <span className={styles.propLabel}>H</span>
                    <input className={styles.propInput} type="number" value={Math.round(selectedLayer.size.h)} onChange={e => updateLayer(selectedLayer.id, { size: { ...selectedLayer.size, h: Number(e.target.value) } })} />
                  </div>
                </div>

                {/* Appearance */}
                <div className={styles.propSection}>
                  <div className={styles.propTitle}>Appearance</div>
                  <div className={styles.propRow}>
                    <span className={styles.propLabel}>Opacity</span>
                    <input type="range" className={styles.slider} min={0} max={100} value={Math.round((selectedLayer.opacity ?? 1) * 100)} onChange={e => updateLayer(selectedLayer.id, { opacity: Number(e.target.value) / 100 })} />
                    <span className={styles.sliderVal}>{Math.round((selectedLayer.opacity ?? 1) * 100)}%</span>
                  </div>
                  <div className={styles.propRow}>
                    <span className={styles.propLabel}>Radius</span>
                    <input type="range" className={styles.slider} min={0} max={50} value={selectedLayer.borderRadius || 0} onChange={e => updateLayer(selectedLayer.id, { borderRadius: Number(e.target.value) })} />
                    <span className={styles.sliderVal}>{selectedLayer.borderRadius || 0}%</span>
                  </div>
                  {selectedLayer.border && (
                    <div className={styles.propRow}>
                      <span className={styles.propLabel}>Border</span>
                      <input type="color" value={selectedLayer.border.color} onChange={e => updateLayer(selectedLayer.id, { border: { ...selectedLayer.border!, color: e.target.value } })} className={styles.colorInput} />
                      <input type="number" className={styles.propInput} style={{ width: 48 }} value={selectedLayer.border.width} onChange={e => updateLayer(selectedLayer.id, { border: { ...selectedLayer.border!, width: Number(e.target.value) } })} />
                    </div>
                  )}
                </div>

                {/* Type-specific props */}
                {selectedLayer.type === 'text' && (
                  <div className={styles.propSection}>
                    <div className={styles.propTitle}>Text</div>
                    <div className={styles.propRow}>
                      <input className={styles.propInputWide} value={(selectedLayer.props as TextLayerProps).text} onChange={e => updateLayer(selectedLayer.id, { props: { ...selectedLayer.props, text: e.target.value } })} />
                    </div>
                    <div className={styles.propRow}>
                      <span className={styles.propLabel}>Font</span>
                      <select className={styles.propSelect} value={(selectedLayer.props as TextLayerProps).fontFamily} onChange={e => updateLayer(selectedLayer.id, { props: { ...selectedLayer.props, fontFamily: e.target.value } })}>
                        {['Inter', 'JetBrains Mono', 'Georgia', 'Arial', 'Helvetica Neue'].map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div className={styles.propRow}>
                      <span className={styles.propLabel}>Size</span>
                      <input type="range" className={styles.slider} min={10} max={120} value={(selectedLayer.props as TextLayerProps).fontSize} onChange={e => updateLayer(selectedLayer.id, { props: { ...selectedLayer.props, fontSize: Number(e.target.value) } })} />
                      <span className={styles.sliderVal}>{(selectedLayer.props as TextLayerProps).fontSize}px</span>
                    </div>
                    <div className={styles.propRow}>
                      <span className={styles.propLabel}>Color</span>
                      <input type="color" value={(selectedLayer.props as TextLayerProps).fontColor} onChange={e => updateLayer(selectedLayer.id, { props: { ...selectedLayer.props, fontColor: e.target.value } })} className={styles.colorInput} />
                    </div>
                  </div>
                )}

                {selectedLayer.type === 'video' && (
                  <div className={styles.propSection}>
                    <div className={styles.propTitle}>Video</div>
                    <div className={styles.propRow}>
                      <span className={styles.propLabel}>Role</span>
                      <select className={styles.propSelect} value={(selectedLayer.props as VideoLayerProps).trackRole} onChange={e => updateLayer(selectedLayer.id, { props: { ...selectedLayer.props, trackRole: e.target.value } })}>
                        <option value="main">Main (Screen)</option>
                        <option value="camera">Camera</option>
                      </select>
                    </div>
                    <div className={styles.propRow}>
                      <span className={styles.propLabel}>Shape</span>
                      <select className={styles.propSelect} value={(selectedLayer.props as VideoLayerProps).clipShape} onChange={e => updateLayer(selectedLayer.id, { props: { ...selectedLayer.props, clipShape: e.target.value } })}>
                        <option value="rectangle">Rectangle</option>
                        <option value="rounded">Rounded</option>
                        <option value="circle">Circle</option>
                      </select>
                    </div>
                  </div>
                )}

                {selectedLayer.type === 'caption' && (
                  <div className={styles.propSection}>
                    <div className={styles.propTitle}>Caption Style</div>
                    <div className={styles.propRow}>
                      <span className={styles.propLabel}>Style</span>
                      <select className={styles.propSelect} value={(selectedLayer.props as CaptionLayerProps).style} onChange={e => updateLayer(selectedLayer.id, { props: { ...selectedLayer.props, style: e.target.value } })}>
                        <option value="pop">Pop Highlight</option>
                        <option value="underline">Underline</option>
                        <option value="karaoke">Karaoke</option>
                        <option value="box">Classic Box</option>
                      </select>
                    </div>
                    <div className={styles.propRow}>
                      <span className={styles.propLabel}>Highlight</span>
                      <input type="color" value={(selectedLayer.props as CaptionLayerProps).highlightColor || '#3a7f9e'} onChange={e => updateLayer(selectedLayer.id, { props: { ...selectedLayer.props, highlightColor: e.target.value } })} className={styles.colorInput} />
                    </div>
                  </div>
                )}

                {/* Quick actions */}
                <div className={styles.propSection}>
                  <div className={styles.quickActions}>
                    <button className={styles.qaBtn} onClick={() => {
                      const dup = { ...selectedLayer, id: `layer-${Date.now()}`, name: `${selectedLayer.name} copy`, position: { x: selectedLayer.position.x + 2, y: selectedLayer.position.y + 2 } }
                      updateLayout(l => {
                        const scenes = [...l.scenes]
                        scenes[selectedSceneIdx] = { ...scenes[selectedSceneIdx], layers: [...scenes[selectedSceneIdx].layers, dup] }
                        return { ...l, scenes }
                      })
                      setSelectedLayerId(dup.id)
                    }}>Duplicate</button>
                    <button className={styles.qaBtn} onClick={() => updateLayer(selectedLayer.id, { visible: !selectedLayer.visible })}>{selectedLayer.visible ? 'Hide' : 'Show'}</button>
                    <button className={`${styles.qaBtn} ${styles.qaBtnDanger}`} onClick={() => removeLayer(selectedLayer.id)}>Delete</button>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.propSection}>
                <div className={styles.emptyState}>Select a layer to edit its properties</div>

                {/* Theme controls when no layer selected */}
                <div className={styles.propTitle} style={{ marginTop: 16 }}>Theme</div>
                <div className={styles.propRow}>
                  <span className={styles.propLabel}>Accent</span>
                  <div className={styles.swatchRow}>
                    {['#3a7f9e', '#cf222e', '#1a7f37', '#7c3aed', '#9a6700', '#f0883e'].map(c => (
                      <div key={c} className={`${styles.swatch} ${config.theme.accentColor === c ? styles.swatchActive : ''}`} style={{ background: c }} onClick={() => updateTemplate(template.id, { config: { ...config, theme: { ...config.theme, accentColor: c } } })} />
                    ))}
                  </div>
                </div>
                <div className={styles.propRow}>
                  <span className={styles.propLabel}>Bg</span>
                  <select className={styles.propSelect} value={layout.canvas.background === '#f6f8fa' ? 'light' : 'dark'} onChange={e => {
                    const bg = e.target.value === 'light' ? '#f6f8fa' : '#0d1117'
                    updateLayout(l => ({ ...l, canvas: { ...l.canvas, background: bg } }))
                  }}>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── ANIMATE TAB ─── */}
        {rightTab === 'animate' && (
          <div className={styles.tabContent}>
            {selectedLayer ? (
              <>
                <div className={styles.propSection}>
                  <div className={styles.propTitle}>Entrance</div>
                  <div className={styles.animGrid}>
                    <div className={`${styles.animCard} ${!selectedLayer.animations?.entrance ? styles.animCardActive : ''}`} onClick={() => updateLayer(selectedLayer.id, { animations: { ...selectedLayer.animations, entrance: undefined } })}>None</div>
                    {ANIM_PRESETS.map(a => (
                      <div key={a.type} className={`${styles.animCard} ${selectedLayer.animations?.entrance?.type === a.type ? styles.animCardActive : ''}`} onClick={() => updateLayer(selectedLayer.id, { animations: { ...selectedLayer.animations, entrance: { type: a.type as any, durationMs: selectedLayer.animations?.entrance?.durationMs || 300, delayMs: selectedLayer.animations?.entrance?.delayMs || 0, easing: 'easeOut' } } })}>{a.label}</div>
                    ))}
                  </div>
                </div>
                {selectedLayer.animations?.entrance && (
                  <div className={styles.propSection}>
                    <div className={styles.propRow}>
                      <span className={styles.propLabel}>Duration</span>
                      <input type="range" className={styles.slider} min={100} max={2000} value={selectedLayer.animations.entrance.durationMs} onChange={e => updateLayer(selectedLayer.id, { animations: { ...selectedLayer.animations, entrance: { ...selectedLayer.animations.entrance!, durationMs: Number(e.target.value) } } })} />
                      <span className={styles.sliderVal}>{(selectedLayer.animations.entrance.durationMs / 1000).toFixed(1)}s</span>
                    </div>
                    <div className={styles.propRow}>
                      <span className={styles.propLabel}>Delay</span>
                      <input type="range" className={styles.slider} min={0} max={2000} value={selectedLayer.animations.entrance.delayMs} onChange={e => updateLayer(selectedLayer.id, { animations: { ...selectedLayer.animations, entrance: { ...selectedLayer.animations.entrance!, delayMs: Number(e.target.value) } } })} />
                      <span className={styles.sliderVal}>{(selectedLayer.animations.entrance.delayMs / 1000).toFixed(1)}s</span>
                    </div>
                    <div className={styles.propRow}>
                      <span className={styles.propLabel}>Easing</span>
                      <div className={styles.easingRow}>
                        {(['linear', 'easeOut', 'easeIn', 'spring'] as const).map(e => (
                          <button key={e} className={`${styles.easingBtn} ${selectedLayer.animations?.entrance?.easing === e ? styles.easingBtnActive : ''}`} onClick={() => updateLayer(selectedLayer.id, { animations: { ...selectedLayer.animations, entrance: { ...selectedLayer.animations!.entrance!, easing: e } } })}>{e}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className={styles.propSection}>
                  <div className={styles.propTitle}>Exit</div>
                  <div className={styles.animGrid}>
                    <div className={`${styles.animCard} ${!selectedLayer.animations?.exit ? styles.animCardActive : ''}`} onClick={() => updateLayer(selectedLayer.id, { animations: { ...selectedLayer.animations, exit: undefined } })}>None</div>
                    {EXIT_PRESETS.map(a => (
                      <div key={a.type} className={`${styles.animCard} ${selectedLayer.animations?.exit?.type === a.type ? styles.animCardActive : ''}`} onClick={() => updateLayer(selectedLayer.id, { animations: { ...selectedLayer.animations, exit: { type: a.type as any, durationMs: 300, delayMs: 0, easing: 'easeOut' } } })}>{a.label}</div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.propSection}><div className={styles.emptyState}>Select a layer to configure animations</div></div>
            )}
          </div>
        )}

        {/* ─── LAYOUT TAB ─── */}
        {rightTab === 'layout' && (
          <div className={styles.tabContent}>
            <div className={styles.propSection}>
              <div className={styles.propTitle}>Canvas</div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>Size</span>
                <select className={styles.propSelect} value={`${layout.canvas.width}x${layout.canvas.height}`} onChange={e => {
                  const [w, h] = e.target.value.split('x').map(Number)
                  updateLayout(l => ({ ...l, canvas: { ...l.canvas, width: w, height: h } }))
                }}>
                  <option value="1920x1080">1920 x 1080 (16:9)</option>
                  <option value="1080x1920">1080 x 1920 (9:16)</option>
                  <option value="1080x1080">1080 x 1080 (1:1)</option>
                  <option value="1080x1350">1080 x 1350 (4:5)</option>
                </select>
              </div>
              <div className={styles.propRow}>
                <span className={styles.propLabel}>FPS</span>
                <select className={styles.propSelect} value={layout.canvas.fps} onChange={e => updateLayout(l => ({ ...l, canvas: { ...l.canvas, fps: Number(e.target.value) } }))}>
                  <option value={24}>24</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                </select>
              </div>
            </div>
            {scene && (
              <div className={styles.propSection}>
                <div className={styles.propTitle}>Scene: {scene.name}</div>
                <div className={styles.propRow}>
                  <span className={styles.propLabel}>Duration</span>
                  <input type="range" className={styles.slider} min={1} max={60} value={scene.durationSec} onChange={e => {
                    updateLayout(l => {
                      const scenes = [...l.scenes]
                      scenes[selectedSceneIdx] = { ...scenes[selectedSceneIdx], durationSec: Number(e.target.value) }
                      return { ...l, scenes }
                    })
                  }} />
                  <span className={styles.sliderVal}>{scene.durationSec}s</span>
                </div>
                <div className={styles.propRow}>
                  <span className={styles.propLabel}>Transition</span>
                  <select className={styles.propSelect} value={scene.transition.in} onChange={e => {
                    updateLayout(l => {
                      const scenes = [...l.scenes]
                      scenes[selectedSceneIdx] = { ...scenes[selectedSceneIdx], transition: { ...scenes[selectedSceneIdx].transition, in: e.target.value as any, out: e.target.value as any } }
                      return { ...l, scenes }
                    })
                  }}>
                    <option value="none">None</option>
                    <option value="fade">Fade</option>
                    <option value="crossfade">Crossfade</option>
                  </select>
                </div>
              </div>
            )}
            <div className={styles.propSection}>
              <div className={styles.propTitle}>Layer Order</div>
              {scene && [...scene.layers].reverse().map((layer, i) => (
                <div key={layer.id} className={styles.propRow}>
                  <span className={styles.propLabel} style={{ width: 'auto', flex: 1 }}>{layer.name}</span>
                  <span className={styles.sliderVal}>z:{layer.zIndex}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══ CONTEXT MENU ═══ */}
      {ctxMenu && (
        <div className={styles.ctxMenu} style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={e => e.stopPropagation()}>
          {ctxMenu.layerId ? (
            <>
              <div className={styles.ctxHeader}>{scene?.layers.find(l => l.id === ctxMenu.layerId)?.name || 'Layer'}</div>
              <div className={styles.ctxDivider} />
              <button className={styles.ctxItem} onClick={() => ctxAction('duplicate')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Duplicate
              </button>
              <button className={styles.ctxItem} onClick={() => ctxAction('hide')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                {scene?.layers.find(l => l.id === ctxMenu.layerId)?.visible ? 'Hide' : 'Show'}
              </button>
              <button className={styles.ctxItem} onClick={() => ctxAction('lock')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {scene?.layers.find(l => l.id === ctxMenu.layerId)?.locked ? 'Unlock' : 'Lock'}
              </button>
              <div className={styles.ctxDivider} />
              <button className={styles.ctxItem} onClick={() => ctxAction('front')}>Bring to Front</button>
              <button className={styles.ctxItem} onClick={() => ctxAction('back')}>Send to Back</button>
              <div className={styles.ctxDivider} />
              <button className={`${styles.ctxItem} ${styles.ctxItemDanger}`} onClick={() => ctxAction('delete')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Delete
              </button>
            </>
          ) : (
            <>
              <div className={styles.ctxHeader}>Canvas</div>
              <div className={styles.ctxDivider} />
              <button className={styles.ctxItem} onClick={() => { setCtxMenu(null); addLayer('text') }}>Add Text</button>
              <button className={styles.ctxItem} onClick={() => { setCtxMenu(null); addLayer('shape') }}>Add Shape</button>
              <button className={styles.ctxItem} onClick={() => { setCtxMenu(null); addLayer('video', ELEMENT_DEFS[0].defaults) }}>Add PiP Camera</button>
              <button className={styles.ctxItem} onClick={() => { setCtxMenu(null); addLayer('caption') }}>Add Captions</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
