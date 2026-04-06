import React from 'react'
import { computeLayerAnimations, animationToStyle } from './animations.js'
import { clamp } from './easing.js'
import { VideoLayer } from './layers/VideoLayer.jsx'
import { TextLayer } from './layers/TextLayer.jsx'
import { ShapeLayer } from './layers/ShapeLayer.jsx'
import { ImageLayer } from './layers/ImageLayer.jsx'
import { CaptionLayer } from './layers/CaptionLayer.jsx'

const LAYER_COMPONENTS = {
  video: VideoLayer,
  text: TextLayer,
  shape: ShapeLayer,
  image: ImageLayer,
  caption: CaptionLayer,
}

/**
 * Resolve which scene is active at the given frame.
 * Returns { sceneIndex, frameInScene, sceneDurationFrames }
 */
function resolveScene(scenes, frame, fps) {
  let accumulated = 0
  for (let i = 0; i < scenes.length; i++) {
    const durFrames = (scenes[i].durationSec || 10) * fps
    if (frame < accumulated + durFrames) {
      return { sceneIndex: i, frameInScene: frame - accumulated, sceneDurationFrames: durFrames }
    }
    accumulated += durFrames
  }
  // Past the end — clamp to last scene's last frame
  const last = scenes.length - 1
  const lastDur = (scenes[last]?.durationSec || 10) * fps
  return { sceneIndex: last, frameInScene: lastDur - 1, sceneDurationFrames: lastDur }
}

/**
 * Compute scene transition opacity (fade in/out between scenes).
 */
function sceneTransitionOpacity(scene, frameInScene, sceneDurationFrames, fps) {
  let opacity = 1
  const transIn = scene.transition?.in || 'none'
  const transOut = scene.transition?.out || 'none'
  const transDurFrames = (scene.transition?.durationMs || 300) / 1000 * fps

  if (transIn === 'fade' && frameInScene < transDurFrames) {
    opacity *= frameInScene / transDurFrames
  }
  if (transOut === 'fade' && (sceneDurationFrames - frameInScene) < transDurFrames) {
    opacity *= (sceneDurationFrames - frameInScene) / transDurFrames
  }

  return clamp(opacity, 0, 1)
}

/**
 * LayoutRenderer — the core interpreter component.
 *
 * Given a SceneLayout and a frame number, renders the correct scene
 * with all layers, animations, and transitions.
 *
 * Used in both:
 * - Editor preview (live in browser, frame driven by requestAnimationFrame)
 * - Puppeteer render (headless, frame driven by window.setFrame())
 */
export function LayoutRenderer({ layout, frame, fps, width, height, tracks }) {
  if (!layout || !layout.scenes || layout.scenes.length === 0) {
    return (
      <div style={{
        width, height,
        background: layout?.canvas?.background || '#0d1117',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#6e7681', fontFamily: 'Inter, sans-serif', fontSize: 14,
      }}>
        No scenes — add a scene to start
      </div>
    )
  }

  const { sceneIndex, frameInScene, sceneDurationFrames } = resolveScene(layout.scenes, frame, fps)
  const scene = layout.scenes[sceneIndex]
  const sceneOpacity = sceneTransitionOpacity(scene, frameInScene, sceneDurationFrames, fps)

  // Sort layers by zIndex
  const sortedLayers = [...scene.layers]
    .filter(l => l.visible !== false)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))

  return (
    <div style={{
      width,
      height,
      background: layout.canvas?.background || '#0d1117',
      position: 'relative',
      overflow: 'hidden',
      opacity: sceneOpacity,
    }}>
      {sortedLayers.map(layer => {
        // Check timing visibility
        const layerStartFrame = (layer.timing?.startSec || 0) * fps
        const layerEndFrame = layer.timing?.endSec != null ? layer.timing.endSec * fps : sceneDurationFrames
        if (frameInScene < layerStartFrame || frameInScene >= layerEndFrame) return null

        // Compute animation state
        const animState = computeLayerAnimations(layer, frameInScene, sceneDurationFrames, fps)
        const animStyle = animationToStyle(animState)

        // Layer positioning
        const style = {
          position: 'absolute',
          left: `${layer.position.x}%`,
          top: `${layer.position.y}%`,
          width: `${layer.size.w}%`,
          height: `${layer.size.h}%`,
          opacity: (layer.opacity ?? 1) * (animStyle.opacity ?? 1),
          transform: [
            animStyle.transform,
            layer.rotation ? `rotate(${layer.rotation}deg)` : '',
          ].filter(Boolean).join(' ') || undefined,
          borderRadius: layer.borderRadius ? `${layer.borderRadius}%` : undefined,
          border: layer.border ? `${layer.border.width}px solid ${layer.border.color}` : undefined,
          boxShadow: layer.shadow ? `${layer.shadow.x}px ${layer.shadow.y}px ${layer.shadow.blur}px ${layer.shadow.color}` : undefined,
          mixBlendMode: layer.blendMode || undefined,
          overflow: 'hidden',
        }

        const LayerComponent = LAYER_COMPONENTS[layer.type]
        if (!LayerComponent) return null

        return (
          <div key={layer.id} style={style}>
            <LayerComponent
              layer={layer}
              frame={frame}
              frameInScene={frameInScene}
              fps={fps}
              tracks={tracks}
            />
          </div>
        )
      })}
    </div>
  )
}
