import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scissors, User, Calendar, Clock, CheckCircle2, ChevronRight, ChevronLeft,
  ArrowRight, Sparkles, Crown, Palette, Droplets, PenTool, SprayCan, Flower2,
  Plus, AlertCircle, UserPlus, Search, X, ArrowDownUp, ChevronDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

const EASE_OUT = [0.16, 1, 0.3, 1]

/* Mirrors the backend slot grid: hourly, 10:00–20:00 */
const ALL_SLOTS = Array.from({ length: 11 }, (_, i) => `${String(10 + i).padStart(2, '0')}:00`)

const categoryIcons = {
  hair: Scissors, grooming: SprayCan, bridal: Crown,
  colour: Palette, spa: Droplets, facial: Flower2,
  tattoo: PenTool, general: Sparkles,
}

function StepIndicator({ labels, current }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10 flex-wrap">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`step-dot ${i < current ? 'completed' : i === current ? 'active' : 'inactive'}`}>
              {i < current ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${i === current ? 'text-gold-400' : 'text-emerald-300'}`}>
              {label}
            </span>
          </div>
          {i < labels.length - 1 && (
            <div className={`w-12 sm:w-16 h-px mx-2 mb-4 transition-colors duration-300 ${i < current ? 'bg-gold-500' : 'bg-emerald-800'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

const fmtTime = (t) => {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/* ── Duration-based slot math (mirrors backend/routes/availability.py) ──
   Services run back-to-back from the chosen hour; the visit books whole
   hourly slots, but the first 30 min of overflow past each hour boundary
   is absorbed — 140 min → 2 slots, 150 → 2, 151 → 3. */
const GRACE_MINS = 30
const toMins = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
const minsToHm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
const totalDuration = (list) => list.reduce((s, x) => s + (x.duration_mins || 60), 0)
const slotsNeeded = (mins) => Math.max(1, Math.ceil((mins - GRACE_MINS) / 60))
const isFree = (busy, startMin, endMin) =>
  !(busy || []).some((b) => startMin < toMins(b.end) && toMins(b.start) < endMin)
const fmtDur = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60
  if (!m) return `${h} hr${h !== 1 ? 's' : ''}`
  if (!h) return `${m} min`
  return `${h} hr${h !== 1 ? 's' : ''} ${m} min`
}

/* Haptic feedback — Apple principle: causality + harmony (fire on the same frame
   as the visual commit). Reserve strength for meaningful commits. */
const tap = (ms = 5) => {
  try { if ('vibrate' in navigator) navigator.vibrate(ms) } catch {}
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/* Hero card — used for the For Whom and Gender pickers. Press feedback on
   pointer-down (Apple: kill latency). No "selected" state — the user must
   make a deliberate choice; nothing should look pre-picked because customers
   book for themselves or for others roughly 50/50 and a default would bias
   them. Plain <button> (not motion.button) so it stays rock-solid. */
function HeroCard({ icon: Icon, title, subtitle, onSelect, delay = 0, large = false }) {
  return (
    <button
      type="button"
      onPointerDown={() => tap(5)}
      onClick={onSelect}
      style={{
        animation: `hero-card-in 280ms ${EASE_OUT} both`,
        animationDelay: `${delay * 1000}ms`,
      }}
      className={`tap-target group relative w-full text-left rounded-2xl border border-emerald-700/60 glass-card hover:border-gold-500/60
        ${large ? 'p-7 sm:p-8' : 'p-5 sm:p-6'}`}
    >
      <div className="flex items-center gap-4">
        <div className={`shrink-0 ${large ? 'w-14 h-14 sm:w-16 sm:h-16' : 'w-12 h-12'} rounded-2xl flex items-center justify-center
          bg-emerald-900/60 text-gold-400 border border-gold-500/20`}>
          <Icon className={large ? 'w-7 h-7 sm:w-8 sm:h-8' : 'w-6 h-6'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-cream font-display ${large ? 'text-2xl' : 'text-lg'} tracking-tight`}>{title}</p>
          {subtitle && (
            <p className="text-emerald-300 text-sm mt-1 line-clamp-2">{subtitle}</p>
          )}
        </div>
        <ChevronRight className="w-5 h-5 shrink-0 chevron-slide text-emerald-500 group-hover:text-gold-400" />
      </div>
    </button>
  )
}

/* Service row — single tappable service in the menu list. Plain <button> with
   CSS tap-target. Renders an optional Boy/Girl chip when the service is
   tagged with kid_gender (the two Kids Hair Cut entries). */
function ServiceRow({ svc, isSelected, onToggle, Icon }) {
  return (
    <button
      type="button"
      onPointerDown={() => tap(5)}
      onClick={onToggle}
      className={`service-row ${isSelected ? 'selected' : ''}`}
    >
      <div className="icon-chip shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="name">{svc.name}</span>
          {/* Unisex tag — the only audience worth showing here, since the
              list is already filtered to the chosen audience. Skipped on
              kid rows (For boys / For girls sections label those). */}
          {svc.audience === 'unisex' && !svc.kid_gender && (
            <span className="audience-chip">Unisex</span>
          )}
          {svc.kid_gender && (
            <span className={`gender-chip ${svc.kid_gender}`}>{svc.kid_gender}</span>
          )}
        </div>
        {svc.description && (
          <p className="desc">{svc.description}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="meta">₹{svc.price}</div>
        <div className="meta-sub">{svc.duration_mins} min</div>
      </div>
    </button>
  )
}

/* Service list — filter + search + sort.
 *
 *   ┌─ Sticky header ─────────────────────────────────────┐
 *   │ Category tabs (horizontal scroll, snap-x)          │
 *   │ Search input (live filter on name + description)    │
 *   │ Sort trigger (Recommended / Price ↑ / Price ↓ /    │
 *   │               Quickest first)                       │
 *   └─────────────────────────────────────────────────────┘
 *   List of ServiceRow tiles (stagger entrance, GPU-only).
 *   Sticky running-total pill at the bottom of the list.
 *
 * The kids flow stays special: it shows two sub-sections
 * (For boys / For girls) and ignores the category tabs. */
const SORT_OPTIONS = [
  { id: 'recommended',  label: 'Recommended'    },
  { id: 'price_asc',    label: 'Price ↑'        },
  { id: 'price_desc',   label: 'Price ↓'        },
  { id: 'name_asc',     label: 'Name A–Z'       },
  { id: 'duration_asc', label: 'Quickest first' },
]

/* IST "today" (optionally offset by days). toISOString() is UTC — between
   00:00 and 05:30 IST it still yields yesterday, which would default the
   date picker and the min clamp to the past. Shift to IST wall-clock first. */
const istDate = (days = 0) => {
  const now = new Date()
  return new Date(now.getTime() + (330 + now.getTimezoneOffset() + days * 1440) * 60000)
    .toISOString().split('T')[0]
}

const CATEGORY_TABS = [
  { id: 'all',     label: 'All'      },
  { id: 'hair',     label: 'Hair'     },
  { id: 'grooming', label: 'Grooming' },
  { id: 'colour',   label: 'Colour'   },
  { id: 'spa',      label: 'Spa'      },
  { id: 'facial',   label: 'Facial'   },
  { id: 'bridal',   label: 'Bridal'   },
  { id: 'tattoo',   label: 'Tattoo'   },
  { id: 'general',  label: 'Other'    },
]

function ServiceList({ services, picked, picks, audience, forKids, setPicked, setPicks }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [sortId, setSortId] = useState('recommended')
  const [sortOpen, setSortOpen] = useState(false)

  const toggle = (svc) => {
    // Functional setter form so two rapid taps don't lose the toggle.
    setPicked((prev) => {
      const idx = prev.findIndex((p) => p.id === svc.id)
      if (idx >= 0) {
        setPicks((pk) => { const n = { ...pk }; delete n[svc.id]; return n })
        return prev.filter((x) => x.id !== svc.id)
      }
      setPicks((pk) => ({ ...pk, [svc.id]: pk[svc.id] || 'any' }))
      tap(8)
      return [...prev, svc]
    })
  }

  // Filter pipeline: audience/for_kids first (hard rules), then category
  // tab, then search query, then sort. useMemo so the filtered list doesn't
  // re-compute on unrelated re-renders.
  const filtered = useMemo(() => {
    let list = services
    if (forKids) {
      list = list.filter((s) => s.for_kids)
    } else {
      list = list.filter((svc) => {
        const audienceMismatch = audience && svc.audience !== 'unisex' && svc.audience !== audience
        const kidsLeak = svc.for_kids
        return !audienceMismatch && !kidsLeak
      })
      if (category !== 'all') list = list.filter((s) => s.category === category)
    }
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
      )
    }
    const sorted = [...list]
    // "Recommended" = popularity (most-booked first). JS sort is stable, so
    // ties keep the catalog order. popularity comes from the backend catalog.
    if (sortId === 'recommended')  sorted.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    if (sortId === 'price_asc')    sorted.sort((a, b) => a.price - b.price)
    if (sortId === 'price_desc')   sorted.sort((a, b) => b.price - a.price)
    if (sortId === 'name_asc')     sorted.sort((a, b) => a.name.localeCompare(b.name))
    if (sortId === 'duration_asc') sorted.sort((a, b) => (a.duration_mins || 0) - (b.duration_mins || 0))
    return sorted
  }, [services, forKids, audience, category, query, sortId])

  // Per-tab counts so the user can see how many services live in each
  // category before tapping. Only relevant for the adult flow.
  const tabCounts = useMemo(() => {
    if (forKids) return null
    const base = services.filter((svc) => {
      const audienceMismatch = audience && svc.audience !== 'unisex' && svc.audience !== audience
      const kidsLeak = svc.for_kids
      return !audienceMismatch && !kidsLeak
    })
    const counts = { all: base.length }
    for (const t of CATEGORY_TABS) {
      if (t.id === 'all') continue
      counts[t.id] = base.filter((s) => s.category === t.id).length
    }
    return counts
  }, [services, forKids, audience])

  // Sort dropdown closes on outside click — wired with a ref + listener.
  const sortRef = useRef(null)
  useEffect(() => {
    if (!sortOpen) return
    const onClick = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [sortOpen])

  if (forKids) {
    // Kids flow: two sub-sections, no category tabs.
    const boys  = filtered.filter((s) => s.kid_gender === 'boy')
    const girls = filtered.filter((s) => s.kid_gender === 'girl')
    const renderSection = (title, items, accent) => items.length === 0 ? null : (
      <div key={title} className="mb-5 last:mb-0">
        <div className="flex items-center gap-2 mb-2.5 px-1">
          <span className={`text-[11px] uppercase tracking-widest font-semibold ${accent}`}>{title}</span>
          <span className="text-emerald-500 text-xs">{items.length}</span>
        </div>
        <div className="space-y-2.5">
          {items.map((svc) => {
            const Icon = categoryIcons[svc.category] || Sparkles
            const isSelected = picked.some((p) => p.id === svc.id)
            return <ServiceRow key={svc.id} svc={svc} isSelected={isSelected} onToggle={() => toggle(svc)} Icon={Icon} />
          })}
        </div>
      </div>
    )
    return (
      <div>
        <div className="services-sticky-header">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search kids services…"
              className="search-input"
              aria-label="Search services"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                onPointerDown={() => tap(4)}
                className="search-clear absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 hover:text-gold-400 transition-colors duration-200"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {(boys.length === 0 && girls.length === 0) ? (
          <p className="text-emerald-300 text-center py-10 text-sm">No services match your search.</p>
        ) : (
          <div className="space-y-2 pb-3">
            {renderSection('For boys', boys, 'text-sky-300')}
            {renderSection('For girls', girls, 'text-pink-300')}
          </div>
        )}
        <RunningTotalBar picked={picked} />
      </div>
    )
  }

  // Adult flow: category tabs + search + sort + flat list.
  return (
    <div>
      <div className="services-sticky-header space-y-2.5">
        <div className="category-tabs-scroll">
          {CATEGORY_TABS.map((t) => {
            const count = tabCounts ? tabCounts[t.id] : 0
            if (t.id !== 'all' && count === 0) return null
            const isActive = category === t.id
            return (
              <button
                key={t.id}
                type="button"
                onPointerDown={() => tap(4)}
                onClick={() => { tap(6); setCategory(t.id) }}
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
                onPointerDown={() => tap(4)}
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
              onPointerDown={() => tap(4)}
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
                    onClick={() => { setSortId(opt.id); setSortOpen(false); tap(6) }}
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

      {filtered.length === 0 ? (
        <p className="text-emerald-300 text-center py-10 text-sm">
          {query
            ? <>No services match "<span className="text-gold-400">{query}</span>".</>
            : 'No services in this category yet.'}
        </p>
      ) : (
        <div className="space-y-2.5 pb-3">
          {filtered.map((svc) => {
            const Icon = categoryIcons[svc.category] || Sparkles
            const isSelected = picked.some((p) => p.id === svc.id)
            return <ServiceRow key={svc.id} svc={svc} isSelected={isSelected} onToggle={() => toggle(svc)} Icon={Icon} />
          })}
        </div>
      )}

      <RunningTotalBar picked={picked} />
    </div>
  )
}

/* Sticky running-total pill at the bottom of the list. Slides in when the
   first service is picked, stays visible while the list scrolls. */
function RunningTotalBar({ picked }) {
  const total = picked.reduce((sum, p) => sum + (p.price || 0), 0)
  const mins  = picked.reduce((sum, p) => sum + (p.duration_mins || 0), 0)
  const hrs   = Math.max(1, Math.round(mins / 60))
  return (
    <div className={`running-total ${picked.length > 0 ? 'shown' : 'enter'}`}>
      <span className="text-cream">
        {picked.length} service{picked.length > 1 ? 's' : ''}
      </span>
      <span className="w-px h-4 bg-emerald-700" aria-hidden="true" />
      <span className="text-emerald-300">~{hrs}h</span>
      <span className="w-px h-4 bg-emerald-700" aria-hidden="true" />
      <span className="text-gold-400 font-semibold">₹{total.toLocaleString('en-IN')}</span>
    </div>
  )
}

/* ── Multi-service booking orchestrator ──────────────────────────────────── */
export default function BookingComponent() {
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  /* ── Catalog data ── */
  const [services, setServices] = useState([])
  const [stylists, setStylists] = useState([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)

  useEffect(() => {
    Promise.all([client.get('/services/'), client.get('/stylists/')])
      .then(([s, st]) => {
        // Enquiry-only services (bridal — partner artists) never enter the
        // booking flow. Also neutralises old /book?service=<bridal-id>
        // deep links: the preselect can't find the ID, so it's dropped.
        setServices(s.data.filter((x) => x.bookable !== false))
        setStylists(st.data)
      })
      .catch(() => toast.error('Could not load the menu'))
      .finally(() => setLoadingCatalog(false))
  }, [])

  /* ── Flow state ── */
  // Apple-style: the first step is a hero question — "Myself or someone else?"
  // If the user picks "Myself" and we already have their gender on file, the
  // Gender step is skipped and we land directly on Services.
  const [forWhom, setForWhom] = useState(null)        // 'myself' | 'someone_else' | null
  const [step, setStep] = useState(0)
  const [audience, setAudience] = useState(null)   // men | women | null(unisex/kids) — no default; user must choose
  const [forKids, setForKids] = useState(false)

  const [picked, setPicked] = useState([])        // ordered service objects
  const [picks, setPicks] = useState({})          // serviceId -> stylistId | 'any'

  const [date, setDate] = useState(istDate(1))
  const [startTime, setStartTime] = useState(null)
  const [availMap, setAvailMap] = useState({})    // stylistId -> busy intervals [{start, end}]
  const [loadingSlots, setLoadingSlots] = useState(false)

  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  /* ── Deep-link preselect (?service=) ── */
  const deepLinkUsed = useRef(false)
  useEffect(() => {
    const sid = searchParams.get('service')
    if (sid && !deepLinkUsed.current) {
      deepLinkUsed.current = true
      setPicked((prev) => {
        if (prev.some((p) => String(p.id) === sid)) return prev
        const found = services.find((x) => String(x.id) === sid)
        return found ? [...prev, found] : prev
      })
    }
  }, [searchParams, services])

  /* ── Draft persistence (sessionStorage) ── */
  const DRAFT_KEY = 'booking_draft'
  const draftHydrated = useRef(false)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw)
      if (d.forWhom) setForWhom(d.forWhom)
      if (d.audience) setAudience(d.audience)
      if (d.forKids) setForKids(!!d.forKids)
      if (Array.isArray(d.pickedIds) && d.pickedIds.length) {
        setPicked((prev) => {
          if (prev.length) return prev
          const byId = new Map(services.map((s) => [String(s.id), s]))
          return d.pickedIds.map((id) => byId.get(String(id))).filter(Boolean)
        })
      }
      if (d.picks && typeof d.picks === 'object') setPicks((prev) => ({ ...d.picks, ...prev }))
      // Clamp stale drafts: a date restored from a previous session can be in
      // the past (or predate a catalog change). Past dates are never bookable.
      const today = istDate(0)
      if (d.date) setDate(d.date >= today ? d.date : istDate(1))
      if (d.startTime && (!d.date || d.date >= today)) setStartTime(d.startTime)
      if (d.notes) setNotes(d.notes)
      if (typeof d.step === 'number' && d.step >= 0) setStep(d.step)
    } catch { /* ignore corrupt draft */ }
    finally { draftHydrated.current = true }
  }, [services])

  useEffect(() => {
    if (!draftHydrated.current) return
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        forWhom, audience, forKids,
        pickedIds: picked.map((p) => p.id),
        picks, date, startTime, notes, step,
      }))
    } catch { /* quota or private mode — ignore */ }
  }, [forWhom, audience, forKids, picked, picks, date, startTime, notes, step])

  /* ── Audience switches prune the cart ──
     Picking a Women's service, going back, and switching to Men must not
     carry the mismatched service into Schedule — the backend would 409 the
     whole booking at submit. Mirror the Services list filter exactly. */
  useEffect(() => {
    if (!picked.length) return
    const keep = picked.filter((svc) => {
      if (forKids) return !!svc.for_kids
      const mismatch = audience && svc.audience !== 'unisex' && svc.audience !== audience
      return !mismatch && !svc.for_kids
    })
    if (keep.length === picked.length) return
    const removed = new Set(
      picked.filter((s) => !keep.some((k) => k.id === s.id)).map((s) => String(s.id))
    )
    setPicked(keep)
    setPicks((pk) => Object.fromEntries(Object.entries(pk).filter(([sid]) => !removed.has(sid))))
  }, [audience, forKids, picked])

  /* ── Availability for every involved stylist ── */
  const involvedStylistIds = useMemo(() => {
    const ids = new Set()
    for (const p of picked) {
      const pick = picks[p.id]
      if (pick && pick !== 'any') { ids.add(pick); continue }
      for (const s of stylists) {
        if ((s.categories || []).includes(p.category)) ids.add(s.id)
      }
    }
    return [...ids]
  }, [picked, picks, stylists])

  useEffect(() => {
    if (!date || involvedStylistIds.length === 0) { setAvailMap({}); return }
    const controller = new AbortController()
    setLoadingSlots(true)
    Promise.all(
      involvedStylistIds.map((id) =>
        client.get(`/availability/?stylist_id=${id}&date=${date}`, {
          signal: controller.signal,
        }).then((r) => [id, r.data.busy || []])
          .catch(() => [id, []])
      )
    ).then((pairs) => {
      if (controller.signal.aborted) return
      setAvailMap(Object.fromEntries(pairs))
    }).finally(() => { if (!controller.signal.aborted) setLoadingSlots(false) })
    return () => controller.abort()
  }, [date, involvedStylistIds.join('|')])

  /* ── Cascade resolution: can ALL services fit back-to-back from startIdx? ──
     Each service starts where the previous one ends (real durations); its
     stylist must be interval-free for that exact window. Shared by the
     Confirm gate and the Schedule grid (viableStarts) so the two can never
     drift apart. */
  const resolveCascade = (startIdx) => {
    const plan = []
    let cursor = toMins(ALL_SLOTS[startIdx])
    for (let i = 0; i < picked.length; i++) {
      const svc = picked[i]
      const dur = svc.duration_mins || 60
      const sMin = cursor
      const eMin = cursor + dur
      const pick = picks[svc.id]
      // When no stylist specialises in this category, ANY stylist is
      // acceptable — mirrors the Stylists step's show-all fallback and the
      // backend's specialist-count escape hatch.
      const hasSpecialist = stylists.some((s) => (s.categories || []).includes(svc.category))
      let stylist = null
      if (pick && pick !== 'any') {
        const st = stylists.find((x) => String(x.id) === String(pick))
        stylist =
          st &&
          ((st.categories || []).includes(svc.category) || !hasSpecialist) &&
          isFree(availMap[st.id], sMin, eMin)
            ? st
            : null
      } else {
        // "No preference": deal the window to a random stylist who is actually
        // free for it — never the same name by list order. If every
        // specialist is busy the pool is empty and the start is blocked.
        const freeSpecialists = stylists.filter(
          (s) =>
            (s.categories || []).includes(svc.category) &&
            isFree(availMap[s.id], sMin, eMin)
        )
        const pool = freeSpecialists.length > 0
          ? freeSpecialists
          : (!hasSpecialist
            ? stylists.filter((s) => isFree(availMap[s.id], sMin, eMin))
            : [])
        stylist = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null
      }
      if (!stylist) return { plan: [], blockedAt: i }
      plan.push({ service: svc, stylist, startMin: sMin, endMin: eMin })
      cursor = eMin
    }
    return { plan, blockedAt: null }
  }

  /* The visit reserves whole hours: real duration rounded up with the
     30-min grace. Closing fit and the grid use this, not the service count. */
  const visitMins = useMemo(() => totalDuration(picked), [picked])
  const blockSlots = useMemo(() => slotsNeeded(visitMins), [visitMins])

  const resolution = useMemo(() => {
    if (!startTime || picked.length === 0) return null
    const startIdx = ALL_SLOTS.indexOf(startTime)
    if (startIdx < 0 || startIdx + blockSlots > ALL_SLOTS.length) return null
    return resolveCascade(startIdx)
  }, [startTime, picked, picks, stylists, availMap, blockSlots])

  /* Start times where the whole cascade resolves against live availability —
     lets the Schedule grid mark taken hours before the user taps them. */
  const viableStarts = useMemo(() => {
    const viable = new Set()
    if (picked.length === 0) return viable
    for (let s = 0; s + blockSlots <= ALL_SLOTS.length; s++) {
      if (resolveCascade(s).blockedAt === null) viable.add(ALL_SLOTS[s])
    }
    return viable
  }, [picked, picks, stylists, availMap, blockSlots])

  /* Availability counts as loaded once every involved stylist has a fetched
     busy map — until then the grid stays neutral instead of flashing
     everything as taken. */
  const availLoaded = !loadingSlots && picked.length > 0 && involvedStylistIds.every((id) => availMap[id])
  const maxStarts = Math.max(0, ALL_SLOTS.length - blockSlots + 1)
  const takenStarts = availLoaded ? ALL_SLOTS.slice(0, maxStarts).filter((t) => !viableStarts.has(t)).length : 0

  /* A stale selection must never masquerade as valid: if the chosen start
     stops being viable (stylist changed on the step above, availability
     moved), drop it — same contract as changing the date. */
  useEffect(() => {
    if (startTime && availLoaded && !viableStarts.has(startTime)) setStartTime(null)
  }, [startTime, availLoaded, viableStarts])

  const canConfirm = Boolean(resolution?.plan?.length) && !resolution.blockedAt

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!user) { navigate('/login'); return }
    if (!resolution || resolution.blockedAt !== null) return
    setSubmitting(true)
    try {
      await client.post('/bookings/', {
        items: resolution.plan.map(({ service, stylist }) => ({
          service_id: service.id, stylist_id: stylist.id,
        })),
        date,
        time_slot: startTime,
        notes,
      })
      setSuccess(true)
      sessionStorage.removeItem('booking_draft')
      if ('vibrate' in navigator) navigator.vibrate(20)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Booking failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Success screen ── */
  if (success) {
    const planText = resolution?.plan
      ?.map(({ service, stylist, startMin }, i) => `${i + 1}. ${service.name} with ${stylist.name} at ${fmtTime(minsToHm(startMin))}`)
      .join('\n')
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="glass-card max-w-md w-full p-10 text-center"
        >
          <div className="w-20 h-20 rounded-full bg-gold-gradient flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-950" />
          </div>
          <h2 className="font-display text-3xl text-cream mb-3">Booking Request Sent!</h2>
          <p className="text-emerald-300 mb-4">
            {resolution?.plan?.length} service{resolution?.plan?.length > 1 ? 's' : ''} requested —
            you'll get a confirmation once the salon approves it.
          </p>
          {planText && (
            <pre className="text-left text-sm text-cream/80 whitespace-pre-wrap font-body bg-emerald-900/40 rounded-xl p-4 mb-6">{planText}</pre>
          )}
          <div className="flex flex-col gap-3">
            <Link to="/my-appointments" className="btn-gold text-center">View My Appointments</Link>
            <Link to="/" className="btn-outline text-center">Back to Home</Link>
          </div>
        </motion.div>
      </div>
    )
  }

  /* ── Step definitions ──
   * Logical steps are FIXED 0..5: whom, gender, services, stylists, schedule, confirm.
   * When For me is picked AND the profile already has a stored gender, the
   * Gender step is auto-skipped: the user's pre-known gender is applied, the
   * indicator shows 5 dots, and we land directly on Services. For someone
   * else ALWAYS shows the Gender step (the user is booking for another person
   * whose gender we can't assume). */
  const STEPS = ['whom', 'gender', 'services', 'stylists', 'schedule', 'confirm']
  const hasStoredGender = Boolean(user?.gender === 'men' || user?.gender === 'women')
  const skipGender = forWhom === 'myself' && hasStoredGender
  // effectiveStep is what we actually RENDER. When skipGender is true and the
  // user is on logical step 1 (gender), render step 2 (services) instead.
  const effectiveStep = (skipGender && step === 1) ? 2 : step
  const displayStep = Math.max(0, effectiveStep - (skipGender && step > 0 ? 1 : 0))
  // The step indicator shows ONLY the 4 "process" steps: Services, Stylists,
  // Schedule, Confirm. The Whom and Gender hero screens are pre-funnel
  // decisions and are intentionally excluded from the indicator so the
  // 4 dots fit comfortably on mobile without wrapping.
  const stepLabels = ['Services', 'Stylists', 'Schedule', 'Confirm']
  const logicalStepName = STEPS[effectiveStep]

  // displayStep indexes into the 4-step indicator: services=0, stylists=1,
  // schedule=2, confirm=3. Whom (effectiveStep=0) and gender (effectiveStep=1)
  // both map to "no indicator active" until services is reached.
  const indicatorStep =
    effectiveStep <= 1 ? -1 :
    effectiveStep === 2 ? 0 :
    effectiveStep === 3 ? 1 :
    effectiveStep === 4 ? 2 :
    3

  const goNext = () => {
    if (!canNext()) { tap(5); return }
    tap(10)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  const goBack = () => { tap(5); setStep((s) => Math.max(s - 1, 0)) }

  const canNext = () => {
    const label = STEPS[step]
    if (label === 'whom') return Boolean(forWhom)
    if (label === 'gender') return Boolean(audience || forKids)
    if (label === 'services') return picked.length > 0
    if (label === 'stylists') return picked.every((p) => picks[p.id])
    if (label === 'schedule') return Boolean(date && startTime && resolution && !resolution.blockedAt)
    return true
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <p className="step-counter mb-1.5">Ayra Saloon · Reservation</p>
          <h1 className="font-display text-3xl sm:text-4xl text-cream">Book Your Visit</h1>
          <div className="gold-divider" />
        </div>

        <StepIndicator labels={stepLabels} current={indicatorStep} />

        {/* NOTE: no overflow-hidden here — it would break position:sticky
            for the services screen's sticky tabs/search header. The step
            transition is opacity-only, so clipping isn't needed. */}
        <div className="glass-card p-5 sm:p-8 mb-8">
          <div
            key={logicalStepName}
            className="min-h-[440px] animate-step-fade"
          >
              {/* ── FOR WHOM (hero) ── */}
              {logicalStepName === 'whom' && (
                <div>
                  <motion.h2
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE_OUT }}
                    className="font-display text-3xl sm:text-4xl text-cream text-center mb-2 tracking-tight"
                  >
                    Who is this booking for?
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05, ease: EASE_OUT }}
                    className="text-emerald-300 text-center mb-8 text-sm"
                  >
                    We'll match the right services and stylists instantly
                  </motion.p>
                  <div className="space-y-3 max-w-lg mx-auto">
                    <HeroCard
                      icon={User}
                      title="For me"
                      subtitle={
                        hasStoredGender
                          ? `Booking for yourself — ${cap(user.gender)}'s services`
                          : 'Booking for yourself'
                      }
                      onSelect={() => {
                        tap(10)
                        setForWhom('myself')
                        // If the profile already has a gender on file, apply it
                        // and SKIP the Gender step — go straight to Services.
                        // The displayStep mapping collapses 6 dots into 5.
                        if (hasStoredGender) {
                          setAudience(user.gender)
                          setForKids(false)
                          setStep(2)  // logical step 2 = services
                        } else {
                          setAudience(null)
                          setForKids(false)
                          setStep(1)  // logical step 1 = gender
                        }
                      }}
                      large
                      delay={0.06}
                    />
                    <HeroCard
                      icon={UserPlus}
                      title="For someone else"
                      subtitle="Book for a friend, partner, or family member"
                      onSelect={() => {
                        tap(10)
                        setForWhom('someone_else')
                        setAudience(null)
                        setForKids(false)
                        setStep(1)  // logical step 1 = gender
                      }}
                      large
                      delay={0.14}
                    />
                  </div>
                </div>
              )}

              {/* ── GENDER (for them) ── */}
              {logicalStepName === 'gender' && (
                <div>
                  <motion.h2
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE_OUT }}
                    className="font-display text-3xl sm:text-4xl text-cream text-center mb-2 tracking-tight"
                  >
                    {forWhom === 'someone_else' ? "What's their gender?" : "What's your gender?"}
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05, ease: EASE_OUT }}
                    className="text-emerald-300 text-center mb-8 text-sm"
                  >
                    We'll show services tailored to them
                  </motion.p>
                  <div className="space-y-3 max-w-lg mx-auto">
                    <HeroCard
                      icon={User}
                      title="Men"
                      subtitle="Short cuts, fades, beard work, and grooming"
                      onSelect={() => {
                        tap(8)
                        setAudience('men')
                        setForKids(false)
                        setStep(2)  // logical step 2 = services
                      }}
                      delay={0.06}
                    />
                    <HeroCard
                      icon={User}
                      title="Women"
                      subtitle="Hair, beauty, spa, and bridal services"
                      onSelect={() => {
                        tap(8)
                        setAudience('women')
                        setForKids(false)
                        setStep(2)  // logical step 2 = services
                      }}
                      delay={0.12}
                    />
                    <HeroCard
                      icon={Sparkles}
                      title="Kids"
                      subtitle="Mini salon — fun, quick, gentle cuts"
                      onSelect={() => {
                        tap(8)
                        setForKids(true)
                        setAudience(null)
                        setStep(2)  // logical step 2 = services
                      }}
                      delay={0.18}
                    />
                  </div>
                  <button
                    onPointerDown={() => tap(5)}
                    onClick={goBack}
                    className="mt-4 mx-auto block text-emerald-300 hover:text-gold-400 text-sm transition-colors duration-200"
                  >
                    ← Back
                  </button>
                </div>
              )}

              {/* ── SERVICES ── */}
              {logicalStepName === 'services' && (
                loadingCatalog ? (
                  <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 glass-card animate-pulse rounded-2xl" />)}</div>
                ) : services.length === 0 ? (
                  <p className="text-emerald-300 text-center py-8">Menu unavailable right now.</p>
                ) : (
                  <>
                    <h2 className="font-display text-2xl sm:text-3xl text-cream text-center mb-1.5">
                      {forKids ? 'Kids Services' : 'Choose Your Services'}
                    </h2>
                    <p className="text-emerald-300 text-center mb-5 text-sm">
                      {forKids ? 'Gentle, quick, and fun' : 'Mix and match — book them all in one visit'}
                    </p>
                    <ServiceList
                      services={services}
                      picked={picked}
                      picks={picks}
                      audience={audience}
                      forKids={forKids}
                      setPicked={setPicked}
                      setPicks={setPicks}
                    />
                  </>
                )
              )}

              {/* ── STYLISTS (per-service) ── */}
              {logicalStepName === 'stylists' && (
                <div>
                  <h2 className="font-display text-3xl text-cream text-center mb-2">Pick Your Stylists</h2>
                  <p className="text-emerald-300 text-center mb-8 text-sm">One choice per service — or leave it to us</p>
                  <div className="space-y-6">
                    {picked.map((svc) => {
                      const compatible = stylists.filter((s) => (s.categories || []).includes(svc.category))
                      // Fallback: when NO stylist specialises in this category,
                      // show the whole team instead of a lone "No preference".
                      const choices = compatible.length > 0 ? compatible : stylists
                      const forced = compatible.length === 1
                      return (
                        <div key={svc.id} className="rounded-2xl border border-emerald-700/60 bg-emerald-900/30 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-cream font-medium text-sm flex items-center gap-2">
                              <Scissors className="w-4 h-4 text-gold-400" /> {svc.name}
                            </span>
                            <span className="text-gold-400 text-xs">₹{svc.price}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {choices.map((st) => {
                              const active = picks[svc.id] === String(st.id)
                              return (
                                <button
                                  key={st.id}
                                  type="button"
                                  onPointerDown={() => tap(4)}
                                  onClick={() => { tap(8); setPicks((pk) => ({ ...pk, [svc.id]: String(st.id) })) }}
                                  className={`tap-target px-3.5 py-2 rounded-full text-xs font-medium border ${
                                    active
                                      ? 'bg-gold-gradient text-emerald-950 border-gold-400 shadow-[0_0_0_1px_rgba(201,168,76,0.3)]'
                                      : 'border-emerald-700 text-cream/80 hover:border-gold-500/50'
                                  }`}
                                >
                                  {st.name}
                                </button>
                              )
                            })}
                            {!forced && (
                              <button
                                type="button"
                                onPointerDown={() => tap(4)}
                                onClick={() => { tap(8); setPicks((pk) => ({ ...pk, [svc.id]: 'any' })) }}
                                className={`tap-target px-3.5 py-2 rounded-full text-xs font-medium border ${
                                  (picks[svc.id] || 'any') === 'any'
                                    ? 'bg-gold-gradient text-emerald-950 border-gold-400'
                                    : 'border-dashed border-emerald-600 text-emerald-300 hover:border-gold-500/50'
                                }`}
                              >
                                ✦ No preference
                              </button>
                            )}
                          </div>
                          {forced && compatible.length === 1 && (
                            <p className="mt-2 text-xs text-emerald-300">
                              Required stylist: {compatible[0].name}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── SCHEDULE (date + cascade start) ── */}
              {logicalStepName === 'schedule' && (
                <div className="space-y-7">
                  <h2 className="font-display text-3xl text-cream text-center mb-2">Pick Date & Start Time</h2>
                  <p className="text-emerald-300 text-center text-sm -mt-4">
                    {picked.length} service{picked.length > 1 ? 's' : ''} back-to-back — about {fmtDur(visitMins)} total, reserves {blockSlots} hour{blockSlots !== 1 ? 's' : ''}
                  </p>

                  <div>
                    <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-3">Select Date</p>
                    <input
                      type="date"
                      min={istDate(0)}
                      value={date}
                      onChange={(e) => { setDate(e.target.value); setStartTime(null) }}
                      className="luxury-input max-w-xs"
                    />
                  </div>

                  <div>
                    <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-3">
                      Start Time <span className="normal-case tracking-normal text-emerald-300">(next hours suggested automatically)</span>
                    </p>
                    {loadingSlots ? (
                      <div className="grid grid-cols-4 gap-2">
                        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 rounded-xl bg-emerald-900 animate-pulse" />)}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {ALL_SLOTS.map((t) => {
                          const startIdx = ALL_SLOTS.indexOf(t)
                          const fits = startIdx + blockSlots <= ALL_SLOTS.length
                          const taken = fits && availLoaded && !viableStarts.has(t)
                          const disabled = !fits || taken
                          return (
                            <button
                              key={t}
                              type="button"
                              disabled={disabled}
                              title={taken ? 'Already booked' : !fits ? 'Not enough time before closing' : undefined}
                              onPointerDown={() => !disabled && tap(4)}
                              onClick={() => { if (!disabled) { tap(8); setStartTime(t) } }}
                              className={`tap-target py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 ${
                                taken
                                  ? 'bg-emerald-950/60 text-emerald-600 border border-emerald-800/60 line-through cursor-not-allowed'
                                  : startTime === t
                                    ? 'bg-gold-gradient text-emerald-950 border border-gold-400 shadow-[0_0_0_1px_rgba(201,168,76,0.3)]'
                                    : !fits
                                      ? 'bg-emerald-950 text-emerald-700/70 border border-dashed border-emerald-800 cursor-not-allowed opacity-60'
                                      : 'bg-emerald-900 text-cream border border-emerald-700 hover:border-gold-500/50'
                              }`}
                            >
                              {fmtTime(t)}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {takenStarts > 0 && (
                      <p className="mt-3 text-emerald-400/80 text-xs">
                        {takenStarts >= maxStarts
                          ? 'No start times left for this date — try another day.'
                          : 'Struck-through times are already booked.'}
                      </p>
                    )}
                    {startTime && resolution?.blockedAt !== null && (
                      <p className="mt-3 text-amber-400 text-xs flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Some services can't fit starting at {fmtTime(startTime)} — try another start time.
                      </p>
                    )}
                  </div>

                  {/* Resolved timeline preview */}
                  {resolution?.plan?.length > 0 && (
                    <div className="rounded-2xl border border-gold-500/30 bg-emerald-900/40 p-5 space-y-2.5">
                      <p className="text-gold-400 text-xs uppercase tracking-widest mb-1">Your visit</p>
                      {resolution.plan.map(({ service, stylist, startMin, endMin }, i) => (
                        <div key={service.id} className="flex items-center justify-between text-sm">
                          <span className="text-cream">{i + 1}. {service.name}</span>
                          <span className="text-emerald-300">
                            {stylist.name} · {fmtTime(minsToHm(startMin))}–{fmtTime(minsToHm(endMin))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── CONFIRM ── */}
              {logicalStepName === 'confirm' && (
                <div>
                  <h2 className="font-display text-3xl text-cream text-center mb-2">Confirm Booking</h2>
                  <p className="text-emerald-300 text-center text-sm mb-8">Review your visit details</p>
                  <div className="glass-card p-6 mb-6 space-y-4">
                    <div className="flex justify-between items-center border-b border-emerald-800 pb-3">
                      <span className="text-emerald-300 text-sm">For</span>
                      <span className="text-cream font-medium text-sm">
                        {forWhom === 'someone_else'
                          ? `${user?.name?.split(' ')[0] || 'You'} · booking for someone else`
                          : `${user?.name?.split(' ')[0] || 'You'} (${forKids ? 'Kids' : cap(audience || 'unisex')})`}
                      </span>
                    </div>
                    {picked.map((svc, i) => (
                      <div key={svc.id} className="flex justify-between items-center border-b border-emerald-800 pb-3">
                        <span className="text-emerald-300 text-sm">{i + 1}. {svc.name}</span>
                        <span className="text-cream font-medium text-sm">₹{svc.price}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center border-b border-emerald-800 pb-3">
                      <span className="text-emerald-300 text-sm">Date</span>
                      <span className="text-cream font-medium text-sm">{new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-emerald-800 pb-3 last:border-0">
                      <span className="text-emerald-300 text-sm">Start & Duration</span>
                      <span className="text-cream font-medium text-sm">
                        {fmtTime(startTime)} · {fmtDur(visitMins)} ({blockSlots} hr{blockSlots !== 1 ? 's' : ''} reserved)
                      </span>
                    </div>
                  </div>
                  <div className="mb-6">
                    <label className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">Special Requests (optional)</label>
                    <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any preferences or special instructions..." className="luxury-input resize-none" />
                  </div>
                  {!user && (
                    <p className="text-center text-emerald-300 text-sm -mt-2 mb-4">
                      Please <Link to="/login" className="text-gold-400 underline">login</Link> or{' '}
                      <Link to="/signup" className="text-gold-400 underline">sign up</Link> to complete your booking.
                    </p>
                  )}
                </div>
              )}
          </div>
        </div>

        {/* Navigation — on Whom and Gender the HeroCard is the action, so the
            right-side button is hidden. From Services onward, the standard
            Continue / Confirm pattern takes over. The bar is a sticky glass
            material: it docks to the viewport bottom while the step content
            scrolls beneath it, so the primary action is always in reach. */}
        {(() => {
          const isHeroStep = logicalStepName === 'whom' || logicalStepName === 'gender'
          const showContinue = !isHeroStep && step < STEPS.length - 1
          const showConfirm  = !isHeroStep && step === STEPS.length - 1
          const hasActions = step > 0 || showContinue || showConfirm
          if (!hasActions) return null
          return (
            <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-30">
              <div className="flex justify-between items-center gap-3 rounded-2xl border border-emerald-700/50 bg-emerald-950/80 backdrop-blur-xl shadow-xl shadow-black/40 px-4 py-3">
                {step > 0 ? (
                  <button onPointerDown={() => tap(5)} onClick={goBack} className="btn-outline flex items-center gap-2">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                ) : (<div />)}
                {showContinue && (
                  <button
                    id="next-step-btn"
                    type="button"
                    onPointerDown={() => tap(5)}
                    onClick={goNext}
                    disabled={!canNext()}
                    className={`btn-gold flex items-center gap-2 ${!canNext() ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                {showConfirm && (
                  <button
                    id="confirm-booking-btn"
                    type="button"
                    onPointerDown={() => tap(10)}
                    onClick={handleSubmit}
                    disabled={submitting || !user || !canConfirm}
                    className="btn-gold flex items-center gap-2"
                  >
                    {submitting ? 'Sending…' : user ? 'Confirm Booking' : 'Login to Book'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )
        })()}

        {!user && logicalStepName === 'confirm' && (
          <p className="text-center text-emerald-300 text-sm mt-4">
            Please <Link to="/login" className="text-gold-400 underline hover:text-gold-300">login</Link> or{' '}
            <Link to="/signup" className="text-gold-400 underline hover:text-gold-300">sign up</Link> to complete your booking.
          </p>
        )}
      </div>
    </div>
  )
}
