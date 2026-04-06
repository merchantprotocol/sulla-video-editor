import { EASING, lerp, clamp } from './easing.js'

/**
 * Compute the visual state for an animation at a given progress ratio.
 * Returns an object with CSS-applicable transform/opacity values.
 *
 * @param {object} animation - { type, durationMs, delayMs, easing }
 * @param {number} progressRatio - 0 (start) to 1 (end) of the animation
 * @returns {{ opacity?: number, translateX?: number, translateY?: number, scale?: number, rotate?: number }}
 */
export function computeAnimationState(animation, progressRatio) {
  if (!animation || !animation.type) return {}

  const easingFn = EASING[animation.easing] || EASING.easeOut
  const t = easingFn(clamp(progressRatio, 0, 1))

  switch (animation.type) {
    case 'fadeIn':     return { opacity: t }
    case 'fadeOut':    return { opacity: 1 - t }
    case 'slideUp':    return { opacity: t, translateY: lerp(40, 0, t) }
    case 'slideDown':  return { opacity: t, translateY: lerp(-40, 0, t) }
    case 'slideLeft':  return { opacity: t, translateX: lerp(40, 0, t) }
    case 'slideRight': return { opacity: t, translateX: lerp(-40, 0, t) }
    case 'scaleIn':    return { opacity: t, scale: lerp(0.3, 1, t) }
    case 'scaleOut':   return { opacity: 1 - t, scale: lerp(1, 0.3, t) }
    case 'bounce':     return { opacity: t, translateY: lerp(60, 0, t), scale: lerp(0.8, 1, t) }
    case 'pop':        return { opacity: t, scale: lerp(0, 1, t) }
    case 'spin':       return { opacity: t, rotate: lerp(180, 0, t) }
    default:           return {}
  }
}

/**
 * Calculate animation progress ratio for a layer at the current frame.
 *
 * @param {object} layer - LayerDefinition
 * @param {number} frameInScene - current frame offset within the scene
 * @param {number} sceneDurationFrames - total frames in the scene
 * @param {number} fps - frames per second
 * @returns {{ entrance: object, exit: object }} - merged CSS transform state
 */
export function computeLayerAnimations(layer, frameInScene, sceneDurationFrames, fps) {
  let result = { opacity: 1, translateX: 0, translateY: 0, scale: 1, rotate: 0 }

  const layerStartFrame = (layer.timing?.startSec || 0) * fps
  const layerEndFrame = layer.timing?.endSec != null
    ? layer.timing.endSec * fps
    : sceneDurationFrames
  const frameInLayer = frameInScene - layerStartFrame

  // Entrance animation
  if (layer.animations?.entrance) {
    const anim = layer.animations.entrance
    const delayFrames = (anim.delayMs || 0) / 1000 * fps
    const durFrames = Math.max(1, (anim.durationMs || 300) / 1000 * fps)
    const progress = clamp((frameInLayer - delayFrames) / durFrames, 0, 1)
    const state = computeAnimationState(anim, progress)
    result = { ...result, ...state }
  }

  // Exit animation
  if (layer.animations?.exit) {
    const anim = layer.animations.exit
    const durFrames = Math.max(1, (anim.durationMs || 300) / 1000 * fps)
    const framesBeforeEnd = layerEndFrame - frameInScene
    if (framesBeforeEnd <= durFrames) {
      const progress = clamp(1 - framesBeforeEnd / durFrames, 0, 1)
      const state = computeAnimationState(anim, progress)
      // Merge exit on top — exit opacity multiplies with entrance
      if (state.opacity != null) result.opacity *= state.opacity
      if (state.translateX != null) result.translateX += state.translateX
      if (state.translateY != null) result.translateY += state.translateY
      if (state.scale != null) result.scale *= state.scale
      if (state.rotate != null) result.rotate += state.rotate
    }
  }

  return result
}

/**
 * Build a CSS style object from animation state.
 */
export function animationToStyle(state) {
  const transforms = []
  if (state.translateX) transforms.push(`translateX(${state.translateX}px)`)
  if (state.translateY) transforms.push(`translateY(${state.translateY}px)`)
  if (state.scale != null && state.scale !== 1) transforms.push(`scale(${state.scale})`)
  if (state.rotate) transforms.push(`rotate(${state.rotate}deg)`)

  return {
    opacity: state.opacity != null ? state.opacity : 1,
    transform: transforms.length ? transforms.join(' ') : undefined,
  }
}
