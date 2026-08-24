import { useRef } from 'react'
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
} from 'framer-motion'

/**
 * Playful-polish hover card — spring lift on hover plus a soft gold glow
 * that trails the pointer.
 *
 * NOTE: deliberately NO 3D rotation here. Animate 3D-transformed ancestors
 * of interactive children and Chrome's hit-testing stops matching the
 * painted pixels — buttons stop receiving clicks. Lift + glow gives the
 * same playful read with bulletproof clicking.
 */
export default function TiltCard({ children, className = '', max = 6 }) {
  const ref = useRef(null)

  const px = useMotionValue(0.5) // pointer position across the card, 0..1
  const py = useMotionValue(0.5)
  const sx = useSpring(px, { stiffness: 140, damping: 22 })
  const sy = useSpring(py, { stiffness: 140, damping: 22 })

  const glowX = useTransform(sx, (v) => `${v * 100}%`)
  const glowY = useTransform(sy, (v) => `${v * 100}%`)
  const glow = useMotionTemplate`radial-gradient(circle at ${glowX} ${glowY}, rgba(201,168,76,0.16), transparent 55%)`

  const handleMove = (e) => {
    // Mouse/pen only — touch drags are scrolling, not glowing
    if (e.pointerType === 'touch' || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    px.set((e.clientX - rect.left) / rect.width)
    py.set((e.clientY - rect.top) / rect.height)
  }

  const handleLeave = () => {
    px.set(0.5)
    py.set(0.5)
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      initial={{ y: 0 }}
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      className={`relative ${className}`}
    >
      {/* Pointer-following gold glow */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-80"
        style={{ background: glow }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  )
}
