// ═══ Scene Layout Data Model ═══
// Serialized output of the drag-and-drop template editor.
// Consumed by the layout-renderer React composition for both
// editor preview and Puppeteer-based video rendering.

export type LayerType = 'video' | 'text' | 'caption' | 'shape' | 'image'

export type AnimationType =
  | 'fadeIn' | 'fadeOut'
  | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight'
  | 'scaleIn' | 'scaleOut'
  | 'bounce' | 'pop' | 'spin'

export type EasingType = 'linear' | 'easeOut' | 'easeIn' | 'easeInOut' | 'spring'

export type TransitionType = 'none' | 'fade' | 'crossfade' | 'slideLeft' | 'slideRight'

export type ClipShape = 'rectangle' | 'circle' | 'rounded'

export type CaptionStyle = 'pop' | 'underline' | 'karaoke' | 'box'

// ─── Animation ───

export interface AnimationDef {
  type: AnimationType
  durationMs: number
  delayMs: number
  easing: EasingType
}

// ─── Layer Props (type-specific) ───

export interface VideoLayerProps {
  trackRole: string        // "main" | "camera" — maps to project track roles at render time
  fit: 'cover' | 'contain' | 'fill'
  clipShape: ClipShape
}

export interface TextLayerProps {
  text: string
  fontFamily: string
  fontSize: number         // px at canvas resolution
  fontWeight: number
  fontColor: string
  textAlign: 'left' | 'center' | 'right'
  lineHeight: number
  letterSpacing: number
  background?: string
  padding?: number
}

export interface CaptionLayerProps {
  style: CaptionStyle
  fontFamily: string
  fontSize: number
  fontColor: string
  highlightColor: string
  maxWordsPerLine: number
  source: string           // audio track role for transcription, e.g. "speaker"
}

export interface ShapeLayerProps {
  shape: 'rectangle' | 'circle' | 'line' | 'badge'
  fill: string
  stroke?: { width: number; color: string }
}

export interface ImageLayerProps {
  src: string              // URL or asset reference
  fit: 'cover' | 'contain' | 'fill'
}

export type LayerProps = VideoLayerProps | TextLayerProps | CaptionLayerProps | ShapeLayerProps | ImageLayerProps

// ─── Layer ───

export interface LayerDefinition {
  id: string
  type: LayerType
  name: string
  zIndex: number
  visible: boolean
  locked: boolean

  // Spatial (percentages of canvas, 0-100)
  position: { x: number; y: number }
  size: { w: number; h: number }
  rotation: number

  // Appearance
  opacity: number
  borderRadius: number     // percentage (0=square, 50=circle)
  border?: { width: number; color: string }
  shadow?: { x: number; y: number; blur: number; color: string }
  blendMode?: string

  // Timing within scene (seconds, relative to scene start)
  timing: {
    startSec: number
    endSec: number | null  // null = until scene ends
  }

  // Animations
  animations: {
    entrance?: AnimationDef
    exit?: AnimationDef
    loop?: AnimationDef
  }

  // Type-specific properties
  props: LayerProps
}

// ─── Scene ───

export interface SceneDefinition {
  id: string
  name: string
  type: string             // "TitleCard" | "PiP" | "FullFrame" | "BRoll" | "custom"
  durationSec: number
  transition: {
    in: TransitionType
    out: TransitionType
    durationMs: number
  }
  layers: LayerDefinition[]
}

// ─── Root Layout ───

export interface SceneLayout {
  version: 1
  canvas: {
    width: number
    height: number
    background: string
    fps: number
  }
  scenes: SceneDefinition[]
}

// ─── Factory helpers ───

let _layerCounter = 0

export function createLayer(type: LayerType, partial?: Partial<LayerDefinition>): LayerDefinition {
  const id = `layer-${type}-${Date.now()}-${_layerCounter++}`

  const defaults: Record<LayerType, { name: string; size: { w: number; h: number }; position: { x: number; y: number }; props: LayerProps }> = {
    video: {
      name: 'Video',
      size: { w: 100, h: 100 },
      position: { x: 0, y: 0 },
      props: { trackRole: 'main', fit: 'cover', clipShape: 'rectangle' } as VideoLayerProps,
    },
    text: {
      name: 'Text',
      size: { w: 40, h: 8 },
      position: { x: 30, y: 10 },
      props: { text: 'Your text here', fontFamily: 'Inter', fontSize: 48, fontWeight: 600, fontColor: '#ffffff', textAlign: 'center', lineHeight: 1.2, letterSpacing: 0 } as TextLayerProps,
    },
    caption: {
      name: 'Captions',
      size: { w: 70, h: 10 },
      position: { x: 15, y: 82 },
      props: { style: 'pop', fontFamily: 'Inter', fontSize: 36, fontColor: '#ffffff', highlightColor: '#3a7f9e', maxWordsPerLine: 4, source: 'speaker' } as CaptionLayerProps,
    },
    shape: {
      name: 'Shape',
      size: { w: 20, h: 20 },
      position: { x: 40, y: 40 },
      props: { shape: 'rectangle', fill: 'rgba(58,127,158,0.3)' } as ShapeLayerProps,
    },
    image: {
      name: 'Image',
      size: { w: 15, h: 12 },
      position: { x: 80, y: 3 },
      props: { src: '', fit: 'contain' } as ImageLayerProps,
    },
  }

  const d = defaults[type]
  return {
    id,
    type,
    name: d.name,
    zIndex: 0,
    visible: true,
    locked: false,
    position: d.position,
    size: d.size,
    rotation: 0,
    opacity: 1,
    borderRadius: 0,
    timing: { startSec: 0, endSec: null },
    animations: {},
    props: d.props,
    ...partial,
  }
}

