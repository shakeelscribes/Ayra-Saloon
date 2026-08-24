import { useEffect, useRef, useState } from 'react'
import { animate, useInView, useReducedMotion } from 'framer-motion'

const EASE_OUT = [0.16, 1, 0.3, 1]

/**
 * Animated number counter — counts up whenever it enters the viewport
 * and re-counts on every return. Honors prefers-reduced-motion by
 * snapping straight to the value.
 */
export default function StatCounter({ value, suffix = '', className = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { margin: '-40px' })
  const reduceMotion = useReducedMotion()
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    if (reduceMotion) {
      setDisplay(value)
      return
    }
    const controls = animate(0, value, {
      duration: 1.1,
      ease: EASE_OUT,
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [inView, value, reduceMotion])

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {display.toLocaleString('en-IN')}
      <span className="text-gold-400">{suffix}</span>
    </span>
  )
}
