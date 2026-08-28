import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowDownUp,
  ArrowRight,
  ChevronDown,
  Clock,
  Crown,
  Droplets,
  Flower2,
  Palette,
  PenTool,
  RotateCcw,
  Scissors,
  Search,
  Sparkles,
  SprayCan,
  X,
} from 'lucide-react'
import client from '../api/client'
import usePageMeta from '../hooks/usePageMeta'
import { WhatsAppIcon } from '../components/WhatsAppFloat'

const EASE_OUT = [0.16, 1, 0.3, 1]

/* Pre-filled WhatsApp enquiry for a specific service (bridal etc.). */
const waEnquire = (service) =>
  'https://wa.me/918270606750?text=' +
  encodeURIComponent(
    `Hi Ayra Saloon! I'm interested in ${service.name} (₹${service.price.toLocaleString('en-IN')}). Please share consultation details.`
  )

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

/* Short tab labels — the full label + blurb show in the context header
   when a tab is active. Same words as the booking page tabs (familiarity). */
const TAB_LABELS = {
  hair: 'Hair',
  colour: 'Colour',
  spa: 'Spa',
  grooming: 'Grooming',
  facial: 'Facial',
  tattoo: 'Tattoo',
  bridal: 'Bridal',
  other: 'Other',
}

function categoryMeta(key) {
  const meta = CATEGORY_META[key]
  if (meta) return meta
  return {
    label: key.charAt(0).toUpperCase() + key.slice(1),
    icon: FALLBACK_ICON,
  }
}

/* Same sort set as the booking page — identical labels, identical order. */
const SORT_OPTIONS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'price_asc', label: 'Price ↑' },
  { id: 'price_desc', label: 'Price ↓' },
  { id: 'name_asc', label: 'Name A–Z' },
  { id: 'duration_asc', label: 'Quickest first' },
]

/* Tabs: All first, known categories in menu order, then any category that
   exists in the data but isn't in CATEGORY_ORDER (auto-discover). */
