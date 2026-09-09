import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, Plus, User, Scissors, View } from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

/* Salon day grid — mirrors backend/routes/availability.py ALL_SLOTS. */
const ALL_SLOTS = Array.from({ length: 11 }, (_, i) => `${10 + i}:00`)

const istToday = () => {
  const now = new Date()
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000).toISOString().split('T')[0]
}

/* dd/mm/yyyy — the Indian display format, same as the staff app. */
const fmtDateIndian = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const fmtTime = (t) => {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

const statusConfig = {
  confirmed: { label: 'Confirmed', cls: 'text-emerald-400 bg-emerald-900/30 border-emerald-700' },
  pending: { label: 'Pending', cls: 'text-amber-400 bg-amber-900/20 border-amber-800' },
  awaiting_reschedule: { label: 'Reschedule?', cls: 'text-violet-400 bg-violet-900/20 border-violet-800' },
  cancelled: { label: 'Cancelled', cls: 'text-red-400 bg-red-900/20 border-red-800' },
  declined: { label: 'Declined', cls: 'text-red-400 bg-red-900/20 border-red-800' },
}

/* Click-to-call href — stored phones may be "98765 43210" or "+91…"; */
const telHref = (phone) => {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return `tel:+91${digits}`
  return `tel:+${digits}`
}

const svcLabel = (svc) =>
  svc?.kid_gender ? `${svc.name} (${svc.kid_gender[0].toUpperCase()}${svc.kid_gender.slice(1)})` : svc?.name

const firstSlotTime = (b) => b.slots?.[0]?.time_slot || b.time_slot || ''

const bookingTotal = (b) =>
  b.slots?.length
    ? b.slots.reduce((s, sl) => s + (sl.service?.price || 0), 0)
    : (b.service?.price || 0)

/* Datewise schedule — every booking grouped by day, newest concern first.
   The backend scopes /bookings/admin/all to the role: the owner sees the
   whole salon, a stylist sees only their own chair. */
export default function Schedule() {
  const { logout, role, user } = useAuth()
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client
      .get('/bookings/admin/all')
      .then(r => setBookings(r.data))
      .catch(() => toast.error('Failed to load bookings'))
      .finally(() => setLoading(false))
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  // Group by date; within a day by start time.
  const byDate = bookings.reduce((acc, b) => {
    (acc[b.date] ||= []).push(b)
    return acc
  }, {})
  const today = istToday()
  // Upcoming gets priority: today + future days ascending first, then past
  // days most-recent-first (02/09 → 29/08) at the bottom.
  const dates = [
    ...Object.keys(byDate).filter(d => d >= today).sort(),
    ...Object.keys(byDate).filter(d => d < today).sort().reverse(),
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase mb-2" style={{ color: role === 'stylist' ? '#34d399' : '#c9a84c' }}>
            {role === 'stylist' ? `Your Chair · ${user?.name || 'Stylist'}` : 'Admin Panel'}
          </p>
          <h1 className="font-display text-4xl text-cream">Schedule</h1>
          <p className="text-emerald-300 text-sm mt-2">
            Every booking, grouped by day — {role === 'stylist' ? 'your chair only.' : 'the whole salon.'}
          </p>
          <div className="w-20 h-0.5 mt-4" style={{ background: role === 'stylist' ? 'linear-gradient(90deg, #34d399, transparent)' : 'linear-gradient(90deg, #c9a84c, transparent)' }} />
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="btn-outline !px-5 !py-2.5 text-sm inline-flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> Dashboard
          </Link>
          <Link to="/new-appointment" className="btn-gold !px-5 !py-2.5 text-sm inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Appointment
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="glass-card h-20 animate-pulse" />)}
        </div>
      ) : bookings.length === 0 ? (
        <div className="glass-card p-10 text-center text-emerald-300">
          <View className="w-8 h-8 mx-auto mb-3 text-emerald-400" />
          No bookings yet.
        </div>
      ) : (
        <div className="space-y-10">
          {dates.map(date => {
            const list = [...byDate[date]].sort((a, b) => firstSlotTime(a).localeCompare(firstSlotTime(b)))
            const isToday = date === today
            const isPast = date < today
            return (
              <section key={date}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className={`font-display text-xl ${isToday ? 'text-gold-400' : 'text-cream'}`}>
                    {isToday ? 'Today · ' : ''}{fmtDateIndian(date)}
                  </h2>
                  <span className="text-xs bg-emerald-900/40 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-800">
                    {list.length} booking{list.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="space-y-3">
                  {list.map(b => {
                    const st = statusConfig[b.status] || { label: b.status, cls: 'text-emerald-300 bg-emerald-900/20 border-emerald-800' }
                    return (
                      <div
                        key={b.id}
                        className={`glass-card p-4 border ${isPast ? 'opacity-55' : 'border-emerald-800'} hover:border-gold-500/40 transition-all duration-200`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 grow">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="text-gold-400 font-semibold text-sm w-16">{fmtTime(firstSlotTime(b))}</span>
                              <span className="text-cream font-medium text-sm">{b.customer_name || 'Customer'}</span>
                              {b.customer_phone && telHref(b.customer_phone) && (
                                <a
                                  href={telHref(b.customer_phone)}
                                  className="flex items-center gap-1 text-emerald-300 text-xs hover:text-gold-400 transition-colors"
                                  title="Call the customer"
                                >
                                  <User className="w-3 h-3" />
                                  {b.customer_phone}
                                </a>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                              <span className="text-gold-400 text-xs font-semibold">₹{bookingTotal(b).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="mt-2 space-y-1.5">
                              {(b.slots?.length
                                ? b.slots
                                : [{ id: 'legacy', time_slot: b.time_slot, service: b.service, stylist: b.stylist, duration_mins: 60 }]
                              ).map(sl => (
                                <div key={sl.id} className="flex flex-wrap items-center gap-3 text-xs">
                                  <span className="text-gold-400 font-semibold w-16">{fmtTime(sl.time_slot)}</span>
                                  <span className="text-cream">{svcLabel(sl.service) || 'Service'}</span>
                                  <span className="flex items-center gap-1 text-emerald-300"><Scissors className="w-3 h-3" />{sl.stylist?.name || '—'}</span>
                                  <span className="text-emerald-300">₹{sl.service?.price}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
