import React from 'react'

/**
 * Beluga-style chat: messages pop off the phone, dominating the foreground.
 * Phone is dimmed/blurred in background as context.
 *
 * 10 seconds / 300 frames @ 30fps
 *
 * Messages:
 *  1. Customer: cancel appointment  (0.3s)
 *  2. Customer: found cheaper        (1.8s)
 *  3. [tension pause]
 *  4. Sulla: pulled up account       (3.5s)
 *  5. Sulla: 3 jobs, 5-star          (4.7s)
 *  6. Sulla: warranty active         (5.9s)
 *  7. Sulla: match price             (7.0s)
 *  8. Customer: wait really?         (8.0s)
 *  9. Customer: ok keep it           (8.7s)
 * 10. Reveal banner                  (9.3s)
 */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1) }
function easeOut(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3) }
function easeOutBack(t) {
  const c1 = 1.70158
  const c3 = c1 + 1
  t = clamp(t, 0, 1)
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
function prog(frame, s, e) { return clamp((frame - s) / (e - s), 0, 1) }
function anim(frame, s, e, from, to, ease = easeOut) { return lerp(from, to, ease(prog(frame, s, e))) }

const PHONE_W = 390
const PHONE_H = 844

// Message timeline (frame numbers @ 30fps)
const MESSAGES = [
  { t: 10,  speaker: 'customer', text: "Hey I need to cancel tomorrow's appointment" },
  { t: 55,  speaker: 'customer', text: "Found someone $200 cheaper 🤷" },
  { t: 105, speaker: 'sulla',    text: "Hi John! Let me pull up your account —" },
  { t: 140, speaker: 'sulla',    text: "3 jobs with us. All 5-star reviews." },
  { t: 180, speaker: 'sulla',    text: "Warranty on last month's install is still active." },
  { t: 215, speaker: 'sulla',    text: "I can match their price. $340 instead of $540." },
  { t: 245, speaker: 'customer', text: "wait really?" },
  { t: 265, speaker: 'customer', text: "ok keep it 🙌" },
]

const REVEAL_FRAME = 280

// ═════════════════════════════════════════════════════════
// COMPOSITION
// ═════════════════════════════════════════════════════════

export function Composition({ frame, fps, width, height }) {
  // Background phone — SMALL and dimmed (messages dominate)
  const phoneScale = (width * 0.50) / PHONE_W
  const phoneW = PHONE_W * phoneScale
  const phoneH = PHONE_H * phoneScale
  const phoneLeft = (width - phoneW) / 2
  const phoneTop = (height - phoneH) / 2 + 40

  // Phone entrance
  const phoneOp = anim(frame, 0, 20, 0, 0.18)
  const phoneBlur = anim(frame, 0, 30, 0, 10)

  // Which messages are visible?
  const visibleMessages = MESSAGES.filter(m => frame >= m.t)

  // Stack position — newest messages at bottom, older ones pushed up
  const MAX_VISIBLE = 4
  const bottomY = height * 0.88
  const spacing = 32
  const messageHeight = 200

  // Reveal banner
  const showReveal = frame >= REVEAL_FRAME
  const revealOp = anim(frame, REVEAL_FRAME, REVEAL_FRAME + 15, 0, 1)
  const revealScale = anim(frame, REVEAL_FRAME, REVEAL_FRAME + 20, 0.8, 1, easeOutBack)

  // Push messages up when reveal banner shows
  const revealShift = showReveal ? anim(frame, REVEAL_FRAME, REVEAL_FRAME + 15, 0, 150) : 0

  return (
    <div style={{ width, height, background: '#0d1117', position: 'relative', overflow: 'hidden', fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" }}>

      {/* Ambient background glow */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 50%, rgba(80,150,179,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Dimmed phone in background */}
      <div style={{
        position: 'absolute',
        left: phoneLeft, top: phoneTop,
        width: phoneW, height: phoneH,
        opacity: phoneOp,
        filter: `blur(${phoneBlur}px)`,
        pointerEvents: 'none',
      }}>
        <div style={{
          width: '100%', height: '100%',
          borderRadius: 40 * phoneScale,
          boxShadow: `0 0 0 ${3 * phoneScale}px #1a1e24, 0 0 0 ${5 * phoneScale}px #2a2e34, 0 0 80px rgba(80,150,179,0.2)`,
          background: '#0d1117',
          position: 'relative',
        }}>
          {/* notch */}
          <div style={{
            position: 'absolute', top: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: 120 * phoneScale, height: 30 * phoneScale,
            background: '#000',
            borderRadius: `0 0 ${16 * phoneScale}px ${16 * phoneScale}px`,
          }} />
        </div>
      </div>

      {/* Title at top */}
      <div style={{
        position: 'absolute',
        top: 60, width: '100%', textAlign: 'center',
        opacity: anim(frame, 0, 20, 0, 1),
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 14, fontWeight: 700, color: '#6AB0CC',
          letterSpacing: 6, textTransform: 'uppercase',
          marginBottom: 6,
        }}>
          Customer Retention
        </div>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 52, fontWeight: 900, color: '#e6edf3',
          letterSpacing: -1,
        }}>
          A customer tried to cancel...
        </div>
      </div>

      {/* Chat messages — stacked from bottom up */}
      {visibleMessages.map((msg, idx) => {
        // Calculate stack position (newest at bottom)
        const stackIdx = visibleMessages.length - 1 - idx  // 0 = newest (bottom)

        // Each message slot position
        const slotY = bottomY - (stackIdx * (messageHeight + spacing))

        // Entrance animation: scale + fade + slide up
        const entProg = prog(frame, msg.t, msg.t + 12)
        const entOp = easeOut(entProg)
        const entScale = easeOutBack(Math.min(entProg * 1.1, 1))
        const entY = lerp(40, 0, easeOut(entProg))

        // Older messages fade slightly when new ones come in
        const dimFactor = stackIdx >= MAX_VISIBLE ? 0 : Math.max(0.5, 1 - stackIdx * 0.1)

        // Reveal shift — push messages up when reveal banner shows
        const finalY = slotY + entY - revealShift

        const isCustomer = msg.speaker === 'customer'
        const isSulla = msg.speaker === 'sulla'

        return (
          <div key={idx} style={{
            position: 'absolute',
            left: 0, right: 0,
            top: finalY - messageHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCustomer ? 'flex-end' : 'flex-start',
            padding: '0 40px',
            opacity: entOp * dimFactor,
            transform: `scale(${entScale})`,
            transformOrigin: isCustomer ? 'right center' : 'left center',
          }}>
            {isSulla && (
              <div style={{
                width: 96, height: 96,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #5096B3, #6AB0CC, #8AC4DA)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginRight: 20,
                flexShrink: 0,
                boxShadow: '0 0 30px rgba(106,176,204,0.6), 0 8px 24px rgba(0,0,0,0.5)',
                color: '#fff',
                fontWeight: 800, fontSize: 40,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                S
              </div>
            )}

            <div style={{
              maxWidth: '85%',
              padding: '36px 44px',
              borderRadius: isCustomer ? '36px 36px 12px 36px' : '36px 36px 36px 12px',
              background: isCustomer
                ? 'linear-gradient(135deg, rgba(80,150,179,0.35), rgba(106,176,204,0.25))'
                : 'linear-gradient(135deg, rgba(22,27,34,0.98), rgba(28,33,40,0.98))',
              border: isCustomer
                ? '2px solid rgba(106,176,204,0.5)'
                : '2px solid rgba(106,176,204,0.25)',
              boxShadow: isCustomer
                ? '0 16px 48px rgba(80,150,179,0.35), 0 0 80px rgba(80,150,179,0.2)'
                : '0 16px 48px rgba(0,0,0,0.7), 0 0 60px rgba(106,176,204,0.2)',
              color: '#e6edf3',
              fontSize: 52,
              fontWeight: 600,
              lineHeight: 1.3,
              letterSpacing: -0.8,
              backdropFilter: 'blur(10px)',
            }}>
              {msg.text}
            </div>

            {isCustomer && (
              <div style={{
                width: 96, height: 96,
                borderRadius: '50%',
                background: '#30363d',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginLeft: 20,
                flexShrink: 0,
                color: '#8b949e',
                fontWeight: 800, fontSize: 38,
                fontFamily: "'JetBrains Mono', monospace",
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                J
              </div>
            )}
          </div>
        )
      })}

      {/* Reveal banner at bottom */}
      {showReveal && (
        <div style={{
          position: 'absolute',
          bottom: 80, left: '50%',
          transform: `translateX(-50%) scale(${revealScale})`,
          opacity: revealOp,
          display: 'flex', alignItems: 'center', gap: 20,
          padding: '24px 40px',
          borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(46,160,67,0.2), rgba(63,185,80,0.15))',
          border: '1px solid rgba(46,160,67,0.5)',
          boxShadow: '0 0 60px rgba(46,160,67,0.4), 0 0 120px rgba(46,160,67,0.2)',
        }}>
          <div style={{
            width: 60, height: 60,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2ea043, #3fb950)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, color: '#fff',
            boxShadow: '0 0 24px rgba(63,185,80,0.5)',
          }}>
            ✓
          </div>
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 16, fontWeight: 700, color: '#3fb950',
              letterSpacing: 5, textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              Retention Save
            </div>
            <div style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 68, fontWeight: 900, color: '#e6edf3',
              lineHeight: 1,
            }}>
              $400 saved
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
