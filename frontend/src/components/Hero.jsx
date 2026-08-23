import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { motion, useInView, useReducedMotion, animate } from 'framer-motion'
import { stats } from '../data/landing'

// Strong ease-out shared by the page's entrances
const EASE_OUT = [0.16, 1, 0.3, 1]

function CountUp({ value, suffix }) {
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
    <span ref={ref} className="font-display text-3xl md:text-4xl text-cream tabular-nums">
      {display.toLocaleString('en-IN')}
      <span className="text-gold-400">{suffix}</span>
    </span>
  )
}

// One masked line of the headline — reveals upward on load
function HeadlineLine({ children, delay }) {
  return (
    <span className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
      <motion.span
        className="block"
        initial={{ y: '110%' }}
        animate={{ y: '0%' }}
        transition={{ duration: 0.7, ease: EASE_OUT, delay }}
      >
        {children}
      </motion.span>
    </span>
  )
}

export default function Hero() {
  return (
    <section className="relative min-h-svh flex flex-col overflow-hidden">
      {/* Full-bleed image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/images/luxury_salon_hero.jpg)' }}
        aria-hidden="true"
      />
      {/* Scrim: heavier at the bottom-left where the type sits */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-emerald-950 via-emerald-950/55 to-emerald-950/30"
        aria-hidden="true"
      />

      {/* Content anchored to the lower-left — editorial, not template-centered */}
      <div className="relative z-10 flex-1 flex items-end">
        <div className="w-full max-w-7xl mx-auto px-6 pb-16 md:pb-24 pt-40">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: 'ease-out', delay: 0.1 }}
            className="text-gold-400 text-xs md:text-sm font-medium tracking-[0.25em] uppercase mb-6"
          >
            Ayra Saloon · Samathanapuram, Tirunelveli
          </motion.p>

          <h1 className="font-display text-cream text-[clamp(2.75rem,8vw,6.5rem)] leading-[1.02] tracking-[-0.02em] max-w-4xl">
            <HeadlineLine delay={0.2}>Modern grooming,</HeadlineLine>
            <HeadlineLine delay={0.32}>
              <span className="italic text-gold-400">honest</span> prices.
            </HeadlineLine>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE_OUT, delay: 0.45 }}
            className="mt-6 max-w-xl text-base md:text-lg leading-relaxed text-cream/80 font-light"
          >
            Tirunelveli's modern unisex saloon — expert stylists, up-to-date
            equipment, and sharp grooming for everyone at prices that make
            sense.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE_OUT, delay: 0.55 }}
            className="mt-10 flex flex-col sm:flex-row gap-4"
          >
            <Link to="/book" className="btn-gold text-base inline-flex items-center justify-center gap-2">
              Book your experience
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <a href="#services" className="btn-outline text-base inline-flex items-center justify-center bg-emerald-950/40 backdrop-blur-sm">
              Explore services
            </a>
          </motion.div>
        </div>
      </div>

      {/* Bottom strip: stats + scroll cue, separated by a hairline */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: 'ease-out', delay: 0.6 }}
        className="relative z-10 border-t border-cream/10"
      >
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-3 gap-6">
          {stats.map(({ value, suffix, label }) => (
            <div key={label}>
              <CountUp value={value} suffix={suffix} />
              <p className="mt-1 text-[11px] md:text-xs uppercase tracking-[0.18em] text-cream/60">
                {label}
              </p>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}
