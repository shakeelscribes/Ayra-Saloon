import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Scissors, User, Phone, Plus, Trash2, CheckCircle2, Calendar, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../api/client'

/* Salon day grid — mirrors backend/routes/availability.py ALL_SLOTS. */
const ALL_SLOTS = Array.from({ length: 11 }, (_, i) => `${10 + i}:00`)

/* IST "today" — toISOString() is UTC and shows yesterday between 00:00–05:30 IST. */
const istToday = () => {
  const now = new Date()
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000).toISOString().split('T')[0]
}

/* Current IST time as minutes-since-midnight — for grace-aware past slots. */
const istNowMins = () => {
  const now = new Date()
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000)
  return ist.getHours() * 60 + ist.getMinutes()
}

const fmtTime = (t) => {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/* ── Duration-based slot math (mirrors backend/routes/availability.py) ── */
const toMins = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
const minsToHm = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
const isFree = (busy, startMin, endMin) =>
  !(busy || []).some((b) => startMin < toMins(b.end) && toMins(b.start) < endMin)
const slotsNeededFor = (rows) =>
  Math.max(1, Math.ceil((rows.reduce((s, r) => s + (r.duration_mins || 60), 0) - 30) / 60))

/* Hard audience rules — mirrors the user panel's Services filter: kids shows
   only for_kids services; men/women exclude kids services and audience
   mismatches (unisex always passes). */
const matchesAudience = (aud, svc) => {
  if (!svc) return false
  if (aud === 'kids') return !!svc.for_kids
  const mismatch = !!aud && svc.audience !== 'unisex' && svc.audience !== aud
  return !mismatch && !svc.for_kids
}

/* Sort options — mirrors the user panel's ServiceList. */
const SORT_OPTIONS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'price_asc', label: 'Price ↑' },
  { id: 'price_desc', label: 'Price ↓' },
  { id: 'name_asc', label: 'Name A–Z' },
  { id: 'duration_asc', label: 'Quickest first' },
]

/* Category tabs — same ids as the backend service categories. */
const CATEGORY_TABS = [
  { id: 'all', label: 'All' },
  { id: 'hair', label: 'Hair' },
  { id: 'grooming', label: 'Grooming' },
  { id: 'colour', label: 'Colour' },
  { id: 'spa', label: 'Spa' },
  { id: 'facial', label: 'Facial' },
  { id: 'bridal', label: 'Bridal' },
  { id: 'tattoo', label: 'Tattoo' },
  { id: 'general', label: 'Other' },
]

