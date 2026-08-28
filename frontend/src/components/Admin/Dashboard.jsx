import { useEffect, useState, useMemo } from 'react'
import { Calendar, CalendarClock, Clock, User, Scissors, TrendingUp, Users, CheckCircle2, XCircle, AlertCircle, MessageCircle, CheckCheck, Phone, X } from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../../api/client'

/* Salon day grid — mirrors backend/routes/availability.py ALL_SLOTS. */
const ALL_SLOTS = Array.from({ length: 11 }, (_, i) => `${10 + i}:00`)

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

/* IST "today" — toISOString() is UTC and shows yesterday between 00:00–05:30
   IST, which would open the dashboard filtered to the wrong day. */
const istToday = () => {
  const now = new Date()
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000).toISOString().split('T')[0]
}

const kindConfig = {
  booking_pending:      { label: 'Request received',    cls: 'text-amber-400 bg-amber-900/20 border-amber-800' },
  booking_confirmed:    { label: 'Confirmed',           cls: 'text-emerald-400 bg-emerald-900/20 border-emerald-700' },
  reschedule_proposed:  { label: 'Reschedule proposed', cls: 'text-violet-400 bg-violet-900/20 border-violet-800' },
  reschedule_confirmed: { label: 'Reschedule accepted', cls: 'text-emerald-400 bg-emerald-900/20 border-emerald-700' },
  booking_declined:     { label: 'Declined',            cls: 'text-red-400 bg-red-900/20 border-red-800' },
  booking_cancelled:    { label: 'Cancelled',           cls: 'text-red-400 bg-red-900/20 border-red-800' },
}

/* Click-to-call href — stored phones may be "98765 43210" or "+91…";
   tel: needs bare digits with country code. */
const telHref = (phone) => {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return `tel:+91${digits}`
  return `tel:+${digits}`
}

