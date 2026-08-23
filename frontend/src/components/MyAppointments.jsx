import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Clock, User, Scissors, XCircle, CheckCircle2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../api/client'

const statusConfig = {
  confirmed: { label: 'Confirmed', color: 'text-emerald-400', bg: 'bg-emerald-900/50 border-emerald-700', Icon: CheckCircle2 },
  pending:   { label: 'Pending',   color: 'text-gold-400',    bg: 'bg-gold-500/10 border-gold-700',     Icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'text-red-400',     bg: 'bg-red-900/20 border-red-800',       Icon: XCircle },
}

function BookingCard({ booking, onCancel }) {
  const cfg = statusConfig[booking.status] || statusConfig.confirmed
  const StatusIcon = cfg.Icon

  const fmtDate = (d) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  const fmtTime = (t) => {
    const [h, m] = t.split(':').map(Number)
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  return (
    <div className={`glass-card p-6 border ${cfg.bg} transition-all duration-300 hover:shadow-lg`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Scissors className="w-4 h-4 text-gold-400" />
            <h3 className="font-display text-lg text-cream">{booking.service.name}</h3>
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-emerald-600">
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> {booking.stylist.name}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> {fmtDate(booking.date)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> {fmtTime(booking.time_slot)}
            </span>
          </div>
          {booking.notes && (
            <p className="text-emerald-700 text-xs mt-3 italic">"{booking.notes}"</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
            <StatusIcon className="w-3.5 h-3.5" />
            {cfg.label}
          </div>
          <span className="text-gold-400 font-semibold">₹{booking.service.price}</span>
          {booking.status === 'confirmed' && (
            <button
              onClick={() => onCancel(booking.id)}
              className="text-xs text-red-400 hover:text-red-300 transition-colors underline"
            >
              Cancel
            </button>
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

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

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
          {['all', 'confirmed', 'cancelled'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 capitalize ${
                filter === f ? 'bg-gold-gradient text-emerald-950' : 'glass-card text-emerald-600 hover:text-cream border border-emerald-700'
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
            <Calendar className="w-12 h-12 text-emerald-700 mx-auto mb-4" />
            <p className="font-display text-xl text-cream mb-2">No appointments found</p>
            <p className="text-emerald-600 text-sm mb-6">Book your first appointment today</p>
            <Link to="/book" className="btn-gold inline-block">Book Now</Link>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            {filtered.map(b => (
              <BookingCard key={b.id} booking={b} onCancel={handleCancel} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