export function createScene(type: string, partial?: Partial<SceneDefinition>): SceneDefinition {
  return {
    id: `scene-${Date.now()}`,
    name: type,
    type,
    durationSec: type === 'TitleCard' ? 4 : 10,
    transition: { in: 'fade', out: 'fade', durationMs: 300 },
    layers: [],
    ...partial,
  }
}

export function createDefaultLayout(): SceneLayout {
  return {
    version: 1,
    canvas: { width: 1920, height: 1080, background: '#0d1117', fps: 30 },
    scenes: [],
  }
}

// ─── Scene Presets (auto-populate layers for common scene types) ───

export function createSceneWithPreset(type: string): SceneDefinition {
  const scene = createScene(type)

  switch (type) {
    case 'PiP':
      scene.layers = [
        createLayer('video', { name: 'Screen', zIndex: 0, props: { trackRole: 'main', fit: 'cover', clipShape: 'rectangle' } as VideoLayerProps }),
        createLayer('video', { name: 'Camera', zIndex: 1, size: { w: 18, h: 25 }, position: { x: 78, y: 68 }, borderRadius: 50, border: { width: 3, color: '#ffffff' }, props: { trackRole: 'camera', fit: 'cover', clipShape: 'circle' } as VideoLayerProps, animations: { entrance: { type: 'scaleIn', durationMs: 300, delayMs: 200, easing: 'easeOut' } } }),
        createLayer('caption', { name: 'Captions', zIndex: 2 }),
      ]
      break
    case 'TitleCard':
      scene.durationSec = 4
      scene.layers = [
        createLayer('shape', { name: 'Background', zIndex: 0, size: { w: 100, h: 100 }, position: { x: 0, y: 0 }, props: { shape: 'rectangle', fill: '#0d1117' } as ShapeLayerProps }),
        createLayer('text', { name: 'Title', zIndex: 1, size: { w: 60, h: 12 }, position: { x: 20, y: 38 }, props: { text: 'Title Here', fontFamily: 'Inter', fontSize: 64, fontWeight: 700, fontColor: '#e6edf3', textAlign: 'center', lineHeight: 1.1, letterSpacing: -1 } as TextLayerProps, animations: { entrance: { type: 'slideUp', durationMs: 500, delayMs: 200, easing: 'easeOut' } } }),
        createLayer('shape', { name: 'Accent Bar', zIndex: 2, size: { w: 5, h: 0.4 }, position: { x: 47.5, y: 52 }, props: { shape: 'rectangle', fill: '#3a7f9e' } as ShapeLayerProps, animations: { entrance: { type: 'scaleIn', durationMs: 400, delayMs: 500, easing: 'easeOut' } } }),
        createLayer('text', { name: 'Subtitle', zIndex: 3, size: { w: 50, h: 6 }, position: { x: 25, y: 56 }, props: { text: 'Subtitle text', fontFamily: 'Inter', fontSize: 24, fontWeight: 400, fontColor: '#8b949e', textAlign: 'center', lineHeight: 1.4, letterSpacing: 0 } as TextLayerProps, animations: { entrance: { type: 'fadeIn', durationMs: 400, delayMs: 700, easing: 'easeOut' } } }),
      ]
      break
    case 'FullFrame':
      scene.layers = [
        createLayer('video', { name: 'Video', zIndex: 0, props: { trackRole: 'main', fit: 'cover', clipShape: 'rectangle' } as VideoLayerProps }),
        createLayer('caption', { name: 'Captions', zIndex: 1 }),
      ]
      break
    case 'BRoll':
      scene.layers = [
        createLayer('image', { name: 'B-Roll', zIndex: 0, size: { w: 100, h: 100 }, position: { x: 0, y: 0 }, props: { src: '', fit: 'cover' } as ImageLayerProps }),
      ]
      break
    default:
      // Custom scene, no presets
      break
  }

  return scene
}
