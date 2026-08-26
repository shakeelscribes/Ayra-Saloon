import { useEffect, useState } from 'react'
import { Calendar, Clock, User, Scissors, TrendingUp, Users, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../../api/client'

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="glass-card p-6">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${color}`}>
        <Icon className="w-5 h-5 text-cream" />
      </div>
      <p className="font-display text-3xl text-cream mb-1">{value}</p>
      <p className="text-emerald-300 text-sm">{label}</p>
    </div>
  )
}

export default function AdminDashboard() {
  const [bookings, setBookings] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])

  const fetchBookings = async (date) => {
    setLoading(true)
    try {
      const { data } = await client.get(`/bookings/admin/all${date ? `?date=${date}` : ''}`)
      setBookings(data)
    } catch {
      toast.error('Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }

  // Pending queue always spans all dates — these need action regardless of day
  const fetchPending = async () => {
    try {
      const { data } = await client.get('/bookings/admin/all')
      setPending(data.filter(b => b.status === 'pending'))
    } catch {
      /* silent — main list shows the error state */
    }
  }

  useEffect(() => { fetchBookings(selectedDate) }, [selectedDate])
  useEffect(() => { fetchPending() }, [])

  const refreshAll = () => { fetchBookings(selectedDate); fetchPending() }

  const handleApprove = async (id) => {
    try {
      await client.post(`/bookings/${id}/approve`)
      toast.success('Booking approved')
      refreshAll()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not approve')
    }
  }

  const handleDecline = async (id) => {
    if (!confirm('Decline this booking request?')) return
    try {
      await client.post(`/bookings/${id}/decline`)
      toast.success('Booking declined')
      refreshAll()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not decline')
    }
  }

  const handleCancel = async (id) => {
    if (!confirm('Cancel this booking?')) return
    try {
      await client.delete(`/bookings/${id}`)
      toast.success('Booking cancelled')
      refreshAll()
    } catch {
      toast.error('Could not cancel booking')
    }
  }

  const confirmed = bookings.filter(b => b.status === 'confirmed')
  const cancelled = bookings.filter(b => b.status === 'cancelled')

  const fmtTime = (t) => {
    if (!t) return '—'
    const [h, m] = t.split(':').map(Number)
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  // Group confirmed bookings by time
  const timeline = [...confirmed].sort((a, b) => a.time_slot.localeCompare(b.time_slot))

  return (
    <div className="min-h-screen pt-24 pb-16 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-2">Admin Panel</p>
          <h1 className="font-display text-4xl text-cream">Daily Dashboard</h1>
          <div className="w-20 h-0.5 mt-4" style={{ background: 'linear-gradient(90deg, #c9a84c, transparent)' }} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
          <StatCard icon={TrendingUp} label="Total Bookings" value={bookings.length + pending.length} color="bg-emerald-800" />
          <StatCard icon={AlertCircle} label="Pending Approval" value={pending.length} color="bg-amber-700" />
          <StatCard icon={CheckCircle2} label="Confirmed" value={confirmed.length} color="bg-emerald-700" />
          <StatCard icon={XCircle} label="Cancelled" value={cancelled.length} color="bg-red-900" />
          <StatCard icon={Users} label="Revenue (est.)" value={`₹${confirmed.reduce((s, b) => s + b.service.price, 0).toLocaleString('en-IN')}`} color="bg-gold-600" />
        </div>

        {/* Date picker */}
        <div className="glass-card p-5 mb-8 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-gold-400">
            <Calendar className="w-5 h-5" />
            <span className="font-medium text-sm">Filter by Date</span>
          </div>
          <input
            type="date"
            id="admin-date-filter"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="luxury-input max-w-xs"
          />
          <button
            onClick={() => { setSelectedDate(''); fetchBookings('') }}
            className="text-sm text-emerald-300 hover:text-gold-400 transition-colors underline"
          >
            View All
          </button>
        </div>

        {/* Pending approval queue — always visible, all dates */}
        {pending.length > 0 && (
          <div className="mb-10">
            <h2 className="font-display text-xl text-cream mb-5 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              Pending Approval
              <span className="text-xs bg-amber-900/30 text-amber-400 px-2.5 py-1 rounded-full border border-amber-800">
                {pending.length} awaiting action
              </span>
            </h2>
            <div className="space-y-3">
              {pending.map(b => (
                <div key={b.id} className="glass-card p-4 border border-amber-800/50">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="text-center min-w-[60px]">
                        <p className="text-amber-400 font-semibold text-sm">{fmtTime(b.time_slot)}</p>
                        <p className="text-emerald-300 text-xs">{b.date}</p>
                      </div>
                      <div className="w-px h-10 bg-emerald-700" />
                      <div>
                        <p className="text-cream font-medium text-sm">{b.service?.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-emerald-300">
                          <span className="flex items-center gap-1"><User className="w-3 h-3" />{b.customer_name || 'Customer'}</span>
                          <span className="flex items-center gap-1"><Scissors className="w-3 h-3" />{b.stylist?.name}</span>
                          <span>₹{b.service?.price}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApprove(b.id)}
                        className="btn-gold !px-4 !py-2 text-xs"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleDecline(b.id)}
                        className="btn-outline !px-4 !py-2 text-xs"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Schedule timeline */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Timeline */}
          <div className="lg:col-span-2">
            <h2 className="font-display text-xl text-cream mb-5 flex items-center gap-2">
              <Clock className="w-5 h-5 text-gold-400" /> Schedule
            </h2>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => <div key={i} className="glass-card h-20 animate-pulse" />)}
              </div>
            ) : timeline.length === 0 ? (
              <div className="glass-card p-10 text-center text-emerald-300">
                <Scissors className="w-8 h-8 mx-auto mb-3 text-emerald-400" />
                No confirmed bookings for this day.
              </div>
            ) : (
              <div className="space-y-3">
                {timeline.map(b => (
                  <div key={b.id} className="glass-card p-4 border border-emerald-800 hover:border-gold-500/40 transition-all duration-200">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <div className="text-center min-w-[60px]">
                          <p className="text-gold-400 font-semibold text-sm">{fmtTime(b.time_slot)}</p>
                        </div>
                        <div className="w-px h-10 bg-emerald-700" />
                        <div>
                          <p className="text-cream font-medium text-sm">{b.service.name}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-emerald-300">
                            <span className="flex items-center gap-1"><User className="w-3 h-3" />{b.stylist.name}</span>
                            <span>₹{b.service.price}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancel(b.id)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stylist load */}
          <div>
            <h2 className="font-display text-xl text-cream mb-5 flex items-center gap-2">
              <Scissors className="w-5 h-5 text-gold-400" /> Stylist Load
            </h2>
            <div className="space-y-3">
              {Object.entries(
                confirmed.reduce((acc, b) => {
                  acc[b.stylist.name] = (acc[b.stylist.name] || 0) + 1
                  return acc
                }, {})
              ).map(([name, count]) => (
                <div key={name} className="glass-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-cream text-sm font-medium">{name}</span>
                    <span className="text-gold-400 text-sm font-semibold">{count} apt{count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="w-full bg-emerald-900 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (count / 8) * 100)}%`, background: 'linear-gradient(90deg, #c9a84c, #f0d080)' }}
                    />
                  </div>
                </div>
              ))}
              {confirmed.length === 0 && (
                <div className="glass-card p-6 text-center text-emerald-300 text-sm">No data for this day.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
