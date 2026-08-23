import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

/**
 * Scroll entrance — replays on every downward approach, fully static on upward scroll.
 *
 * Rule: an element is hidden ONLY while it lies entirely below the viewport.
 * - Scrolling DOWN -> its top edge crosses the viewport bottom -> entrance plays. Every pass.
 * - Scrolling UP   -> sections above the viewport are always kept visible, so upward
 *   scrolling is completely static (no pops, no late images). Sections left behind
 *   silently re-arm once they fall below the viewport again.
 */
export default function ScrollEntrance({
  children,
  as = 'div',
  className,
  duration = 0.6,
  delay = 0,
  ease = [0.16, 1, 0.3, 1],
  hiddenState = { opacity: 0, y: 24 },
  visibleState = { opacity: 1, y: 0 },
}) {
  const ref = useRef(null)
  const [belowViewport, setBelowViewport] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      setBelowViewport(el.getBoundingClientRect().top >= window.innerHeight)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const Tag = motion[as] || motion.div

  return (
    <Tag
      ref={ref}
      className={className}
      initial={hiddenState}
      animate={belowViewport ? hiddenState : visibleState}
      transition={{ duration, ease, delay }}
    >
      {children}
    </Tag>
  )
}
