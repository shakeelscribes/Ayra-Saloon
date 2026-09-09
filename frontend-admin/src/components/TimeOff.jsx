import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CalendarOff, Trash2, AlertCircle, X } from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'

/* IST "today" — toISOString() is UTC and shows yesterday between 00:00–05:30 IST. */
const istToday = () => {
  const now = new Date()
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000).toISOString().split('T')[0]
}

const fmtDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const fmtRange = (r) => (r.start === r.end ? fmtDay(r.start) : `${fmtDay(r.start)} – ${fmtDay(r.end)}`)

const statusCls = {
  pending: 'text-amber-400 bg-amber-900/20 border-amber-800',
  confirmed: 'text-emerald-400 bg-emerald-900/20 border-emerald-700',
  awaiting_reschedule: 'text-violet-400 bg-violet-900/20 border-violet-800',
}

export default function TimeOff() {
  const { role } = useAuth()
  const isStylist = role === 'stylist'

  // Stylist self-service state
  const [ranges, setRanges] = useState([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  // 409 payload: { message, conflicts: [{ booking_id, date, time_slot, status, source }] }
  const [conflicts, setConflicts] = useState(null)

  // Owner read-only view (time off is marked by each stylist, self-only)
  const [upcoming, setUpcoming] = useState([])
  const [names, setNames] = useState({})

  useEffect(() => {
    if (!isStylist) {
      Promise.all([
        client.get('/stylists/time-off/upcoming'),
        client.get('/stylists/'),
      ]).then(([to, st]) => {
        setUpcoming(to.data)
        setNames(Object.fromEntries(st.data.map(s => [String(s.id), s.name])))
      }).catch(() => {})
      return
    }
    client.get('/stylists/time-off/me').then(r => setRanges(r.data)).catch(() => {})
  }, [isStylist])

  const submit = async (e) => {
    e.preventDefault()
    if (!start || !end) { toast.error('Pick both dates'); return }
    if (end < start) { toast.error('End date is before start date'); return }
    setSaving(true)
    setConflicts(null)
    try {
      const { data } = await client.post('/stylists/time-off/me', {
        start,
        end,
        reason: reason.trim() || null,
      })
      setRanges(data)
      setStart(''); setEnd(''); setReason('')
      toast.success('Time off marked — you are unbookable for that range')
    } catch (err) {
      const d = err.response?.data?.detail
      if (err.response?.status === 409 && d && typeof d === 'object') {
        setConflicts(d)
      } else {
        toast.error(typeof d === 'string' ? d : 'Could not mark time off')
      }
    } finally {
      setSaving(false)
    }
  }

  const removeRange = async (id) => {
    if (!confirm('Un-mark this range? You become bookable again immediately.')) return
    try {
      await client.delete(`/stylists/time-off/me/${id}`)
      setRanges(list => list.filter(r => r.id !== id))
      toast.success('Time off removed')
    } catch {
      toast.error('Could not remove time off')
    }
  }

  const cancelConflict = async (bookingId) => {
    if (!confirm('Cancel this booking? The customer will be notified.')) return
    try {
      await client.delete(`/bookings/${bookingId}`)
      setConflicts(c => ({ ...c, conflicts: c.conflicts.filter(x => x.booking_id !== bookingId) }))
      toast.success('Booking cancelled — submit the range again')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not cancel booking')
    }
  }

  return (
    <div className="min-h-screen pt-10 pb-16 px-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-2">
              {isStylist ? 'Staff Panel' : 'Admin Panel'}
            </p>
            <h1 className="font-display text-4xl text-cream">{isStylist ? 'My Time Off' : 'Time Off'}</h1>
            <div className="w-20 h-0.5 mt-4" style={{ background: 'linear-gradient(90deg, #c9a84c, transparent)' }} />
          </div>
          <Link to="/" className="btn-outline !px-5 !py-2.5 text-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>

        {!isStylist ? (
          /* Owner view — read-only roster of everyone's marked ranges */
          <>
            <div className="glass-card p-4 mb-8 border border-emerald-800/50 flex items-start gap-3">
              <CalendarOff className="w-5 h-5 text-gold-400 shrink-0 mt-0.5" />
              <p className="text-emerald-300 text-sm">
                Time off is marked by each stylist from their own staff account. Marked ranges
                close that chair for booking and hide the stylist's exclusive services for those days.
              </p>
            </div>
            <h2 className="font-display text-xl text-cream mb-5">Upcoming ranges</h2>
            {upcoming.length === 0 ? (
              <div className="glass-card p-10 text-center text-emerald-300">
                <CalendarOff className="w-8 h-8 mx-auto mb-3 text-emerald-400" />
                No time off marked by any stylist.
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map(r => (
                  <div key={r.id} className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-cream text-sm font-medium">
                        {names[String(r.stylist_id)] || 'Stylist'}
                        <span className="text-gold-400 ml-3">{fmtRange(r)}</span>
                      </p>
                      {r.reason && <p className="text-emerald-300 text-xs mt-0.5">{r.reason}</p>}
                    </div>
                    {r.start <= istToday() && istToday() <= r.end && (
                      <span className="text-xs bg-amber-900/30 text-amber-400 px-2.5 py-1 rounded-full border border-amber-800">
                        Off today
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Stylist view — self-service marking */
          <>
            {/* Mark-off form */}
            <form onSubmit={submit} className="glass-card p-6 mb-8">
              <h2 className="font-display text-xl text-cream mb-5 flex items-center gap-2">
                <CalendarOff className="w-5 h-5 text-gold-400" /> Mark a range off
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="to-start">From</label>
                  <input
                    id="to-start"
                    type="date"
                    value={start}
                    min={istToday()}
                    onChange={e => { setStart(e.target.value); if (end && e.target.value > end) setEnd(e.target.value) }}
                    className="luxury-input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="to-end">To (inclusive)</label>
                  <input
                    id="to-end"
                    type="date"
                    value={end}
                    min={start || istToday()}
                    onChange={e => setEnd(e.target.value)}
                    className="luxury-input"
                    required
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="to-reason">Reason (optional)</label>
                <input
                  id="to-reason"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Family function, out of town"
                  className="luxury-input"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="btn-gold !px-6 !py-2.5 text-sm mt-5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? 'Marking…' : 'Mark Off'}
              </button>
              <p className="text-emerald-500 text-[11px] mt-3">
                Marking is blocked while you still have active bookings inside the range —
                cancel or reschedule them first.
              </p>
            </form>

            {/* 409 conflicts — active bookings inside the requested range */}
            {conflicts && (
              <div className="glass-card p-5 mb-8 border border-amber-800/60">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="text-amber-400 text-sm flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {conflicts.message}
                  </p>
                  <button onClick={() => setConflicts(null)} className="text-emerald-300 hover:text-cream transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {conflicts.conflicts.map(c => (
                    <div key={c.booking_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-700/60 bg-emerald-900/40 px-4 py-2.5">
                      <span className="text-cream text-sm font-medium">{c.date}</span>
                      <span className="text-emerald-300 text-xs">{c.time_slot || '—'}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusCls[c.status] || 'text-emerald-300 bg-emerald-900/20 border-emerald-800'}`}>
                        {c.status}
                      </span>
                      <span className="text-emerald-500 text-[11px]">{c.source === 'walk_in' ? 'walk-in' : 'online'}</span>
                      <div className="ml-auto flex items-center gap-3">
                        <Link
                          to="/"
                          className="text-xs text-violet-300 hover:text-violet-200 transition-colors"
                          title="Propose a new slot from the dashboard"
                        >
                          Reschedule
                        </Link>
                        <button
                          onClick={() => cancelConflict(c.booking_id)}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Cancel booking
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {conflicts.conflicts.length === 0 && (
                  <p className="text-emerald-300 text-xs">All clear — submit the range again.</p>
                )}
              </div>
            )}

            {/* My marked ranges */}
            <h2 className="font-display text-xl text-cream mb-5">My marked ranges</h2>
            {ranges.length === 0 ? (
              <div className="glass-card p-10 text-center text-emerald-300">
                <CalendarOff className="w-8 h-8 mx-auto mb-3 text-emerald-400" />
                No time off marked. You are bookable every day.
              </div>
            ) : (
              <div className="space-y-3">
                {ranges.map(r => (
                  <div key={r.id} className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-cream text-sm font-medium">{fmtRange(r)}</p>
                      {r.reason && <p className="text-emerald-300 text-xs mt-0.5">{r.reason}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      {r.start <= istToday() && istToday() <= r.end && (
                        <span className="text-xs bg-amber-900/30 text-amber-400 px-2.5 py-1 rounded-full border border-amber-800">
                          Active now
                        </span>
                      )}
                      <button
                        onClick={() => removeRange(r.id)}
                        className="text-red-400 hover:text-red-300 transition-colors p-1"
                        title="Un-mark this range"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