export default function AdminDashboard() {
  const [bookings, setBookings] = useState([])
  const [pending, setPending] = useState([])
  const [awaiting, setAwaiting] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(istToday())

  // Propose-reschedule modal state
  const [rescheduleTarget, setRescheduleTarget] = useState(null)
  const [propDate, setPropDate] = useState('')
  const [propStart, setPropStart] = useState(null)
  const [propReason, setPropReason] = useState('')
  const [avail, setAvail] = useState({})
  const [availLoading, setAvailLoading] = useState(false)

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

  // Action queues always span all dates — these need action regardless of day
  const fetchQueues = async () => {
    try {
      const { data } = await client.get('/bookings/admin/all')
      setPending(data.filter(b => b.status === 'pending'))
      setAwaiting(data.filter(b => b.status === 'awaiting_reschedule'))
    } catch {
      /* silent — main list shows the error state */
    }
  }

  const fetchNotifications = async () => {
    try {
      const { data } = await client.get('/notifications/all?limit=20')
      setNotifications(data)
    } catch {
      /* silent — panel is secondary */
    }
  }

  useEffect(() => { fetchBookings(selectedDate) }, [selectedDate])
  useEffect(() => { fetchQueues(); fetchNotifications() }, [])

  const refreshAll = () => { fetchBookings(selectedDate); fetchQueues(); fetchNotifications() }

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

  const openReschedule = (b) => {
    setRescheduleTarget(b)
    setPropDate(b.date)
    setPropStart(null)
    setPropReason('')
    setAvail({})
  }

  const handleMarkSent = async (id) => {
    try {
      await client.post(`/notifications/${id}/mark-sent`)
      fetchNotifications()
    } catch {
      toast.error('Could not mark as sent')
    }
  }

  const confirmed = bookings.filter(b => b.status === 'confirmed')
  const cancelled = bookings.filter(b => b.status === 'cancelled')

  const fmtTime = (t) => {
    if (!t) return '—'
    const [h, m] = t.split(':').map(Number)
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  const fmtDateTime = (iso) => iso
    ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '—'

  // Multi-slot shape: a booking holds N slots (one per service). Fall back to
  // the legacy singular fields for old snapshot bookings.
  const bookingSlots = (b) => (b.slots?.length ? b.slots : [])

  // Kids services come in Boy/Girl variants that share one name — append the
  // variant wherever a slot's service is listed as plain text.
  const svcLabel = (svc) => (svc?.kid_gender ? `${svc.name} (${svc.kid_gender[0].toUpperCase()}${svc.kid_gender.slice(1)})` : svc?.name)
  const firstSlotTime = (b) => b.slots?.[0]?.time_slot || b.time_slot || ''
  const bookingTotal = (b) =>
    b.slots?.length
      ? b.slots.reduce((s, sl) => s + (sl.service?.price || 0), 0)
      : (b.service?.price || 0)

  /* ── Duration-based slot math (mirrors backend/routes/availability.py) ── */
  const toMins = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
  const isFree = (busy, startMin, endMin) =>
    !(busy || []).some((b) => startMin < toMins(b.end) && toMins(b.start) < endMin)
  const slotsNeededFor = (rows) =>
    Math.max(1, Math.ceil((rows.reduce((s, r) => s + (r.duration_mins || 60), 0) - 30) / 60))

  // Group confirmed bookings by first-slot time
  const timeline = [...confirmed].sort((a, b) => firstSlotTime(a).localeCompare(firstSlotTime(b)))

  /* ---- Propose-reschedule modal logic ---- */

  const propRows = rescheduleTarget?.slots?.length ? rescheduleTarget.slots : []
  const propStylistIds = useMemo(
    () => [...new Set(propRows.map(sl => String(sl.stylist_id)))],
    [rescheduleTarget]
  )

  // Availability per involved stylist for the proposed date. This booking's
  // own rows are excluded server-side via exclude_booking_id — they're moving
  // away, so they must not block their own reschedule.
  useEffect(() => {
    if (!rescheduleTarget || !propDate) return
    const controller = new AbortController()
    setAvailLoading(true)
    setAvail({})
    setPropStart(null)
    Promise.all(propStylistIds.map(id =>
      client.get(
        `/availability/?stylist_id=${id}&date=${propDate}&exclude_booking_id=${rescheduleTarget.id}`,
        { signal: controller.signal }
      )
        .then(r => [id, r.data.busy || []])
        .catch(() => [id, []])
    )).then(pairs => {
      if (!controller.signal.aborted) setAvail(Object.fromEntries(pairs))
    }).finally(() => {
      if (!controller.signal.aborted) setAvailLoading(false)
    })
    return () => controller.abort()
  }, [rescheduleTarget, propDate])

  // The visit reserves whole hours: real durations rounded up with the
  // 30-min grace — same rule as creation and the backend.
  const propBlockSlots = useMemo(
    () => slotsNeededFor(propRows),
    [rescheduleTarget]
  )

  // A start works when the whole back-to-back block fits before closing and
  // every service's own stylist is interval-free for its real window.
  const viableStarts = useMemo(() => {
    const viable = new Set()
    if (!rescheduleTarget || !propRows.length) return viable
    for (let s = 0; s + propBlockSlots <= ALL_SLOTS.length; s++) {
      let cursor = toMins(ALL_SLOTS[s])
      let ok = true
      for (let i = 0; i < propRows.length; i++) {
        const dur = propRows[i].duration_mins || 60
        const busy = avail[String(propRows[i].stylist_id)]
        if (!busy || !isFree(busy, cursor, cursor + dur)) { ok = false; break }
        cursor += dur
      }
      if (ok) viable.add(ALL_SLOTS[s])
    }
    return viable
  }, [rescheduleTarget, avail, propBlockSlots])

  const availLoaded = !availLoading && propStylistIds.length > 0 &&
    propStylistIds.every(id => avail[id])

  const handlePropose = async () => {
    if (!rescheduleTarget || !propStart) return
    try {
      await client.post(`/bookings/${rescheduleTarget.id}/propose-reschedule`, {
        date: propDate,
        time_slot: propStart,
        reason: propReason.trim() || null,
      })
      toast.success('Reschedule proposed — customer notified')
      setRescheduleTarget(null)
      refreshAll()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not propose reschedule')
    }
  }

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
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-10">
          <StatCard icon={TrendingUp} label="Total Bookings" value={bookings.length + pending.length} color="bg-emerald-800" />
          <StatCard icon={AlertCircle} label="Pending Approval" value={pending.length} color="bg-amber-700" />
          <StatCard icon={CalendarClock} label="Awaiting Reschedule" value={awaiting.length} color="bg-violet-800" />
          <StatCard icon={CheckCircle2} label="Confirmed" value={confirmed.length} color="bg-emerald-700" />
          <StatCard icon={XCircle} label="Cancelled" value={cancelled.length} color="bg-red-900" />
          <StatCard icon={Users} label="Revenue (est.)" value={`₹${confirmed.reduce((s, b) => s + bookingTotal(b), 0).toLocaleString('en-IN')}`} color="bg-gold-600" />
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
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 grow">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-cream font-medium text-sm">{b.customer_name || 'Customer'}</p>
                        {b.customer_phone && telHref(b.customer_phone) && (
                          <a
                            href={telHref(b.customer_phone)}
                            className="flex items-center gap-1 text-emerald-300 text-xs hover:text-gold-400 transition-colors"
                            title="Call the customer"
                          >
                            <Phone className="w-3 h-3" />
                            {b.customer_phone}
                          </a>
                        )}
                        <span className="text-emerald-300 text-xs">{b.date}</span>
                        <span className="text-gold-400 text-xs font-semibold">₹{bookingTotal(b).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {bookingSlots(b).map(sl => (
                          <div key={sl.id} className="flex flex-wrap items-center gap-3 text-xs">
                            <span className="text-amber-400 font-semibold w-16">{fmtTime(sl.time_slot)}</span>
                            <span className="text-cream">{svcLabel(sl.service) || 'Service'}</span>
                            <span className="flex items-center gap-1 text-emerald-300"><Scissors className="w-3 h-3" />{sl.stylist?.name || '—'}</span>
                            <span className="text-emerald-300">₹{sl.service?.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openReschedule(b)}
                        className="text-xs text-violet-300 hover:text-violet-200 transition-colors whitespace-nowrap"
                        title="Propose a new slot — call the customer first to confirm"
                      >
                        Reschedule
                      </button>
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

        {/* Awaiting reschedule queue — customer has an open proposal */}
        {awaiting.length > 0 && (
          <div className="mb-10">
            <h2 className="font-display text-xl text-cream mb-5 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-violet-400" />
              Awaiting Reschedule
              <span className="text-xs bg-violet-900/30 text-violet-400 px-2.5 py-1 rounded-full border border-violet-800">
                {awaiting.length} waiting on customer
              </span>
            </h2>
            <div className="space-y-3">
              {awaiting.map(b => (
                <div key={b.id} className="glass-card p-4 border border-violet-800/50">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 grow">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-cream font-medium text-sm">{b.customer_name || 'Customer'}</p>
                        {b.customer_phone && telHref(b.customer_phone) && (
                          <a
                            href={telHref(b.customer_phone)}
                            className="flex items-center gap-1 text-emerald-300 text-xs hover:text-gold-400 transition-colors"
                            title="Call the customer"
                          >
                            <Phone className="w-3 h-3" />
                            {b.customer_phone}
                          </a>
                        )}
                        <span className="text-emerald-300 text-xs">{b.date}</span>
                      </div>
                      <p className="text-violet-300 text-xs mt-2">
                        Proposed: <span className="text-cream font-medium">{b.proposed_date} at {fmtTime(b.proposed_time_slot)}</span>
                        <span className="text-emerald-500"> (was {b.date} at {fmtTime(firstSlotTime(b))})</span>
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {bookingSlots(b).map(sl => (
                          <div key={sl.id} className="flex flex-wrap items-center gap-3 text-xs">
                            <span className="text-violet-400 font-semibold w-16">{fmtTime(sl.time_slot)}</span>
                            <span className="text-cream">{svcLabel(sl.service) || 'Service'}</span>
                            <span className="flex items-center gap-1 text-emerald-300"><Scissors className="w-3 h-3" />{sl.stylist?.name || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-violet-300 italic whitespace-nowrap">Waiting for customer's answer</span>
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
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-300">
                        <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /><span className="text-cream font-medium text-sm">{b.customer_name || 'Customer'}</span></span>
                        <span>{bookingSlots(b).length || 1} service{(bookingSlots(b).length || 1) > 1 ? 's' : ''}</span>
                        <span className="text-gold-400 font-semibold">₹{bookingTotal(b).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openReschedule(b)}
                          className="text-xs text-violet-300 hover:text-violet-200 transition-colors whitespace-nowrap"
                        >
                          Reschedule
                        </button>
                        <button
                          onClick={() => handleCancel(b.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {bookingSlots(b).map(sl => (
                        <div key={sl.id} className="flex flex-wrap items-center gap-3 text-sm border-t border-emerald-800/60 pt-1.5">
                          <span className="text-gold-400 font-semibold text-xs w-16">{fmtTime(sl.time_slot)}</span>
                          <span className="text-cream">{svcLabel(sl.service) || 'Service'}</span>
                          <span className="flex items-center gap-1 text-emerald-300 text-xs"><Scissors className="w-3 h-3" />{sl.stylist?.name || '—'}</span>
                          <span className="text-emerald-300 text-xs ml-auto">₹{sl.service?.price}</span>
                        </div>
                      ))}
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
                  // Minutes per stylist — a stylist is busy for their
                  // services' real durations, not a flat hour per row.
                  const rows = bookingSlots(b).length
                    ? bookingSlots(b)
                    : (b.stylist ? [{ stylist: b.stylist, duration_mins: 60 }] : [])
                  rows.forEach(sl => {
                    const name = sl.stylist?.name
                    if (name) acc[name] = (acc[name] || 0) + (sl.duration_mins || 60)
                  })
                  return acc
                }, {})
              ).map(([name, mins]) => {
                const hrs = mins / 60
                return (
                  <div key={name} className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-cream text-sm font-medium">{name}</span>
                      <span className="text-gold-400 text-sm font-semibold">{hrs % 1 ? hrs.toFixed(1) : hrs} h booked</span>
                    </div>
                    <div className="w-full bg-emerald-900 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (hrs / 11) * 100)}%`, background: 'linear-gradient(90deg, #c9a84c, #f0d080)' }}
                      />
                    </div>
                  </div>
                )
              })}
              {confirmed.length === 0 && (
                <div className="glass-card p-6 text-center text-emerald-300 text-sm">No data for this day.</div>
              )}
            </div>
          </div>
        </div>

        {/* WhatsApp notifications panel */}
        <div className="mt-10">
          <h2 className="font-display text-xl text-cream mb-5 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-gold-400" /> WhatsApp Notifications
            <span className="text-xs bg-emerald-900/40 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-800">
              {notifications.filter(n => !n.sent_at).length} unsent
            </span>
          </h2>
          {notifications.length === 0 ? (
            <div className="glass-card p-6 text-center text-emerald-300 text-sm">No notifications yet.</div>
          ) : (
            <div className="space-y-3">
              {notifications.map(n => {
                const kind = kindConfig[n.kind] || { label: n.kind, cls: 'text-emerald-300 bg-emerald-900/20 border-emerald-800' }
                return (
                  <div key={n.id} className="glass-card p-4 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 grow">
                      <div className="flex flex-wrap items-center gap-3 mb-1.5">
                        <span className={`text-xs px-2.5 py-1 rounded-full border ${kind.cls}`}>{kind.label}</span>
                        <span className="text-emerald-300 text-xs">{fmtDateTime(n.created_at)}</span>
                        {n.sent_at
                          ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCheck className="w-3.5 h-3.5" /> Sent</span>
                          : <span className="text-amber-400 text-xs">Not sent yet</span>}
                      </div>
                      <p className="text-cream text-sm break-words">{n.rendered_text}</p>
                      {!n.phone && <p className="text-amber-400 text-xs mt-1">Customer has no phone number on file.</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {n.deep_link && (
                        <a
                          href={n.deep_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-gold !px-4 !py-2 text-xs inline-flex items-center gap-1.5"
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                        </a>
                      )}
                      {!n.sent_at && (
                        <button
                          onClick={() => handleMarkSent(n.id)}
                          className="btn-outline !px-4 !py-2 text-xs"
                        >
                          Mark sent
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Propose-reschedule modal */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setRescheduleTarget(null)}>
          <div
            className="glass-card max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="font-display text-xl text-cream">Propose Reschedule</h3>
                <p className="text-emerald-300 text-xs mt-1">
                  {rescheduleTarget.customer_name || 'Customer'} · currently {rescheduleTarget.date} at {fmtTime(firstSlotTime(rescheduleTarget))}
                  {propRows.length > 0 && ` · ${propRows.length} service${propRows.length > 1 ? 's' : ''}, reserves ${propBlockSlots} hour${propBlockSlots !== 1 ? 's' : ''}`}
                </p>
              </div>
              <button onClick={() => setRescheduleTarget(null)} className="text-emerald-300 hover:text-cream transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="propose-date">New date</label>
            <input
              type="date"
              id="propose-date"
              value={propDate}
              min={istToday()}
              onChange={e => setPropDate(e.target.value)}
              className="luxury-input mb-5"
            />

            <label className="block text-xs text-emerald-300 mb-2" htmlFor="propose-start">New start time</label>
            {propRows.length === 0 ? (
              <p className="text-amber-400 text-xs mb-4">This booking has no slot rows — reschedule is unavailable for legacy bookings.</p>
            ) : availLoading ? (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {ALL_SLOTS.slice(0, 8).map(t => <div key={t} className="h-9 rounded-lg bg-emerald-900/40 animate-pulse" />)}
              </div>
            ) : !availLoaded ? (
              <p className="text-amber-400 text-xs mb-4">Could not load availability for this date.</p>
            ) : viableStarts.size === 0 ? (
              <p className="text-amber-400 text-xs mb-4">No start times available for this date — try another day.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {ALL_SLOTS.map(t => {
                  const viable = viableStarts.has(t)
                  const selected = propStart === t
                  return (
                    <button
                      key={t}
                      disabled={!viable}
                      onClick={() => setPropStart(t)}
                      title={viable ? '' : 'Not available'}
                      className={`py-2 text-xs rounded-lg border transition-colors duration-200 ${
                        selected
                          ? 'bg-gold-gradient text-emerald-950 border-gold-500 font-semibold'
                          : viable
                            ? 'border-emerald-700 text-cream hover:border-gold-500/60'
                            : 'border-emerald-800/50 text-emerald-700 line-through cursor-not-allowed'
                      }`}
                    >
                      {fmtTime(t)}
                    </button>
                  )
                })}
              </div>
            )}

            <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="propose-reason">Reason (optional)</label>
            <textarea
              id="propose-reason"
              value={propReason}
              onChange={e => setPropReason(e.target.value)}
              rows={2}
              placeholder="e.g. Stylist unavailable that morning"
              className="luxury-input mb-6 resize-none"
            />

            <div className="flex justify-end gap-3">
              <button onClick={() => setRescheduleTarget(null)} className="btn-outline !px-5 !py-2 text-sm">
                Cancel
              </button>
              <button
                onClick={handlePropose}
                disabled={!propStart}
                className="btn-gold !px-5 !py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Propose
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