function buildTabs(services) {
  const tabs = [{ id: 'all', label: 'All' }]
  for (const id of CATEGORY_ORDER) tabs.push({ id, label: TAB_LABELS[id] || categoryMeta(id).label })
  for (const svc of services) {
    const id = svc.category || 'other'
    if (!tabs.some((t) => t.id === id)) tabs.push({ id, label: TAB_LABELS[id] || categoryMeta(id).label })
  }
  return tabs
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: (index % 9) * 0.04 }}
      className="glass-card p-6 flex flex-col"
    >
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-display text-xl text-cream leading-snug">{service.name}</h3>
        <span className="font-display text-xl text-gold-400 whitespace-nowrap">
          ₹{service.price.toLocaleString('en-IN')}
        </span>
      </div>

      {/* Audience + kids chips — who the service is for (locked decision #5). */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {service.audience && (
          <span className="px-2 py-0.5 rounded-full border border-gold-500/25 text-[10px] uppercase tracking-[0.14em] text-cream/60 capitalize">
            {service.audience}
          </span>
        )}
        {service.for_kids && (
          <span className="px-2 py-0.5 rounded-full border border-emerald-500/30 text-[10px] uppercase tracking-[0.14em] text-emerald-300">
            Kids
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-cream/75 leading-relaxed grow">
        {service.description}
      </p>

      <div className="mt-5 pt-4 border-t border-cream/10 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-cream/60 uppercase tracking-wider">
          <Clock className="w-3.5 h-3.5 text-gold-500" aria-hidden="true" />
          {service.duration_mins} min
        </span>
        {service.bookable === false ? (
          <a
            href={waEnquire(service)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline !px-4 !py-2 text-xs inline-flex items-center gap-1.5"
          >
            Enquire
            <WhatsAppIcon className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        ) : (
          <Link
            to={`/book?service=${service.id}`}
            className="btn-gold !px-4 !py-2 text-xs inline-flex items-center gap-1.5"
          >
            Book this
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        )}
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

  /* Toolbar state — same three controls as the booking page's service list. */
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [sortId, setSortId] = useState('recommended')
  const [sortOpen, setSortOpen] = useState(false)

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

  const list = Array.isArray(services) ? services : []

  const tabs = useMemo(() => buildTabs(list), [list])

  /* Per-tab counts, computed on the unfiltered list so numbers stay stable
     while searching. Empty categories hide themselves (booking-page rule). */
  const tabCounts = useMemo(() => {
    const counts = { all: list.length }
    for (const t of tabs) {
      if (t.id === 'all') continue
      counts[t.id] = list.filter((s) => (s.category || 'other') === t.id).length
    }
    return counts
  }, [list, tabs])

  /* Filter pipeline: category tab → search query → sort. Same shape as the
     booking page, minus the audience gating (the public menu shows everything). */
  const filtered = useMemo(() => {
    let out = list
    if (category !== 'all') out = out.filter((s) => (s.category || 'other') === category)
    const q = query.trim().toLowerCase()
    if (q) {
      out = out.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q)
      )
    }
    const sorted = [...out]
    if (sortId === 'recommended') sorted.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    if (sortId === 'price_asc') sorted.sort((a, b) => a.price - b.price)
    if (sortId === 'price_desc') sorted.sort((a, b) => b.price - a.price)
    if (sortId === 'name_asc') sorted.sort((a, b) => a.name.localeCompare(b.name))
    if (sortId === 'duration_asc') sorted.sort((a, b) => (a.duration_mins || 0) - (b.duration_mins || 0))
    return sorted
  }, [list, category, query, sortId])

  const hasFilters = query.trim() !== '' || category !== 'all' || sortId !== 'recommended'
  const clearFilters = () => {
    setQuery('')
    setCategory('all')
    setSortId('recommended')
  }

  /* Sort dropdown closes on outside click. */
  const sortRef = useRef(null)
  useEffect(() => {
    if (!sortOpen) return
    const onClick = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [sortOpen])

  const activeMeta = category !== 'all' ? categoryMeta(category) : null
  const ActiveIcon = activeMeta ? activeMeta.icon : null

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

        {/* Sticky toolbar — filter tabs + search + sort. Same controls, same
            order, same look as the booking page's service list. */}
        {!error && services !== null && (
          <div
            className="sticky top-[72px] z-30 -mx-6 px-6 py-3 mt-10 bg-emerald-950/85 backdrop-blur-md border-y border-cream/10 space-y-2.5"
          >
            <div className="category-tabs-scroll" role="tablist" aria-label="Filter by category">
              {tabs.map((t) => {
                const count = tabCounts[t.id] || 0
                if (t.id !== 'all' && count === 0) return null
                const isActive = category === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setCategory(t.id)}
                    className={`category-tab ${isActive ? 'active' : ''}`}
                  >
                    {t.label}
                    <span className={`text-[10px] ${isActive ? 'text-emerald-950/70' : 'text-emerald-500'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search services…"
                  className="search-input"
                  aria-label="Search services"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="search-clear absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 hover:text-gold-400 transition-colors duration-200"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="relative" ref={sortRef}>
                <button
                  type="button"
                  onClick={() => setSortOpen((o) => !o)}
                  className="sort-trigger"
                  aria-haspopup="listbox"
                  aria-expanded={sortOpen}
                >
                  <ArrowDownUp className="w-3.5 h-3.5" />
                  {SORT_OPTIONS.find((s) => s.id === sortId)?.label}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${sortOpen ? 'rotate-180' : ''}`} />
                </button>
                {sortOpen && (
                  <div className="menu-pop absolute right-0 top-full mt-1 z-30 min-w-[160px] rounded-xl border border-emerald-700 bg-emerald-950/95 backdrop-blur-md shadow-xl shadow-black/40 py-1.5">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSortId(opt.id)
                          setSortOpen(false)
                        }}
                        className={`w-full text-left px-3.5 py-2 text-sm transition-colors duration-150 ${
                          sortId === opt.id
                            ? 'text-gold-400 bg-emerald-900/60'
                            : 'text-cream/80 hover:bg-emerald-900/40 hover:text-cream'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
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

        {/* Category context — icon, full name and blurb appear only when a
            specific tab is active, so "All" stays chrome-free. */}
        {!error && activeMeta && filtered.length > 0 && (
          <motion.div
            key={category}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="mt-10 mb-7 flex items-start gap-4"
          >
            <div className="shrink-0 w-11 h-11 rounded-xl bg-gold-500/10 border border-gold-500/25 flex items-center justify-center">
              <ActiveIcon className="w-5 h-5 text-gold-400" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-display text-2xl md:text-3xl text-cream">{activeMeta.label}</h2>
              {activeMeta.blurb && (
                <p className="mt-1 text-sm text-cream/65 max-w-xl">{activeMeta.blurb}</p>
              )}
            </div>
          </motion.div>
        )}

        {/* Result count — quiet status line, updates with every control. */}
        {!error && services !== null && (
          <p className="mt-8 text-xs uppercase tracking-[0.15em] text-cream/50" aria-live="polite">
            Showing {filtered.length} of {list.length} services
          </p>
        )}

        {/* Grid */}
        {!error && filtered.length > 0 && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((svc, i) => (
              <ServiceCard key={svc.id} service={svc} index={i} />
            ))}
          </div>
        )}

        {/* Empty state — always offer the way back (forgiveness). */}
        {!error && services !== null && filtered.length === 0 && (
          <div className="mt-4 glass-card p-12 text-center max-w-lg mx-auto">
            <p className="font-display text-xl text-cream mb-2">
              {query.trim()
                ? <>Nothing matches “<span className="text-gold-400">{query.trim()}</span>”.</>
                : 'No services in this category yet.'}
            </p>
            <p className="text-cream/65 text-sm mb-6">
              Try a different word, or clear the filters to see the full menu.
            </p>
            {hasFilters && (
              <button onClick={clearFilters} className="btn-outline inline-flex items-center gap-2">
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Bridal disclosure — lives on the Bridal tab, next to what it describes. */}
        {!error && category === 'bridal' && filtered.length > 0 && (
          <div className="mt-8 glass-card p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-11 h-11 rounded-xl bg-gold-500/10 border border-gold-500/25 flex items-center justify-center">
                <Crown className="w-5 h-5 text-gold-400" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-xl text-cream">
                  Bridal & Groom looks, arranged personally
                </h3>
                <p className="mt-2 text-sm text-cream/70 leading-relaxed">
                  {CATEGORY_META.bridal.disclosure}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href={waEnquire({ name: 'Bridal & Groom Makeup', price: 2500 })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-gold !px-5 !py-2.5 text-xs inline-flex items-center gap-2"
                  >
                    <WhatsAppIcon className="w-4 h-4" aria-hidden="true" />
                    WhatsApp us
                  </a>
                  <a
                    href="tel:+918270606750"
                    className="btn-outline !px-5 !py-2.5 text-xs inline-flex items-center gap-2"
                  >
                    Call +91 82706 06750
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom CTA */}
        {!error && list.length > 0 && (
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
