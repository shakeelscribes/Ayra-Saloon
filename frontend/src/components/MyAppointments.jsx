import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Clock, Scissors, XCircle, CheckCircle2, AlertCircle, CalendarPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../api/client'

const statusConfig = {
  confirmed:           { label: 'Confirmed',           color: 'text-emerald-400', bg: 'bg-emerald-900/50 border-emerald-700',    Icon: CheckCircle2 },
  pending:             { label: 'Pending approval',    color: 'text-amber-400',   bg: 'bg-amber-900/20 border-amber-800',        Icon: AlertCircle },
  awaiting_reschedule: { label: 'Reschedule proposed', color: 'text-violet-400',  bg: 'bg-violet-900/20 border-violet-800',      Icon: Calendar },
  declined:            { label: 'Declined',            color: 'text-red-400',     bg: 'bg-red-900/20 border-red-800',            Icon: XCircle },
  cancelled:           { label: 'Cancelled',           color: 'text-red-400',     bg: 'bg-red-900/20 border-red-800',            Icon: XCircle },
}

/* Kids services come in Boy/Girl variants that share one name — append the
   variant wherever a slot's service is listed as plain text. */
const svcLabel = (svc) => (svc?.kid_gender ? `${svc.name} (${svc.kid_gender[0].toUpperCase()}${svc.kid_gender.slice(1)})` : svc?.name)

function BookingCard({ booking, onCancel, onRespond }) {
  const cfg = statusConfig[booking.status] || statusConfig.confirmed
  const StatusIcon = cfg.Icon

  const fmtDate = (d) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

const fmtTime = (t) => {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  // Multi-slot shape: one row per service. Fall back to the legacy singular
  // fields for old snapshot bookings.
  const slots = booking.slots?.length ? booking.slots : []
  const total = slots.length
    ? slots.reduce((s, sl) => s + (sl.service?.price || 0), 0)
    : (booking.service?.price || 0)

  // Authenticated download — a plain link navigation can't send the Bearer
  // token, so we fetch the .ics as a blob and trigger a save instead.
  const downloadInvite = async () => {
    try {
      const { data } = await client.get(`/bookings/${booking.id}/calendar.ics`, { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'ayra-appointment.ics'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Could not download the calendar invite')
    }
  }

  return (
    <div className={`glass-card p-6 border ${cfg.bg} transition-all duration-300 hover:shadow-lg`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Scissors className="w-4 h-4 text-gold-400" />
            <h3 className="font-display text-lg text-cream">
              {slots.length > 1
                ? `${slots.length} services`
                : (svcLabel(slots[0]?.service) || booking.service?.name || 'Booking')}
            </h3>
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-emerald-300">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> {fmtDate(booking.date)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> {fmtTime(booking.time_slot)}
              {slots.length > 1 ? ` · ${slots.length} hrs` : ''}
            </span>
          </div>
          {slots.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-emerald-800/60 pt-3">
              {slots.map(sl => (
                <div key={sl.id} className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-gold-400 font-semibold w-14">{fmtTime(sl.time_slot)}</span>
                  <span className="text-cream">{svcLabel(sl.service) || 'Service'}</span>
                  <span className="flex items-center gap-1 text-emerald-300"><Scissors className="w-3 h-3" />{sl.stylist?.name || '—'}</span>
                  <span className="text-emerald-300 ml-auto">₹{sl.service?.price}</span>
                </div>
              ))}
            </div>
          )}
          {booking.status === 'awaiting_reschedule' && booking.proposed_date && (
            <div className="mt-3 rounded-xl border border-violet-800/50 bg-violet-900/10 p-3.5">
              <p className="text-violet-300 text-xs mb-1.5">Salon proposed moving your visit:</p>
              <p className="text-sm">
                <span className="text-emerald-500 line-through">{fmtDate(booking.date)} · {fmtTime(booking.time_slot)}</span>
                <span className="text-violet-300 mx-2">→</span>
                <span className="text-cream font-medium">{fmtDate(booking.proposed_date)} · {fmtTime(booking.proposed_time_slot)}</span>
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => onRespond(booking.id, true)}
                  className="btn-gold !px-4 !py-1.5 text-xs"
                >
                  Accept
                </button>
                <button
                  onClick={() => onRespond(booking.id, false)}
                  className="btn-outline !px-4 !py-1.5 text-xs"
                >
                  Decline
                </button>
              </div>
            </div>
          )}
          {booking.notes && (
            <p className="text-emerald-400 text-xs mt-3 italic">"{booking.notes}"</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {cfg.label}
          </div>
          <span className="text-gold-400 font-semibold">₹{total.toLocaleString('en-IN')}</span>
          {(booking.status === 'confirmed' || booking.status === 'awaiting_reschedule') && (
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={downloadInvite}
                className="text-xs text-emerald-300 hover:text-gold-400 transition-colors inline-flex items-center gap-1.5"
                title="Download the calendar invite (.ics)"
              >
                <CalendarPlus className="w-3.5 h-3.5" /> Add to calendar
              </button>
              <button
                onClick={() => onCancel(booking.id)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors underline"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MyAppointments() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const fetchBookings = async () => {
    try {
      const { data } = await client.get('/bookings/me')
      setBookings(data)
    } catch {
      toast.error('Could not load appointments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchBookings() }, [])

  const handleCancel = async (id) => {
    if (!confirm('Cancel this appointment?')) return
    try {
      await client.delete(`/bookings/${id}`)
      toast.success('Appointment cancelled')
      fetchBookings()
    } catch {
      toast.error('Could not cancel booking')
    }
  }

  const handleRespond = async (id, accept) => {
    if (!accept && !confirm('Decline the proposed time? The booking request will be closed.')) return
    try {
      await client.post(`/bookings/${id}/${accept ? 'accept' : 'decline'}-reschedule`)
      toast.success(accept ? 'Reschedule accepted' : 'Reschedule declined')
      fetchBookings()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not update reschedule')
    }
  }

  const filtered = filter === 'all'
    ? bookings
    : bookings.filter(b => b.status === (filter === 'reschedule' ? 'awaiting_reschedule' : filter))

  return (
    <div className="min-h-screen pt-24 pb-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-2">Your Schedule</p>
          <h1 className="font-display text-4xl text-cream">My Appointments</h1>
          <div className="gold-divider" />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 justify-center mb-8 flex-wrap">
          {['all', 'pending', 'confirmed', 'reschedule', 'declined', 'cancelled'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 capitalize ${
                filter === f ? 'bg-gold-gradient text-emerald-950' : 'glass-card text-emerald-300 hover:text-cream border border-emerald-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="glass-card h-32 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Calendar className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <p className="font-display text-xl text-cream mb-2">No appointments found</p>
            <p className="text-emerald-300 text-sm mb-6">Book your first appointment today</p>
            <Link to="/book" className="btn-gold inline-block">Book Now</Link>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            {filtered.map(b => (
              <BookingCard key={b.id} booking={b} onCancel={handleCancel} onRespond={handleRespond} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