export default function NewAppointment() {
  const navigate = useNavigate()

  // Customer
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  // Catalog
  const [services, setServices] = useState([])
  const [stylists, setStylists] = useState([])

  // Selected items: [{ service_id, stylist_id }] with resolved objects for UI
  const [items, setItems] = useState([])
  const [pickService, setPickService] = useState('')
  const [pickStylist, setPickStylist] = useState('')

  // Audience (men | women | kids) — mirrors the user panel's gender step.
  // Remembered within the browser session for consecutive walk-ins.
  const [audience, setAudience] = useState(
    () => { try { return sessionStorage.getItem('admin_booking_audience') || '' } catch { return '' } }
  )

  // Service filter bar state — mirrors the user panel's ServiceList.
  const [svcQuery, setSvcQuery] = useState('')
  const [svcCategory, setSvcCategory] = useState('all')
  const [svcSort, setSvcSort] = useState('recommended')

  // Schedule
  const [date, setDate] = useState(istToday())
  const [start, setStart] = useState(null)
  const [avail, setAvail] = useState({})
  const [availLoading, setAvailLoading] = useState(false)

  const [confirmNow, setConfirmNow] = useState(true)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      client.get('/services/').then(r => r.data).catch(() => []),
      client.get('/stylists/').then(r => r.data).catch(() => []),
    ]).then(([svcs, stys]) => {
      setServices(svcs.filter(s => s.bookable !== false))
      setStylists(stys)
    })
  }, [])

  const serviceById = (id) => services.find(s => String(s.id) === String(id))
  const stylistById = (id) => stylists.find(s => String(s.id) === String(id))

  // Stylists who can take the picked service — specialists first; if the
  // category has no specialist at all, everyone qualifies (backend fallback).
  const eligibleStylists = useMemo(() => {
    const svc = serviceById(pickService)
    if (!svc) return stylists
    const specialists = stylists.filter(s => (s.categories || []).includes(svc.category))
    return specialists.length > 0 ? specialists : stylists
  }, [pickService, services, stylists])

  // Reset the stylist pick when the service changes and the pick is ineligible
  useEffect(() => { setPickStylist('') }, [pickService])

  // Service list filtered by audience + search + category, then sorted —
  // mirrors the user panel's ServiceList pipeline ("Recommended" = most
  // popular first; ties keep catalog order, same as the user panel).
  const filteredServices = useMemo(() => {
    let list = services.filter(s => matchesAudience(audience, s))
    if (audience !== 'kids' && svcCategory !== 'all') {
      list = list.filter(s => s.category === svcCategory)
    }
    const q = svcQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q))
    }
    const sorted = [...list]
    switch (svcSort) {
      case 'price_asc': sorted.sort((a, b) => (a.price || 0) - (b.price || 0)); break
      case 'price_desc': sorted.sort((a, b) => (b.price || 0) - (a.price || 0)); break
      case 'name_asc': sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break
      case 'duration_asc': sorted.sort((a, b) => (a.duration_mins || 60) - (b.duration_mins || 60)); break
      default: sorted.sort((a, b) => (b.popularity ?? 50) - (a.popularity ?? 50))
    }
    return sorted
  }, [services, audience, svcCategory, svcQuery, svcSort])

  // Per-tab counts so the admin sees how many services live in each
  // category before tapping (adult flow only).
  const tabCounts = useMemo(() => {
    const base = services.filter(s => matchesAudience(audience, s))
    const counts = { all: base.length }
    for (const t of CATEGORY_TABS) {
      if (t.id === 'all') continue
      counts[t.id] = base.filter(s => s.category === t.id).length
    }
    return counts
  }, [services, audience])

  const addItem = () => {
    const svc = serviceById(pickService)
    const sty = stylistById(pickStylist)
    if (!svc || !sty) {
      toast.error('Pick a service and a stylist first')
      return
    }
    if (items.some(i => String(i.service_id) === String(svc.id))) {
      toast.error('Each service can be added only once')
      return
    }
    setItems([...items, {
      service_id: String(svc.id), stylist_id: String(sty.id),
      service: svc, stylist: sty,
    }])
    setPickService('')
    setPickStylist('')
  }

  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx))

  // Audience switches prune the cart — a mismatched service would 409 the
  // whole booking at submit (backend audience-consistency rule). Mirrors
  // the user panel's prune effect. The availability effect re-runs on its
  // own because itemStylistIds changes.
  const changeAudience = (a) => {
    setAudience(a)
    try { sessionStorage.setItem('admin_booking_audience', a) } catch { /* private mode */ }
    setItems(items.filter(i => matchesAudience(a, i.service)))
    const picked = serviceById(pickService)
    if (picked && !matchesAudience(a, picked)) {
      setPickService('')
      setPickStylist('')
    }
  }

  const totalMins = items.reduce((s, i) => s + (i.service?.duration_mins || 60), 0)
  const totalPrice = items.reduce((s, i) => s + (i.service?.price || 0), 0)

  // Distinct stylists across selected items — availability is per stylist
  const itemStylistIds = useMemo(
    () => [...new Set(items.map(i => i.stylist_id))],
    [items]
  )

  // Availability per involved stylist for the chosen date
  useEffect(() => {
    if (itemStylistIds.length === 0 || !date) { setAvail({}); return }
    const controller = new AbortController()
    setAvailLoading(true)
    setAvail({})
    setStart(null)
    Promise.all(itemStylistIds.map(id =>
      client.get(`/availability/?stylist_id=${id}&date=${date}`, { signal: controller.signal })
        .then(r => [id, r.data.busy || []])
        .catch(() => [id, []])
    )).then(pairs => {
      if (!controller.signal.aborted) setAvail(Object.fromEntries(pairs))
    }).finally(() => {
      if (!controller.signal.aborted) setAvailLoading(false)
    })
    return () => controller.abort()
  }, [itemStylistIds.join(','), date])

  // Whole-hour block sizing — same rule as creation and the backend
  const blockSlots = useMemo(() => slotsNeededFor(
    items.map(i => ({ duration_mins: i.service?.duration_mins || 60 }))
  ), [items])

  // Cascade resolution — each service starts where the previous one ends
  // (real durations); its stylist must be interval-free for that exact
  // window. Shared by the slot grid (viableStarts) and the "Your visit"
  // timeline so the two never drift — mirrors resolveCascade in the user
  // panel (BookingComponent.jsx).
  const resolveCascade = useCallback((startIdx) => {
    const plan = []
    let cursor = toMins(ALL_SLOTS[startIdx])
    for (let i = 0; i < items.length; i++) {
      const dur = items[i].service?.duration_mins || 60
      const busy = avail[items[i].stylist_id]
      if (!busy || !isFree(busy, cursor, cursor + dur)) return { plan, blockedAt: i }
      plan.push({ startMin: cursor, endMin: cursor + dur })
      cursor += dur
    }
    return { plan, blockedAt: null }
  }, [items, avail])

  // A start works when the whole back-to-back block fits before closing and
  // every service's own stylist is interval-free for its real window.
  const viableStarts = useMemo(() => {
    const viable = new Set()
    if (items.length === 0) return viable
    for (let s = 0; s + blockSlots <= ALL_SLOTS.length; s++) {
      if (resolveCascade(s).blockedAt === null) viable.add(ALL_SLOTS[s])
    }
    return viable
  }, [items, avail, blockSlots, resolveCascade])

  const availLoaded = !availLoading && itemStylistIds.length > 0 &&
    itemStylistIds.every(id => avail[id])

  // Grace-aware past slots for today — mirrors the backend freshness guard:
  // a slot stays bookable today while up to 30 min of it remain; beyond
  // that the backend would 400, so disable it upfront.
  const isToday = date === istToday()
  const isPassed = (t) => isToday && istNowMins() - toMins(t) > 30

  // "Struck-through times are already booked" helper — shown when at least
  // one slot is booked out (as opposed to not fitting before closing).
  const hasTaken = availLoaded && ALL_SLOTS.some((t, idx) =>
    idx + blockSlots <= ALL_SLOTS.length && !isPassed(t) && !viableStarts.has(t))

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Customer name is required'); return }
    if (phone.replace(/\D/g, '').length < 10) { toast.error('A valid 10-digit phone number is required'); return }
    if (items.length === 0) { toast.error('Add at least one service'); return }
    if (!start) { toast.error('Pick a start time'); return }
    setSaving(true)
    try {
      await client.post('/bookings/admin/create', {
        customer_name: name.trim(),
        phone: phone.trim(),
        items: items.map(i => ({ service_id: i.service_id, stylist_id: i.stylist_id })),
        date,
        time_slot: start,
        notes: notes.trim() || null,
        confirm_now: confirmNow,
      })
      toast.success(confirmNow ? 'Appointment booked & confirmed' : 'Appointment saved as pending')
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not create the appointment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen pt-10 pb-16 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-2">Admin Panel</p>
            <h1 className="font-display text-4xl text-cream">New Appointment</h1>
            <div className="w-20 h-0.5 mt-4" style={{ background: 'linear-gradient(90deg, #c9a84c, transparent)' }} />
          </div>
          <Link to="/" className="btn-outline !px-5 !py-2.5 text-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>

        <form onSubmit={submit} className="space-y-6">
          {/* Customer */}
          <div className="glass-card p-6">
            <h2 className="font-display text-xl text-cream mb-5 flex items-center gap-2">
              <User className="w-5 h-5 text-gold-400" /> Customer
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="wa-name">Name</label>
                <input
                  id="wa-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Customer's name"
                  className="luxury-input"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="wa-phone">
                  <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> WhatsApp number</span>
                </label>
                <input
                  id="wa-phone"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="98765 43210"
                  className="luxury-input"
                  required
                />
                <p className="text-emerald-500 text-[11px] mt-1.5">
                  Existing customers are matched by number — new ones get an account automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Services */}
          <div className="glass-card p-6">
            <h2 className="font-display text-xl text-cream mb-5 flex items-center gap-2">
              <Scissors className="w-5 h-5 text-gold-400" /> Services
            </h2>

            {/* Audience — mirrors the user panel's gender step; remembered
                in-session. Tap the active pill to clear it. */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {[['men', 'Men'], ['women', 'Women'], ['kids', 'Kids']].map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => changeAudience(audience === v ? '' : v)}
                  className={`px-4 py-2 rounded-full text-xs border transition-colors duration-200 ${
                    audience === v
                      ? 'bg-gold-gradient text-emerald-950 border-gold-500 font-semibold'
                      : 'border-emerald-700 text-emerald-300 hover:border-gold-500/60'
                  }`}
                >
                  {label}
                </button>
              ))}
              {!audience && (
                <span className="text-amber-400 text-xs">Pick an audience to see services</span>
              )}
            </div>

            {/* Filter bar — live search (name + description); category chips
                and sort in the adult flow only, mirroring the user panel. */}
            {audience && (
              <div className="mb-4 space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" />
                  <input
                    value={svcQuery}
                    onChange={e => setSvcQuery(e.target.value)}
                    placeholder="Search services…"
                    className="luxury-input !pl-9"
                    aria-label="Search services"
                  />
                </div>
                {audience !== 'kids' && (
                  <div className="flex flex-wrap items-center gap-2">
                    {CATEGORY_TABS
                      .filter(t => t.id === 'all' || (tabCounts[t.id] || 0) > 0)
                      .map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSvcCategory(t.id)}
                          className={`px-3 py-1.5 rounded-full text-[11px] border transition-colors duration-200 ${
                            svcCategory === t.id
                              ? 'bg-gold-gradient text-emerald-950 border-gold-500 font-semibold'
                              : 'border-emerald-700 text-emerald-300 hover:border-gold-500/60'
                          }`}
                        >
                          {t.label} {tabCounts[t.id] ?? 0}
                        </button>
                      ))}
                    <select
                      value={svcSort}
                      onChange={e => setSvcSort(e.target.value)}
                      className="luxury-input !w-auto !py-1.5 text-xs ml-auto"
                      aria-label="Sort services"
                    >
                      {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Picker row */}
            <div className="flex flex-wrap gap-3 mb-4">
              <select
                value={pickService}
                onChange={e => setPickService(e.target.value)}
                className="luxury-input !w-auto grow sm:grow-0 sm:min-w-[220px]"
                aria-label="Service"
                disabled={!audience}
              >
                <option value="">{audience ? 'Select service…' : 'Pick an audience first…'}</option>
                {audience === 'kids' ? (
                  <>
                    <optgroup label="For boys">
                      {filteredServices.filter(s => s.kid_gender === 'boy').map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.duration_mins}m · ₹{s.price}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="For girls">
                      {filteredServices.filter(s => s.kid_gender === 'girl').map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {s.duration_mins}m · ₹{s.price}
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  filteredServices.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.duration_mins}m · ₹{s.price}
                    </option>
                  ))
                )}
              </select>
              <select
                value={pickStylist}
                onChange={e => setPickStylist(e.target.value)}
                className="luxury-input !w-auto grow sm:grow-0 sm:min-w-[180px]"
                aria-label="Stylist"
                disabled={!pickService}
              >
                <option value="">Select stylist…</option>
                {eligibleStylists.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={addItem}
                className="btn-outline !px-4 !py-2.5 text-sm inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            {/* Selected items */}
            {items.length === 0 ? (
              <p className="text-emerald-400 text-sm">No services added yet.</p>
            ) : (
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={`${it.service_id}-${idx}`} className="flex items-center gap-3 rounded-xl border border-emerald-700/60 bg-emerald-900/40 px-4 py-3">
                    <div className="min-w-0 grow">
                      <p className="text-cream text-sm font-medium">{it.service?.name}</p>
                      <p className="text-emerald-300 text-xs">
                        {it.stylist?.name} · {it.service?.duration_mins} min · ₹{it.service?.price}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-red-400 hover:text-red-300 transition-colors p-1"
                      title="Remove service"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-emerald-300">Total ≈ {totalMins} min · reserves {blockSlots} hour{blockSlots !== 1 ? 's' : ''}</span>
                  <span className="text-gold-400 font-semibold">₹{totalPrice.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="glass-card p-6">
            <h2 className="font-display text-xl text-cream mb-5 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gold-400" /> Schedule
            </h2>

            <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="wa-date">Date</label>
            <input
              type="date"
              id="wa-date"
              value={date}
              min={istToday()}
              onChange={e => setDate(e.target.value)}
              className="luxury-input mb-5 max-w-xs"
            />

            <label className="block text-xs text-emerald-300 mb-2" htmlFor="wa-start">Start time</label>
            {items.length === 0 ? (
              <p className="text-amber-400 text-xs">Add services first — availability depends on the stylists involved.</p>
            ) : availLoading ? (
              <div className="grid grid-cols-4 gap-2">
                {ALL_SLOTS.slice(0, 8).map(t => <div key={t} className="h-9 rounded-lg bg-emerald-900/40 animate-pulse" />)}
              </div>
            ) : !availLoaded ? (
              <p className="text-amber-400 text-xs">Could not load availability for this date.</p>
            ) : (
              <>
                {/* The full grid stays visible so the admin can see WHY a
                    slot is blocked (booked vs won't fit vs already passed). */}
                {viableStarts.size === 0 && (
                  <p className="text-amber-400 text-xs mb-2">
                    No start times available for this date — try another day.
                  </p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  {ALL_SLOTS.map(t => {
                    const idx = ALL_SLOTS.indexOf(t)
                    const fitsClosing = idx + blockSlots <= ALL_SLOTS.length
                    const passed = isPassed(t)
                    // Strike-through = already booked; dimmed without strike
                    // = won't fit before closing / already passed.
                    const taken = fitsClosing && !passed && !viableStarts.has(t)
                    const selectable = viableStarts.has(t) && !passed
                    const selected = start === t
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={!selectable}
                        onClick={() => setStart(t)}
                        title={taken
                          ? 'Already booked'
                          : passed
                            ? 'Already passed'
                            : !fitsClosing
                              ? "Won't fit before closing"
                              : ''}
                        className={`py-2 text-xs rounded-lg border transition-colors duration-200 ${
                          selected
                            ? 'bg-gold-gradient text-emerald-950 border-gold-500 font-semibold'
                            : selectable
                              ? 'border-emerald-700 text-cream hover:border-gold-500/60'
                              : passed || !fitsClosing
                                ? 'border-emerald-800/50 text-emerald-700/60 cursor-not-allowed'
                                : 'border-emerald-800/50 text-emerald-700 line-through cursor-not-allowed'
                        }`}
                      >
                        {fmtTime(t)}
                      </button>
                    )
                  })}
                </div>
                {hasTaken && (
                  <p className="text-emerald-500 text-[11px] mt-2">
                    Struck-through times are already booked.
                  </p>
                )}

                {/* "Your visit" — resolved back-to-back plan for the picked
                    start (mirrors the user panel's timeline preview). */}
                {start && (
                  <div className="mt-4 rounded-xl border border-emerald-700/60 bg-emerald-900/40 px-4 py-3">
                    <p className="text-gold-400 text-[10px] font-semibold tracking-widest uppercase mb-1.5">
                      Your visit
                    </p>
                    {(() => {
                      const idx = ALL_SLOTS.indexOf(start)
                      const res = idx >= 0 && idx + blockSlots <= ALL_SLOTS.length
                        ? resolveCascade(idx)
                        : { plan: [], blockedAt: 0 }
                      if (res.blockedAt !== null) {
                        return <p className="text-amber-400 text-xs">This start no longer fits — pick another slot.</p>
                      }
                      return (
                        <div className="space-y-1">
                          {res.plan.map((w, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 text-xs">
                              <span className="text-cream truncate">{items[i]?.service?.name}</span>
                              <span className="text-emerald-300 whitespace-nowrap">
                                {fmtTime(minsToHm(w.startMin))}–{fmtTime(minsToHm(w.endMin))} · {items[i]?.stylist?.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </>
            )}

            {/* Confirm-now toggle */}
            <label className="flex items-center gap-3 mt-6 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmNow}
                onChange={e => setConfirmNow(e.target.checked)}
                className="w-4 h-4 accent-[#c9a84c]"
              />
              <span className="text-cream text-sm inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Confirm immediately
                <span className="text-emerald-400 text-xs">(uncheck to keep it in the pending queue)</span>
              </span>
            </label>

            <label className="block text-xs text-emerald-300 mb-1.5 mt-5" htmlFor="wa-notes">Notes (optional)</label>
            <textarea
              id="wa-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Walk-in, prefers the chair by the window"
              className="luxury-input resize-none"
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <Link to="/" className="btn-outline !px-6 !py-2.5 text-sm">Cancel</Link>
            <button
              type="submit"
              disabled={saving}
              className="btn-gold !px-6 !py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Booking…' : confirmNow ? 'Book & Confirm' : 'Save as Pending'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
