import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scissors, User, Calendar, Clock, CheckCircle2, ChevronRight, ChevronLeft,
  ArrowRight, Sparkles, Crown, Palette, Droplets, PenTool, SprayCan, Flower2,
  Plus, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

const EASE_OUT = [0.16, 1, 0.3, 1]

/* Mirrors the backend slot grid: hourly, 10:00–20:00 */
const ALL_SLOTS = Array.from({ length: 11 }, (_, i) => `${String(10 + i).padStart(2, '0')}:00`)
const STEP_LABELS = ['Services', 'Stylists', 'Schedule', 'Confirm']

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
      .then(([s, st]) => { setServices(s.data); setStylists(st.data) })
      .catch(() => toast.error('Could not load the menu'))
      .finally(() => setLoadingCatalog(false))
  }, [])

  /* ── Flow state ── */
  const needsForWhom = !(user?.gender === 'men' || user?.gender === 'women')
  const [step, setStep] = useState(needsForWhom ? 0 : 1)
  const [audience, setAudience] = useState(user?.gender || null)   // men | women | null(unisex/kids)
  const [forKids, setForKids] = useState(false)

  const [picked, setPicked] = useState([])        // ordered service objects
  const [picks, setPicks] = useState({})          // serviceId -> stylistId | 'any'

  const [date, setDate] = useState(new Date(Date.now() + 864e5).toISOString().split('T')[0])
  const [startTime, setStartTime] = useState(null)
  const [availMap, setAvailMap] = useState({})    // stylistId -> Set(free times)
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
        }).then((r) => [id, new Set(r.data.available_slots)])
          .catch(() => [id, new Set()])
      )
    ).then((pairs) => {
      if (controller.signal.aborted) return
      setAvailMap(Object.fromEntries(pairs))
    }).finally(() => { if (!controller.signal.aborted) setLoadingSlots(false) })
    return () => controller.abort()
  }, [date, involvedStylistIds.join('|')])

  /* ── Cascade resolution: can ALL services fit starting at startTime? ── */
  const resolution = useMemo(() => {
    if (!startTime || picked.length === 0) return null
    const startIdx = ALL_SLOTS.indexOf(startTime)
    if (startIdx < 0 || startIdx + picked.length > ALL_SLOTS.length) return null
    const plan = []
    for (let i = 0; i < picked.length; i++) {
      const svc = picked[i]
      const slotTime = ALL_SLOTS[startIdx + i]
      const pick = picks[svc.id]
      let stylist = null
      if (pick && pick !== 'any') {
        const st = stylists.find((x) => String(x.id) === String(pick))
        stylist = st && (st.categories || []).includes(svc.category) ? st : null
      } else {
        stylist =
          stylists.find(
            (s) =>
              (s.categories || []).includes(svc.category) &&
              (availMap[s.id]?.has(slotTime) ?? false)
          ) || null
      }
      if (!stylist) return { plan: [], blockedAt: i, conflictSlot: slotTime }
      plan.push({ service: svc, stylist, slotTime })
    }
    return { plan, blockedAt: null, conflictSlot: null }
  }, [startTime, picked, picks, stylists, availMap])

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
      ?.map(({ service, stylist, slotTime }, i) => `${i + 1}. ${service.name} with ${stylist.name} at ${fmtTime(slotTime)}`)
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

  /* ── Step definitions (For Whom skipped once gender known) ── */
  const steps = []
  if (needsForWhom) steps.push('whom')
  steps.push('services', 'stylists', 'schedule', 'confirm')
  const stepIndex = steps[step]
  const stepLabels = steps.map((s) =>
    s === 'whom' ? 'For Whom' : s === 'services' ? 'Services' :
    s === 'stylists' ? 'Stylists' : s === 'schedule' ? 'Schedule' : 'Confirm'
  )

  const goNext = () => setStep((s) => Math.min(s + 1, steps.length - 1))
  const goBack = () => setStep((s) => Math.max(s - 1, 0))

  const canNext = () => {
    const label = steps[step]
    if (label === 'Services') return picked.length > 0
    if (label === 'Stylists') return picked.every((p) => picks[p.id])
    if (label === 'Schedule') return Boolean(date && startTime && resolution && !resolution.blockedAt)
    return true
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-2">Reservation</p>
          <h1 className="font-display text-4xl text-cream">Book Your Visit</h1>
          <div className="gold-divider" />
        </div>

        <StepIndicator labels={stepLabels} current={step} />

        <div className="glass-card p-6 sm:p-8 mb-8 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={steps[step]}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              {/* ── FOR WHOM ── */}
              {stepIndex === 'whom' && (
                <div>
                  <h2 className="font-display text-3xl text-cream text-center mb-2">Who is this for?</h2>
                  <p className="text-emerald-300 text-center mb-8 text-sm">We'll show the right services instantly</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { key: 'men', label: 'Men', icon: User },
                      { key: 'women', label: 'Women', icon: User },
                      { key: 'kids', label: 'Kids', icon: Sparkles },
                    ].map(({ key, label, icon: Icon }) => {
                      const active = key === 'kids' ? forKids : audience === key
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            if (key === 'kids') { setForKids(!forKids); setAudience(null) }
                            else { setAudience(audience === key ? null : key); setForKids(false) }
                          }}
                          className={`p-5 rounded-2xl border text-center transition-all duration-200 ${
                            active ? 'border-gold-500 bg-gold-500/10' : 'border-emerald-700 bg-emerald-900/40 hover:border-gold-500/50'
                          }`}
                        >
                          <Icon className={`w-6 h-6 mx-auto mb-2 ${active ? 'text-gold-400' : 'text-emerald-400'}`} />
                          <span className="text-cream text-sm font-medium">{label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <button onClick={goNext} disabled={!audience && !forKids}
                    className={`btn-gold w-full mt-8 ${!audience && !forKids ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    Continue <ChevronRight className="w-4 h-4 inline" />
                  </button>
                </div>
              )}

              {/* ── SERVICES ── */}
              {stepIndex === 'services' && (
                loadingCatalog ? (
                  <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 glass-card animate-pulse rounded-2xl" />)}</div>
                ) : services.length === 0 ? (
                  <p className="text-emerald-300 text-center py-8">Menu unavailable right now.</p>
                ) : (
                  <>
                    <h2 className="font-display text-3xl text-cream text-center mb-2">Choose Your Services</h2>
                    <p className="text-emerald-300 text-center mb-6 text-sm">Mix and match — book them all in one visit</p>
                    <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                      {services.map((svc) => {
                        const Icon = categoryIcons[svc.category] || Sparkles
                        const idx = picked.findIndex((p) => p.id === svc.id)
                        const isSelected = idx >= 0
                        const audienceMismatch = audience && svc.audience !== 'unisex' && svc.audience !== audience
                        const kidsMismatch = forKids && !svc.for_kids
                        const hidden = audienceMismatch || kidsMismatch
                        if (hidden) return null
                        return (
                          <button
                            key={svc.id}
                            onClick={() => {
                              if (isSelected) {
                                setPicked((p) => p.filter((x) => x.id !== svc.id))
                                setPicks((pk) => { const n = { ...pk }; delete n[svc.id]; return n })
                              } else {
                                setPicked((p) => [...p, svc])
                                setPicks((pk) => ({ ...pk, [svc.id]: pk[svc.id] || 'any' }))
                              }
                            }}
                            className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                              isSelected ? 'border-gold-500 bg-gold-500/10' : 'border-emerald-700 bg-emerald-900/40 hover:border-gold-500/50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Icon className={`w-5 h-5 shrink-0 ${isSelected ? 'text-gold-400' : 'text-emerald-400'}`} />
                              <span className="flex-1 min-w-0 text-cream font-medium text-sm">{svc.name}</span>
                              <span className="text-gold-400 font-semibold text-sm whitespace-nowrap">₹{svc.price}</span>
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-gold-400 shrink-0" />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    {/* Running total pill */}
                    {picked.length > 0 && (
                      <div className="mt-5 flex items-center justify-center gap-3 text-sm">
                        <span className="px-4 py-2 rounded-full bg-emerald-900/60 border border-gold-500/30 text-cream">
                          {picked.length} service{picked.length > 1 ? 's' : ''}
                        </span>
                        <span className="px-4 py-2 rounded-full bg-emerald-900/60 border border-gold-500/30 text-gold-400">
                          ~{picked.length} hr · ₹{picked.reduce((sum, p) => sum + p.price, 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                  </>
                )
              )}

              {/* ── STYLISTS (per-service) ── */}
              {stepIndex === 'stylists' && (
                <div>
                  <h2 className="font-display text-3xl text-cream text-center mb-2">Pick Your Stylists</h2>
                  <p className="text-emerald-300 text-center mb-8 text-sm">One choice per service — or leave it to us</p>
                  <div className="space-y-6">
                    {picked.map((svc) => {
                      const compatible = stylists.filter((s) => (s.categories || []).includes(svc.category))
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
                            {compatible.map((st) => {
                              const active = picks[svc.id] === String(st.id)
                              return (
                                <button
                                  key={st.id}
                                  onClick={() => setPicks((pk) => ({ ...pk, [svc.id]: String(st.id) }))}
                                  className={`px-3.5 py-2 rounded-full text-xs font-medium border transition-all duration-150 ${
                                    active ? 'bg-gold-gradient text-emerald-950 border-gold-400' : 'border-emerald-700 text-cream/80 hover:border-gold-500/50'
                                  }`}
                                >
                                  {st.name}
                                </button>
                              )
                            })}
                            {!forced && (
                              <button
                                onClick={() => setPicks((pk) => ({ ...pk, [svc.id]: 'any' }))}
                                className={`px-3.5 py-2 rounded-full text-xs font-medium border transition-all duration-150 ${
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
              {stepIndex === 'schedule' && (
                <div className="space-y-7">
                  <h2 className="font-display text-3xl text-cream text-center mb-2">Pick Date & Start Time</h2>
                  <p className="text-emerald-300 text-center text-sm -mt-4">
                    Your {picked.length} service{picked.length > 1 ? 's run back-to-back' : ' runs'} — about {picked.length} hour{picked.length > 1 ? 's' : ''} total
                  </p>

                  <div>
                    <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-3">Select Date</p>
                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
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
                          const fits = startIdx + picked.length <= ALL_SLOTS.length
                          const disabled = !fits
                          return (
                            <button
                              key={t}
                              disabled={disabled}
                              onClick={() => setStartTime(t)}
                              className={`py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                                startTime === t
                                  ? 'bg-gold-gradient text-emerald-950'
                                  : disabled
                                    ? 'bg-emerald-950 text-emerald-700 border border-emerald-800 cursor-not-allowed line-through opacity-50'
                                    : 'bg-emerald-900 text-cream border border-emerald-700 hover:border-gold-500/50'
                              }`}
                            >
                              {fmtTime(t)}
                            </button>
                          )
                        })}
                      </div>
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
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-gold-500/30 bg-emerald-900/40 p-5 space-y-2.5">
                      <p className="text-gold-400 text-xs uppercase tracking-widest mb-1">Your visit</p>
                      {resolution.plan.map(({ service, stylist, slotTime }, i) => (
                        <div key={service.id} className="flex items-center justify-between text-sm">
                          <span className="text-cream">{i + 1}. {service.name}</span>
                          <span className="text-emerald-300">{stylist.name} · {fmtTime(slotTime)}</span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </div>
              )}

              {/* ── CONFIRM ── */}
              {stepIndex === 'confirm' && (
                <div>
                  <h2 className="font-display text-3xl text-cream text-center mb-2">Confirm Booking</h2>
                  <p className="text-emerald-300 text-center text-sm mb-8">Review your visit details</p>
                  <div className="glass-card p-6 mb-6 space-y-4">
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
                      <span className="text-cream font-medium text-sm">{fmtTime(startTime)} · {picked.length} hr{picked.length > 1 ? 's' : ''}</span>
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
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          {step > 0 ? (
            <button onClick={goBack} className="btn-outline flex items-center gap-2">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : (<div />)}
          {step < steps.length - 1 ? (
            <button
              id="next-step-btn"
              onClick={goNext}
              disabled={!canNext()}
              className={`btn-gold flex items-center gap-2 transition-opacity ${!canNext() ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              id="confirm-booking-btn"
              onClick={handleSubmit}
              disabled={submitting || !user || !canConfirm()}
              className="btn-gold flex items-center gap-2"
            >
              {submitting ? 'Sending…' : user ? 'Confirm Booking' : 'Login to Book'}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {!user && steps[step] === 'confirm' && (
          <p className="text-center text-emerald-300 text-sm mt-4">
            Please <Link to="/login" className="text-gold-400 underline hover:text-gold-300">login</Link> or{' '}
            <Link to="/signup" className="text-gold-400 underline hover:text-gold-300">sign up</Link> to complete your booking.
          </p>
        )}
      </div>
    </div>
  )
}
