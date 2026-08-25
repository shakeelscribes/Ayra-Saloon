import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Scissors, User, Calendar, Clock, CheckCircle2,
  ChevronRight, ChevronLeft, ArrowRight, Sparkles, Crown, Palette, Droplets,
  RefreshCcw, Phone, Flower2, SprayCan, PenTool
} from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

const STEPS = ['Service', 'Stylist & Time', 'Confirm']
const EASE_OUT = [0.16, 1, 0.3, 1]

const categoryIcons = {
  hair: Scissors, grooming: SprayCan, bridal: Crown,
  colour: Palette, spa: Droplets, facial: Flower2,
  tattoo: PenTool, general: Sparkles,
}

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={`step-dot ${i < current ? 'completed' : i === current ? 'active' : 'inactive'}`}>
              {i < current ? <CheckCircle2 className="w-5 h-5" /> : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${i === current ? 'text-gold-400' : 'text-emerald-300'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-16 sm:w-24 h-px mx-2 mb-4 transition-colors duration-300 ${i < current ? 'bg-gold-500' : 'bg-emerald-800'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Step 1 : Choose Service ───────────────────────────────────────────────────
function ServiceStep({ services, selected, onSelect, lockedStylist, allStylists }) {
  return (
    <div>
      <h2 className="font-display text-3xl text-cream text-center mb-2">Choose a Service</h2>
      <p className="text-emerald-300 text-center mb-8 text-sm">
        {lockedStylist
          ? `Booking with ${lockedStylist.name} — pick what they'll do for you`
          : "Select the treatment you'd like to experience"}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {services.map((svc) => {
          const Icon = categoryIcons[svc.category] || Sparkles
          const isSelected = selected?.id === svc.id
          const handledByLocked = !lockedStylist || (lockedStylist.categories || []).includes(svc.category)
          // Guided swap: when the locked stylist can't do this service, find who can
          const swapTarget = !handledByLocked
            ? allStylists.find((s) => (s.categories || []).includes(svc.category))
            : null

          return (
            <button
              key={svc.id}
              id={`service-${svc.id}`}
              onClick={() => onSelect(svc)}
              className={`text-left p-5 rounded-2xl border transition-all duration-300 ${
                isSelected
                  ? 'border-gold-500 bg-gold-500/10 shadow-lg shadow-gold-500/10'
                  : handledByLocked
                    ? 'border-emerald-700 bg-emerald-900/40 hover:border-gold-500/50 hover:bg-emerald-900/70'
                    : 'border-dashed border-gold-500/40 bg-emerald-900/20 hover:border-gold-500/70'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isSelected ? 'bg-gold-gradient' : 'bg-emerald-800'
                }`}>
                  <Icon className={`w-5 h-5 ${isSelected ? 'text-emerald-950' : 'text-gold-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-cream">{svc.name}</h3>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-gold-400 flex-shrink-0" />}
                  </div>
                  <p className="text-emerald-300 text-xs mt-1 leading-relaxed">{svc.description}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-gold-400 font-semibold">₹{svc.price}</span>
                    <span className="text-emerald-400 text-xs">•</span>
                    <span className="text-emerald-300 text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />{svc.duration_mins} min
                    </span>
                  </div>
                  {/* Guided swap badge — service belongs to another stylist */}
                  {!handledByLocked && swapTarget && (
                    <span className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold-500/15 border border-gold-500/40 text-gold-300 text-[11px]">
                      <RefreshCcw className="w-3 h-3" aria-hidden="true" />
                      Done by {swapTarget.name} — tap to switch stylist
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 2 : Stylist, Date & Time ─────────────────────────────────────────────
function ScheduleStep({
  compatibleStylists, selectedStylist, setSelectedStylist,
  stylistLocked, onUnlockStylist,
  noPreference, setNoPreference,
  date, setDate, timeSlot, setTimeSlot,
  slotOwnerRef, selectedService,
}) {
  const [availability, setAvailability] = useState({ available: [], booked: [] })
  const [loadingSlots, setLoadingSlots] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const isBridal = selectedService?.category === 'bridal'

  // Merged availability: "No preference" queries every compatible stylist in
  // parallel and unions the results; a slot is offered if anyone is free, and
  // we remember WHO owns each slot so submit books a real person.
  useEffect(() => {
    if (!date || isBridal) return
    const targets = noPreference ? compatibleStylists : (selectedStylist ? [selectedStylist] : [])
    if (targets.length === 0) return

    let cancelled = false
    setLoadingSlots(true)

    Promise.all(
      targets.map((t) =>
        client.get(`/availability/?stylist_id=${t.id}&date=${date}`)
          .then((r) => r.data)
          .catch(() => ({ available_slots: [], booked_slots: [] }))
      )
    ).then((results) => {
      if (cancelled) return
      const ownerMap = {}
      const allSlots = new Set()
      results.forEach((res, idx) => {
        res.available_slots?.forEach((slot) => {
          allSlots.add(slot)
          if (!ownerMap[slot]) ownerMap[slot] = targets[idx]
        })
        res.booked_slots?.forEach((slot) => allSlots.add(slot))
      })
      slotOwnerRef.current = ownerMap
      const ordered = [...allSlots].sort()
      setAvailability({
        available: ordered.filter((s) => ownerMap[s]),
        booked: ordered.filter((s) => !ownerMap[s]),
      })
    }).finally(() => {
      if (!cancelled) setLoadingSlots(false)
    })

    return () => { cancelled = true }
  }, [noPreference, selectedStylist, selectedService, compatibleStylists, date, isBridal])

  const formatSlot = (slot) => {
    const [h, m] = slot.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`
  }

  // Bridal: partner artists handle it outside the online flow
  if (isBridal) {
    return (
      <div className="space-y-6 text-center py-8">
        <div className="w-16 h-16 rounded-full bg-gold-gradient flex items-center justify-center mx-auto">
          <Crown className="w-8 h-8 text-emerald-950" />
        </div>
        <h2 className="font-display text-3xl text-cream">Bridal is a conversation</h2>
        <p className="text-cream/70 text-sm max-w-md mx-auto leading-relaxed">
          Our partner bridal artists take bookings through a personal
          consultation so your trial and big-day looks are planned properly.
        </p>
        <a href="tel:+918270606750" className="btn-gold inline-flex items-center gap-2">
          <Phone className="w-4 h-4" aria-hidden="true" />
          Call +91 82706 06750
        </a>
        <p className="text-emerald-300 text-xs">Consultations are free · Open all week, 10 AM – 9 PM</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="font-display text-3xl text-cream mb-2">Pick Your Stylist & Time</h2>
        <p className="text-emerald-300 text-sm">
          {selectedService
            ? `Who should do your ${selectedService.name.toLowerCase()}?`
            : 'Choose an expert and your preferred schedule'}
        </p>
      </div>

      {/* Soft-lock chip */}
      {stylistLocked && selectedStylist && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold-500/10 border border-gold-500/40 text-gold-300 text-sm">
            <User className="w-4 h-4" aria-hidden="true" />
            {selectedStylist.name} — your stylist
          </span>
          <button
            onClick={onUnlockStylist}
            className="inline-flex items-center gap-1.5 text-xs text-emerald-500 hover:text-gold-400 transition-colors duration-200 underline underline-offset-4"
          >
            <RefreshCcw className="w-3 h-3" aria-hidden="true" />
            Change stylist
          </button>
        </div>
      )}

      {/* Stylist selection */}
      {!noPreference && (
        <div>
          {!stylistLocked && (
            <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-3">Select Stylist</p>
          )}
          <div className={`grid gap-3 ${compatibleStylists.length > 1 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1'}`}>
            {compatibleStylists.map((st) => (
              <button
                key={st.id}
                id={`stylist-${st.id}`}
                onClick={() => { setSelectedStylist(st); setTimeSlot(null) }}
                className={`p-4 rounded-2xl border text-left transition-all duration-300 ${
                  selectedStylist?.id === st.id
                    ? 'border-gold-500 bg-gold-500/10'
                    : 'border-emerald-700 bg-emerald-900/40 hover:border-gold-500/40'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-emerald-800 flex items-center justify-center mb-3">
                  <User className="w-5 h-5 text-gold-400" />
                </div>
                <p className="font-semibold text-cream text-sm">{st.name}</p>
                <p className="text-emerald-300 text-xs mt-1">{st.speciality}</p>
                <p className="text-gold-400 text-xs mt-1">{st.experience_years} yrs exp.</p>
              </button>
            ))}
          </div>

          {/* No preference option */}
          {compatibleStylists.length > 1 && (
            <button
              onClick={() => { setNoPreference(true); setSelectedStylist(null); setTimeSlot(null) }}
              className={`mt-3 w-full p-4 rounded-2xl border text-left transition-all duration-300 inline-flex items-center gap-4 ${
                noPreference
                  ? 'border-gold-500 bg-gold-500/10'
                  : 'border-dashed border-emerald-700 bg-emerald-900/20 hover:border-gold-500/50'
              }`}
            >
              <span className="w-10 h-10 rounded-full bg-emerald-800 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-gold-400" aria-hidden="true" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-cream text-sm">No preference</span>
                <span className="block text-emerald-300 text-xs mt-0.5">
                  Book the first available chair for your slot
                </span>
              </span>
              {noPreference && <CheckCircle2 className="w-4 h-4 text-gold-400 flex-shrink-0" />}
            </button>
          )}
        </div>
      )}

      {/* No-preference confirmation chip */}
      {noPreference && (
        <div className="flex items-center justify-between gap-3 flex-wrap p-4 rounded-2xl border border-gold-500/40 bg-gold-500/10">
          <span className="inline-flex items-center gap-2 text-gold-300 text-sm">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            First available chair — we'll match you on the day
          </span>
          <button
            onClick={() => { setNoPreference(false); setTimeSlot(null); slotOwnerRef.current = {} }}
            className="inline-flex items-center gap-1.5 text-xs text-emerald-500 hover:text-gold-400 transition-colors duration-200 underline underline-offset-4"
          >
            <RefreshCcw className="w-3 h-3" aria-hidden="true" />
            Pick a specific stylist instead
          </button>
        </div>
      )}

      {/* Date picker */}
      <div>
        <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-3">Select Date</p>
        <input
          type="date"
          id="booking-date"
          min={today}
          value={date}
          onChange={(e) => { setDate(e.target.value); setTimeSlot(null) }}
          className="luxury-input max-w-xs"
        />
      </div>

      {/* Time slots */}
      {(noPreference || selectedStylist) && date && (
        <div>
          <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-3">Select Time Slot</p>
          {loadingSlots ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 rounded-xl bg-emerald-900 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {availability.available.map((slot) => (
                <button
                  key={slot}
                  id={`slot-${slot}`}
                  onClick={() => setTimeSlot(slot)}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    timeSlot === slot
                      ? 'bg-gold-gradient text-emerald-950'
                      : 'bg-emerald-900 text-cream border border-emerald-700 hover:border-gold-500/50'
                  }`}
                >
                  {formatSlot(slot)}
                </button>
              ))}
              {availability.booked.map((slot) => (
                <button
                  key={slot}
                  disabled
                  className="py-2.5 rounded-xl text-sm font-medium bg-emerald-950 text-emerald-400 border border-emerald-800 cursor-not-allowed line-through"
                >
                  {formatSlot(slot)}
                </button>
              ))}
              {availability.available.length === 0 && availability.booked.length === 0 && (
                <p className="text-emerald-300 col-span-5 text-sm">No slots available for this date.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 3 : Confirm ──────────────────────────────────────────────────────────
function ConfirmStep({ service, stylist, date, timeSlot, notes, setNotes }) {
  const formatSlot = (slot) => {
    const [h, m] = slot.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${period}`
  }

  const rows = [
    { label: 'Service', value: service?.name },
    { label: 'Price', value: `₹${service?.price}` },
    { label: 'Duration', value: `${service?.duration_mins} minutes` },
    { label: 'Stylist', value: stylist ? stylist.name : 'First available chair' },
    { label: 'Date', value: new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
    { label: 'Time', value: formatSlot(timeSlot) },
  ]

  return (
    <div>
      <h2 className="font-display text-3xl text-cream text-center mb-2">Confirm Booking</h2>
      <p className="text-emerald-300 text-center text-sm mb-8">Review your appointment details</p>

      <div className="glass-card p-6 mb-6 space-y-4">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center border-b border-emerald-800 pb-3 last:border-0 last:pb-0">
            <span className="text-emerald-300 text-sm">{label}</span>
            <span className="text-cream font-medium text-sm">{value}</span>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <label className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">
          Special Requests (optional)
        </label>
        <textarea
          id="booking-notes"
          rows={3}
          placeholder="Any preferences or special instructions..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="luxury-input resize-none"
        />
      </div>
    </div>
  )
}

// ── Main BookingComponent ─────────────────────────────────────────────────────
export default function BookingComponent() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedServiceId = searchParams.get('service')
  const preselectedStylistName = searchParams.get('stylist')

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1) // 1 = forward, -1 = back
  const [services, setServices] = useState([])
  const [stylists, setStylists] = useState([])
  const [selectedService, setSelectedService] = useState(null)
  const [selectedStylist, setSelectedStylist] = useState(null)
  const [stylistLocked, setStylistLocked] = useState(false)
  const [noPreference, setNoPreference] = useState(false)
  const [date, setDate] = useState('')
  const [timeSlot, setTimeSlot] = useState(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  // "No preference" mode: maps each open slot -> the stylist who owns it
  const slotOwnerRef = useRef({})

  // Fetch services & stylists
  useEffect(() => {
    Promise.all([client.get('/services/'), client.get('/stylists/')]).then(([s, st]) => {
      setServices(s.data)
      setStylists(st.data)
      if (preselectedServiceId) {
        const found = s.data.find((sv) => sv.id === parseInt(preselectedServiceId))
        if (found) { setSelectedService(found); setDirection(1); setStep(1) }
      }
      if (preselectedStylistName) {
        const match = st.data.find(
          (sy) => sy.name.toLowerCase() === preselectedStylistName.toLowerCase()
        )
        if (match) { setSelectedStylist(match); setStylistLocked(true) }
      }
    })
  }, [preselectedServiceId, preselectedStylistName])

  /* Stylists who can perform the chosen service's category */
  const compatibleStylists = useMemo(() => {
    if (!selectedService) return stylists
    return stylists.filter((s) => (s.categories || []).includes(selectedService.category))
  }, [stylists, selectedService])

  /* The real person behind the booking: explicit pick, or the owner of the
     chosen slot in no-preference mode */
  const resolvedStylist =
    noPreference && timeSlot ? slotOwnerRef.current[timeSlot] || null : selectedStylist

  /* Guided swap: selecting a service your locked stylist doesn't do switches
     the lock to someone who does — the badge on the card explains it upfront */
  const handleServiceSelect = (svc) => {
    if (stylistLocked && selectedStylist && !(selectedStylist.categories || []).includes(svc.category)) {
      const swap = stylists.find((s) => (s.categories || []).includes(svc.category))
      if (swap) setSelectedStylist(swap)
    }
    setSelectedService(svc)
    setTimeSlot(null)
    slotOwnerRef.current = {}
  }

  const canNext = () => {
    if (step === 0) return !!selectedService
    if (step === 1) return !!date && !!timeSlot && (noPreference || !!resolvedStylist)
    return true
  }

  const handleSubmit = async () => {
    if (!user) { navigate('/login'); return }
    if (!resolvedStylist) return
    setSubmitting(true)
    try {
      await client.post('/bookings/', {
        service_id: selectedService.id,
        stylist_id: resolvedStylist.id,
        date,
        time_slot: timeSlot,
        notes,
      })
      setSuccess(true)
      // Haptic tick on the commit moment — Android only, silent elsewhere
      if ('vibrate' in navigator) navigator.vibrate(20)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Booking failed. Please try again.'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // Success screen
  if (success) {
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
          <h2 className="font-display text-3xl text-cream mb-3">Booking Confirmed!</h2>
          <p className="text-emerald-300 mb-2">
            Your appointment with <span className="text-cream">{resolvedStylist?.name || 'our first available stylist'}</span> for{' '}
            <span className="text-cream">{selectedService?.name}</span> is confirmed.
          </p>
          <p className="text-gold-400 text-sm mb-8">
            {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at {timeSlot}
          </p>
          <div className="flex flex-col gap-3">
            <Link to="/my-appointments" className="btn-gold text-center">View My Appointments</Link>
            <Link to="/" className="btn-outline text-center">Back to Home</Link>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-2">Reservation</p>
          <h1 className="font-display text-4xl text-cream">Book Your Visit</h1>
          <div className="gold-divider" />
        </div>

        <StepIndicator current={step} />

        <div className="glass-card p-6 sm:p-8 mb-8 overflow-hidden">
          {/* Direction-aware entrance: forward slides in from the right,
              Back reverses the path (apple-design §7) */}
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 28 * direction }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
          {step === 0 && (
            <ServiceStep
              services={services}
              selected={selectedService}
              onSelect={handleServiceSelect}
              lockedStylist={stylistLocked ? selectedStylist : null}
              allStylists={stylists}
            />
          )}
          {step === 1 && (
            <ScheduleStep
              compatibleStylists={compatibleStylists}
              selectedService={selectedService}
              selectedStylist={selectedStylist}
              setSelectedStylist={(st) => { setSelectedStylist(st); setTimeSlot(null); slotOwnerRef.current = {} }}
              stylistLocked={stylistLocked}
              onUnlockStylist={() => setStylistLocked(false)}
              noPreference={noPreference}
              setNoPreference={setNoPreference}
              date={date} setDate={(d) => { setDate(d); setTimeSlot(null); slotOwnerRef.current = {} }}
              timeSlot={timeSlot} setTimeSlot={setTimeSlot}
              slotOwnerRef={slotOwnerRef}
            />
          )}
          {step === 2 && (
            <ConfirmStep
              service={selectedService} stylist={resolvedStylist}
              date={date} timeSlot={timeSlot}
              notes={notes} setNotes={setNotes}
            />
          )}
          </motion.div>
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between items-center">
          {step > 0 ? (
            <button onClick={() => { setDirection(-1); setStep(s => s - 1) }} className="btn-outline flex items-center gap-2">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <div />
          )}
          {step < 2 ? (
            <button
              id="next-step-btn"
              onClick={() => { setDirection(1); setStep(s => s + 1) }}
              disabled={!canNext()}
              className={`btn-gold flex items-center gap-2 transition-opacity ${!canNext() ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              id="confirm-booking-btn"
              onClick={handleSubmit}
              disabled={submitting || !user}
              className="btn-gold flex items-center gap-2"
            >
              {submitting ? 'Confirming…' : user ? 'Confirm Booking' : 'Login to Book'}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {!user && step === 2 && (
          <p className="text-center text-emerald-300 text-sm mt-4">
            Please{' '}
            <Link to="/login" className="text-gold-400 underline hover:text-gold-300">login</Link>
            {' '}or{' '}
            <Link to="/signup" className="text-gold-400 underline hover:text-gold-300">sign up</Link>
            {' '}to complete your booking.
          </p>
        )}
      </div>
    </div>
  )
}
