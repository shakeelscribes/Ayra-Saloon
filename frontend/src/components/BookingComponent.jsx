import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  Scissors, User, Calendar, Clock, CheckCircle2,
  ChevronRight, ChevronLeft, ArrowRight, Sparkles, Crown, Wind, Palette, Droplets
} from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

const STEPS = ['Service', 'Stylist & Time', 'Confirm']

const categoryIcons = {
  hair: Scissors, grooming: Wind, bridal: Crown,
  color: Palette, treatment: Droplets, general: Sparkles,
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
            <span className={`text-xs font-medium hidden sm:block ${i === current ? 'text-gold-400' : 'text-emerald-600'}`}>
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
function ServiceStep({ services, selected, onSelect }) {
  return (
    <div className="animate-slide-up">
      <h2 className="font-display text-3xl text-cream text-center mb-2">Choose a Service</h2>
      <p className="text-emerald-600 text-center mb-8 text-sm">Select the treatment you'd like to experience</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {services.map((svc) => {
          const Icon = categoryIcons[svc.category] || Sparkles
          const isSelected = selected?.id === svc.id
          return (
            <button
              key={svc.id}
              id={`service-${svc.id}`}
              onClick={() => onSelect(svc)}
              className={`text-left p-5 rounded-2xl border transition-all duration-300 ${
                isSelected
                  ? 'border-gold-500 bg-gold-500/10 shadow-lg shadow-gold-500/10'
                  : 'border-emerald-700 bg-emerald-900/40 hover:border-gold-500/50 hover:bg-emerald-900/70'
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
                  <p className="text-emerald-600 text-xs mt-1 leading-relaxed">{svc.description}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-gold-400 font-semibold">₹{svc.price}</span>
                    <span className="text-emerald-700 text-xs">•</span>
                    <span className="text-emerald-600 text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />{svc.duration_mins} min
                    </span>
                  </div>
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
function ScheduleStep({ stylists, selectedStylist, setSelectedStylist, date, setDate, timeSlot, setTimeSlot }) {
  const [availability, setAvailability] = useState({ available_slots: [], booked_slots: [] })
  const [loadingSlots, setLoadingSlots] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const fetchSlots = useCallback(async (stylistId, d) => {
    if (!stylistId || !d) return
    setLoadingSlots(true)
    try {
      const { data } = await client.get(`/availability/?stylist_id=${stylistId}&date=${d}`)
      setAvailability(data)
    } catch {
      toast.error('Could not load availability')
    } finally {
      setLoadingSlots(false)
    }
  }, [])

  useEffect(() => {
    fetchSlots(selectedStylist?.id, date)
  }, [selectedStylist, date, fetchSlots])

  const formatSlot = (slot) => {
    const [h, m] = slot.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`
  }

  return (
    <div className="animate-slide-up space-y-8">
      <div className="text-center">
        <h2 className="font-display text-3xl text-cream mb-2">Pick Your Stylist & Time</h2>
        <p className="text-emerald-600 text-sm">Choose an expert and your preferred schedule</p>
      </div>

      {/* Stylist selection */}
      <div>
        <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-3">Select Stylist</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {stylists.map((st) => (
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
              <p className="text-emerald-600 text-xs mt-1">{st.speciality}</p>
              <p className="text-gold-400 text-xs mt-1">{st.experience_years} yrs exp.</p>
            </button>
          ))}
        </div>
      </div>

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
      {selectedStylist && date && (
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
              {availability.available_slots.map((slot) => (
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
              {availability.booked_slots.map((slot) => (
                <button
                  key={slot}
                  disabled
                  className="py-2.5 rounded-xl text-sm font-medium bg-emerald-950 text-emerald-700 border border-emerald-800 cursor-not-allowed line-through"
                >
                  {formatSlot(slot)}
                </button>
              ))}
              {availability.available_slots.length === 0 && availability.booked_slots.length === 0 && (
                <p className="text-emerald-600 col-span-5 text-sm">No slots available for this date.</p>
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
    { label: 'Stylist', value: stylist?.name },
    { label: 'Date', value: new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
    { label: 'Time', value: formatSlot(timeSlot) },
  ]

  return (
    <div className="animate-slide-up">
      <h2 className="font-display text-3xl text-cream text-center mb-2">Confirm Booking</h2>
      <p className="text-emerald-600 text-center text-sm mb-8">Review your appointment details</p>

      <div className="glass-card p-6 mb-6 space-y-4">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center border-b border-emerald-800 pb-3 last:border-0 last:pb-0">
            <span className="text-emerald-600 text-sm">{label}</span>
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

  const [step, setStep] = useState(0)
  const [services, setServices] = useState([])
  const [stylists, setStylists] = useState([])
  const [selectedService, setSelectedService] = useState(null)
  const [selectedStylist, setSelectedStylist] = useState(null)
  const [date, setDate] = useState('')
  const [timeSlot, setTimeSlot] = useState(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Fetch services & stylists
  useEffect(() => {
    Promise.all([client.get('/services/'), client.get('/stylists/')]).then(([s, st]) => {
      setServices(s.data)
      setStylists(st.data)
      if (preselectedServiceId) {
        const found = s.data.find((sv) => sv.id === parseInt(preselectedServiceId))
        if (found) { setSelectedService(found); setStep(1) }
      }
    })
  }, [preselectedServiceId])

  const canNext = () => {
    if (step === 0) return !!selectedService
    if (step === 1) return !!selectedStylist && !!date && !!timeSlot
    return true
  }

  const handleSubmit = async () => {
    if (!user) { navigate('/login'); return }
    setSubmitting(true)
    try {
      await client.post('/bookings/', {
        service_id: selectedService.id,
        stylist_id: selectedStylist.id,
        date,
        time_slot: timeSlot,
        notes,
      })
      setSuccess(true)
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
        <div className="glass-card max-w-md w-full p-10 text-center animate-fade-in">
          <div className="w-20 h-20 rounded-full bg-gold-gradient flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-950" />
          </div>
          <h2 className="font-display text-3xl text-cream mb-3">Booking Confirmed!</h2>
          <p className="text-emerald-600 mb-2">
            Your appointment with <span className="text-cream">{selectedStylist?.name}</span> for{' '}
            <span className="text-cream">{selectedService?.name}</span> is confirmed.
          </p>
          <p className="text-gold-400 text-sm mb-8">
            {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at {timeSlot}
          </p>
          <div className="flex flex-col gap-3">
            <Link to="/my-appointments" className="btn-gold text-center">View My Appointments</Link>
            <Link to="/" className="btn-outline text-center">Back to Home</Link>
          </div>
        </div>
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

        <div className="glass-card p-6 sm:p-8 mb-8">
          {step === 0 && (
            <ServiceStep services={services} selected={selectedService} onSelect={(s) => { setSelectedService(s); }} />
          )}
          {step === 1 && (
            <ScheduleStep
              stylists={stylists}
              selectedStylist={selectedStylist}
              setSelectedStylist={setSelectedStylist}
              date={date} setDate={setDate}
              timeSlot={timeSlot} setTimeSlot={setTimeSlot}
            />
          )}
          {step === 2 && (
            <ConfirmStep
              service={selectedService} stylist={selectedStylist}
              date={date} timeSlot={timeSlot}
              notes={notes} setNotes={setNotes}
            />
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between items-center">
          {step > 0 ? (
            <button onClick={() => setStep(s => s - 1)} className="btn-outline flex items-center gap-2">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <div />
          )}
          {step < 2 ? (
            <button
              id="next-step-btn"
              onClick={() => setStep(s => s + 1)}
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
          <p className="text-center text-emerald-600 text-sm mt-4">
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
