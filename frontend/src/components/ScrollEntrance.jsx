import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

/**
 * Scroll entrance — replays on every downward approach, fully static on upward scroll.
 *
 * Rule: an element stays hidden until its FIRST on-screen encounter (whichever
 * direction it enters from); after that it is hidden ONLY while it lies entirely
 * below the viewport.
 * - First encounter -> entrance plays as you watch, even if you arrive via a
 *   mid-page reload / back-navigation that restores scroll past the section.
 *   (Without this, the entrance would fire invisibly while the element sits
 *   above the viewport, leaving it permanently static when you scroll up.)
 * - Scrolling DOWN (after first view) -> its top edge crosses the viewport
 *   bottom -> entrance replays. Every pass.
 * - Scrolling UP (after first view) -> sections above the viewport are always
 *   kept visible, so upward scrolling is completely static (no pops, no late
 *   images). Sections left behind silently re-arm once they fall below the
 *   viewport again.
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
  /**
   * Where (as a fraction of viewport height, from the top) the entrance fires.
   * 1 = the moment the element peeks above the viewport bottom (default).
   * 0.7 = waits until the element is ~30% up the screen — use for tall/centered
   * elements whose trigger would otherwise fire long before they're looked at.
   */
  trigger = 1,
}) {
  const ref = useRef(null)
  const enteredRef = useRef(false)
  const belowRef = useRef(false)   // was seen entirely below the viewport
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const { top, bottom } = el.getBoundingClientRect()
      const line = window.innerHeight * trigger
      if (!enteredRef.current) {
        if (top >= line) {
          // Still entirely below the viewport — note it so a fast-scroll
          // skip can be detected later.
          belowRef.current = true
        } else if (bottom > 0) {
          // First on-screen encounter: fire the moment any part of the
          // element is on screen — entering from below (top crossed the
          // trigger line) or from above (bottom peeks in during an upward
          // scroll / mid-page reload).
          enteredRef.current = true
          setHidden(false)
        } else if (belowRef.current) {
          // Entirely above the viewport before ever being seen, and it was
          // below a moment ago — a fast downward scroll skipped it. Reveal
          // so the content isn't invisible. (The entrance animation played
          // off-screen; the user sees the final visible state.)
          enteredRef.current = true
          setHidden(false)
        }
        // else: mid-page reload with the element above the viewport and
        // never below — keep hidden so the entrance plays when the user
        // scrolls up.
      } else if (top >= line) {
        // Fell back below the viewport — re-arm for the next downward pass.
        setHidden(true)
      } else {
        // Back on screen (or above it): ensure visible. A re-armed element
        // (hidden while below the viewport) must be revealed again the
        // moment it scrolls back into view — otherwise it stays invisible
        // forever. Upward scroll stays static (no re-trigger) since the
        // value is unchanged; downward re-entry replays the entrance.
        setHidden(false)
      }
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
  }, [trigger])

  const Tag = motion[as] || motion.div

  return (
    <Tag
      ref={ref}
      className={className}
      initial={hiddenState}
      animate={hidden ? hiddenState : visibleState}
      transition={{ duration, ease, delay }}
    >
      {children}
    </Tag>
  )
}
