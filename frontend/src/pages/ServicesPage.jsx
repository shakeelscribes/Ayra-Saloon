import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Clock,
  Crown,
  Droplets,
  Flower2,
  Palette,
  PenTool,
  RotateCcw,
  Scissors,
  Sparkles,
  SprayCan,
} from 'lucide-react'
import client from '../api/client'
import usePageMeta from '../hooks/usePageMeta'

const EASE_OUT = [0.16, 1, 0.3, 1]

/* Known categories — anything else in the DB auto-discovers with defaults. */
const CATEGORY_META = {
  hair: {
    label: 'Haircuts & Styling',
    icon: Scissors,
    blurb: 'Cuts and styling for men, women and kids — shaped to suit you.',
  },
  colour: {
    label: 'Hair Colour',
    icon: Palette,
    blurb: 'Global colour, fashion shades, streaks and root touch-ups.',
  },
  spa: {
    label: 'Hair Spa & Treatments',
    icon: Droplets,
    blurb: 'Spa rituals, keratin, botox, smoothening and scalp therapies.',
  },
  grooming: {
    label: 'Shave · Beard · Massage',
    icon: SprayCan,
    blurb: 'Royal shaves, beard sculpting and relaxing massages.',
  },
  facial: {
    label: 'Facials & Skin Care',
    icon: Flower2,
    blurb: 'Glow facials, tan removal and clean-ups for every skin type.',
  },
  tattoo: {
    label: 'Tattoos & Piercing',
    icon: PenTool,
    blurb: 'Custom ink by our resident artist — sterile, sealed, safe.',
  },
  bridal: {
    label: 'Bridal & Party Makeup',
    icon: Crown,
    blurb: 'HD, party and wedding looks by partner artists — consultation first.',
    disclosure:
      'Bridal & makeup assignments are handled by our trusted partner artists, booked through a consultation with our team. Travel allowance applies for on-location bookings.',
  },
}

const FALLBACK_ICON = Sparkles
const CATEGORY_ORDER = ['hair', 'colour', 'spa', 'grooming', 'facial', 'tattoo', 'bridal']

function categoryMeta(key) {
  const meta = CATEGORY_META[key]
  if (meta) return meta
  return {
    label: key.charAt(0).toUpperCase() + key.slice(1),
    icon: FALLBACK_ICON,
  }
}

/* Group services by category, known order first, extras after. */
function groupByCategory(services) {
  const groups = new Map()
  for (const svc of services) {
    const key = svc.category || 'other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(svc)
  }
  return [...groups.entries()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a[0])
    const ib = CATEGORY_ORDER.indexOf(b[0])
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="glass-card p-6 h-44 animate-pulse flex flex-col justify-between"
          aria-hidden="true"
        >
          <div className="h-4 w-2/3 bg-emerald-800/60 rounded" />
          <div className="space-y-2">
            <div className="h-3 w-full bg-emerald-800/40 rounded" />
            <div className="h-3 w-5/6 bg-emerald-800/40 rounded" />
          </div>
          <div className="h-8 w-28 bg-emerald-800/60 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

function ServiceCard({ service, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: (index % 6) * 0.05 }}
      className="glass-card p-6 flex flex-col"
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-display text-xl text-cream leading-snug">{service.name}</h3>
        <span className="font-display text-xl text-gold-400 whitespace-nowrap">
          ₹{service.price.toLocaleString('en-IN')}
        </span>
      </div>

      <p className="mt-3 text-sm text-cream/75 leading-relaxed grow">
        {service.description}
      </p>

      <div className="mt-5 pt-4 border-t border-cream/10 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-cream/60 uppercase tracking-wider">
          <Clock className="w-3.5 h-3.5 text-gold-500" aria-hidden="true" />
          {service.duration_mins} min
        </span>
        <Link
          to={`/book?service=${service.id}`}
          className="btn-gold !px-4 !py-2 text-xs inline-flex items-center gap-1.5"
        >
          Book this
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>
    </motion.div>
  )
}

export default function ServicesPage() {
  usePageMeta({
    title: 'Salon Services & Pricing | Ayra Saloon Tirunelveli',
    description:
      'Full service menu of Ayra Saloon, Tirunelveli — haircuts, colour, keratin, beard styling, bridal makeup and tattoos with transparent pricing. Book online in a minute.',
  })

  const [services, setServices] = useState(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setError(false)
    setServices(null)
    client
      .get('/services/')
      .then(({ data }) => setServices(data))
      .catch(() => setError(true))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const groups = useMemo(
    () => (Array.isArray(services) ? groupByCategory(services) : []),
    [services]
  )

  return (
    <div className="min-h-screen pt-28 pb-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          className="max-w-2xl"
        >
          <p className="text-gold-400 text-xs font-medium tracking-[0.25em] uppercase mb-5">
            Our Services
          </p>
          <h1 className="font-display text-[clamp(2.25rem,5vw,4rem)] leading-[1.06] tracking-[-0.02em] text-cream">
            Every service, one <span className="italic text-gold-400">honest</span> price list.
          </h1>
          <p className="mt-5 text-base md:text-[17px] text-cream/75 leading-relaxed max-w-xl">
            Browse the full menu below — what you see here is exactly what gets
            booked at the counter. Pick a service, tap book, done.
          </p>
        </motion.header>

        {/* Anchor chips */}
        {groups.length > 1 && (
          <nav
            aria-label="Service categories"
            className="sticky top-[72px] z-30 -mx-6 px-6 py-3 mt-10 bg-emerald-950/85 backdrop-blur-md border-y border-cream/10 flex gap-2 overflow-x-auto hide-scrollbar"
          >
            {groups.map(([key]) => (
              <a
                key={key}
                href={`#cat-${key}`}
                className="shrink-0 px-4 py-1.5 rounded-full border border-gold-500/25 text-xs uppercase tracking-[0.15em] text-cream/75 hover:text-emerald-950 hover:bg-gold-400 hover:border-gold-400 transition-colors duration-200"
              >
                {categoryMeta(key).label}
              </a>
            ))}
          </nav>
        )}

        {/* Body */}
        {error && (
          <div className="mt-16 glass-card p-12 text-center max-w-lg mx-auto">
            <p className="font-display text-2xl text-cream mb-3">Menu temporarily unavailable</p>
            <p className="text-cream/70 text-sm mb-6 leading-relaxed">
              We could not reach the kitchen… er, the server. Check your
              connection or try again in a moment.
            </p>
            <button onClick={load} className="btn-outline inline-flex items-center gap-2">
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        {!error && services === null && (
          <div className="mt-14">
            <SkeletonGrid />
          </div>
        )}

        {!error && groups.map(([key, items]) => {
          const meta = categoryMeta(key)
          const Icon = meta.icon
          return (
            <section key={key} id={`cat-${key}`} className="scroll-mt-36 mt-16 first:mt-14">
              {/* Group header */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, ease: EASE_OUT }}
                className="flex items-end justify-between gap-6 mb-7"
              >
                <div>
                  <h2 className="font-display text-3xl md:text-4xl text-cream flex items-center gap-3">
                    <Icon className="w-6 h-6 text-gold-400 shrink-0" aria-hidden="true" />
                    {meta.label}
                  </h2>
                  {meta.blurb && (
                    <p className="mt-2 text-sm text-cream/65 max-w-xl">{meta.blurb}</p>
                  )}
                </div>
                <span className="hidden sm:block font-display text-5xl text-gold-500/20 leading-none" aria-hidden="true">
                  {String(items.length).padStart(2, '0')}
                </span>
              </motion.div>

              {/* Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((svc, i) => (
                  <ServiceCard key={svc.id} service={svc} index={i} />
                ))}
              </div>

              {meta.disclosure && (
                <p className="mt-5 text-sm text-cream/55 italic">{meta.disclosure}</p>
              )}
            </section>
          )
        })}

        {/* Bottom CTA */}
        {!error && groups.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
            className="mt-20 glass-card p-10 text-center"
          >
            <p className="font-display text-2xl md:text-3xl text-cream">
              Know what you want?
            </p>
            <p className="mt-2 text-cream/70 text-sm md:text-base">
              The chair is one click away — booking takes under a minute.
            </p>
            <Link to="/book" className="btn-gold mt-6 inline-flex items-center gap-2">
              Book an appointment
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  )
}
