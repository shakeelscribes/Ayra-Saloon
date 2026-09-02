import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, TrendingUp, Download, IndianRupee, Trash2, Plus,
  CalendarDays, Scissors, Receipt,
} from 'lucide-react'
import toast from 'react-hot-toast'
import client from '../api/client'

/* IST "today" — toISOString() is UTC and shows yesterday between 00:00–05:30 IST. */
const istToday = () => {
  const now = new Date()
  return new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000).toISOString().split('T')[0]
}

/* Backend's default window is "last 30 days incl." — mirror it so the UI
   always shows exactly what the numbers represent. The shifted Date's LOCAL
   fields carry IST wall time, so format from those (toISOString() would show
   UTC and roll back a day between 00:00–05:30 IST). */
const istDaysAgo = (n) => {
  const now = new Date()
  const d = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000)
  d.setDate(d.getDate() - n)
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/* Fixed expense categories — mirrors backend/routes/economy.py EXPENSE_CATEGORIES. */
const EXPENSE_CATEGORIES = ['rent', 'products', 'salaries', 'utilities', 'marketing', 'maintenance', 'other']

const CAT_LABEL = {
  rent: 'Rent', products: 'Products', salaries: 'Salaries', utilities: 'Utilities',
  marketing: 'Marketing', maintenance: 'Maintenance', other: 'Other',
  hair: 'Hair', grooming: 'Grooming', colour: 'Colour', spa: 'Spa',
  facial: 'Facial', bridal: 'Bridal', tattoo: 'Tattoo', general: 'General',
}
const catLabel = (c) => CAT_LABEL[c] || c

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'budget', label: 'Budget' },
]

export default function Economy() {
  const [tab, setTab] = useState('overview')

  // Shared range (overview + export). Backend default: last 30 days incl.
  const [from, setFrom] = useState(istDaysAgo(29))
  const [to, setTo] = useState(istToday())
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  // Expense entries for the same range (Expenses tab)
  const [expenses, setExpenses] = useState([])
  const [loadingExp, setLoadingExp] = useState(true)

  // Budget month (own state — budgets are monthly, not range-based)
  const [month, setMonth] = useState(istToday().slice(0, 7))
  const [budget, setBudget] = useState(null)
  const [budgetDrafts, setBudgetDrafts] = useState({}) // category -> string
  const [budgetSaving, setBudgetSaving] = useState('') // category currently saving

  // Expense form
  const [expDate, setExpDate] = useState(istToday())
  const [expCategory, setExpCategory] = useState('products')
  const [expDesc, setExpDesc] = useState('')
  const [expAmount, setExpAmount] = useState('')
  const [expSaving, setExpSaving] = useState(false)

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await client.get(`/economy/summary?from=${from}&to=${to}`)
      setSummary(data)
    } catch {
      toast.error('Could not load economy summary')
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  const fetchBudget = useCallback(async () => {
    try {
      const { data } = await client.get(`/economy/budgets?month=${month}`)
      setBudget(data)
    } catch {
      toast.error('Could not load budget targets')
      setBudget(null)
    }
  }, [month])

  useEffect(() => { fetchSummary() }, [fetchSummary])
  useEffect(() => { fetchBudget() }, [fetchBudget])

  const fetchExpenses = useCallback(async () => {
    setLoadingExp(true)
    try {
      const { data } = await client.get(`/economy/expenses?from=${from}&to=${to}`)
      setExpenses(data)
    } catch {
      toast.error('Could not load expenses')
      setExpenses([])
    } finally {
      setLoadingExp(false)
    }
  }, [from, to])

  useEffect(() => { fetchExpenses() }, [fetchExpenses])

  const exportCsv = (type) => {
    // Auth header comes from the shared axios client — fetch() would drop it,
    // so download through axios and hand the blob to the browser.
    client.get(`/economy/export?type=${type}&from=${from}&to=${to}`, { responseType: 'blob' })
      .then(r => {
        const disposition = r.headers?.['content-disposition'] || ''
        const match = disposition.match(/filename="?([^"]+)"?/)
        const blob = new Blob([r.data], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = match ? match[1] : `ayra-${type}-${from}-to-${to}.csv`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      })
      .catch(() => toast.error('Could not export CSV'))
  }

  const addExpense = async (e) => {
    e.preventDefault()
    const amount = parseFloat(expAmount)
    if (!expDate) { toast.error('Pick a date'); return }
    if (!amount || amount <= 0) { toast.error('Amount must be positive'); return }
    setExpSaving(true)
    try {
      await client.post('/economy/expenses', {
        date: expDate,
        category: expCategory,
        description: expDesc.trim() || null,
        amount,
      })
      toast.success('Expense recorded')
      setExpDesc(''); setExpAmount('')
      fetchSummary()
      fetchBudget()
      fetchExpenses()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not record expense')
    } finally {
      setExpSaving(false)
    }
  }

  const deleteExpense = async (id) => {
    if (!confirm('Delete this expense entry?')) return
    try {
      await client.delete(`/economy/expenses/${id}`)
      setExpenses(list => list.filter(x => x.id !== id))
      fetchSummary()
      fetchBudget()
    } catch {
      toast.error('Could not delete expense')
    }
  }

  const saveBudget = async (category) => {
    const raw = budgetDrafts[category]
    if (raw === undefined) return
    const amount = parseFloat(raw)
    if (isNaN(amount) || amount < 0) { toast.error('Enter a valid amount'); return }
    setBudgetSaving(category)
    try {
      const { data } = await client.put(`/economy/budgets?month=${month}`, {
        category,
        amount,
      })
      setBudget(data)
      setBudgetDrafts(d => { const n = { ...d }; delete n[category]; return n })
      toast.success(amount === 0 ? `${catLabel(category)} target cleared` : `${catLabel(category)} target saved`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not save target')
    } finally {
      setBudgetSaving('')
    }
  }

  const maxDaily = useMemo(
    () => Math.max(1, ...(summary?.daily || []).map(d => Math.max(d.income, d.expense))),
    [summary]
  )

  return (
    <div className="min-h-screen pt-10 pb-16 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-gold-400 text-xs font-medium tracking-widest uppercase mb-2">Salon-wide · shared</p>
            <h1 className="font-display text-4xl text-cream">Economy</h1>
            <div className="w-20 h-0.5 mt-4" style={{ background: 'linear-gradient(90deg, #c9a84c, transparent)' }} />
          </div>
          <Link to="/" className="btn-outline !px-5 !py-2.5 text-sm inline-flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2 rounded-full text-xs border transition-colors duration-200 ${
                tab === t.id
                  ? 'bg-gold-gradient text-emerald-950 border-gold-500 font-semibold'
                  : 'border-emerald-700 text-emerald-300 hover:border-gold-500/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Range picker — overview + export share it */}
        {tab === 'overview' && (
          <div className="glass-card p-5 mb-8 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="eco-from">From</label>
              <input id="eco-from" type="date" value={from} onChange={e => { setFrom(e.target.value); if (to && e.target.value > to) setTo(e.target.value) }} className="luxury-input max-w-xs" />
            </div>
            <div>
              <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="eco-to">To</label>
              <input id="eco-to" type="date" value={to} onChange={e => setTo(e.target.value)} className="luxury-input max-w-xs" />
            </div>
            <button onClick={() => exportCsv('income')} className="btn-outline !px-4 !py-2 text-xs inline-flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Income CSV
            </button>
            <button onClick={() => exportCsv('bookings')} className="btn-outline !px-4 !py-2 text-xs inline-flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Bookings CSV
            </button>
            <button onClick={() => exportCsv('expenses')} className="btn-outline !px-4 !py-2 text-xs inline-flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Expenses CSV
            </button>
          </div>
        )}

        {/* ── Overview ──────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="glass-card h-24 animate-pulse" />)}
            </div>
          ) : !summary ? (
            <div className="glass-card p-10 text-center text-emerald-300">No data.</div>
          ) : (
            <>
              {/* Headline numbers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="glass-card p-6">
                  <p className="text-emerald-300 text-xs uppercase tracking-widest mb-1">Income</p>
                  <p className="font-display text-3xl text-cream">{inr(summary.income)}</p>
                  <p className="text-emerald-500 text-[11px] mt-1">Confirmed bookings · {summary.from_date} → {summary.to_date}</p>
                </div>
                <div className="glass-card p-6">
                  <p className="text-emerald-300 text-xs uppercase tracking-widest mb-1">Expenses</p>
                  <p className="font-display text-3xl text-cream">{inr(summary.expenses)}</p>
                  <p className="text-emerald-500 text-[11px] mt-1">{Object.keys(summary.expenses_by_category).length} categories</p>
                </div>
                <div className="glass-card p-6">
                  <p className="text-emerald-300 text-xs uppercase tracking-widest mb-1">Net</p>
                  <p className={`font-display text-3xl ${summary.net >= 0 ? 'text-cream' : 'text-red-400'}`}>{inr(summary.net)}</p>
                  <p className="text-emerald-500 text-[11px] mt-1">Income − expenses</p>
                </div>
              </div>

              {/* Funnel + sources */}
              <div className="glass-card p-6 mb-8">
                <h2 className="font-display text-lg text-cream mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-gold-400" /> Booking funnel
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-center">
                  {[
                    ['Total', summary.bookings_total],
                    ['Confirmed', summary.bookings_confirmed],
                    ['Declined', summary.bookings_declined],
                    ['Cancelled', summary.bookings_cancelled],
                    ['Walk-ins', summary.walk_ins],
                  ].map(([label, v]) => (
                    <div key={label} className="rounded-xl border border-emerald-700/60 bg-emerald-900/40 py-3">
                      <p className="font-display text-xl text-cream">{v ?? 0}</p>
                      <p className="text-emerald-300 text-[11px] mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-emerald-500 text-[11px] mt-3">
                  {summary.online} online · {summary.walk_ins} walk-ins in this window
                </p>
              </div>

              {/* Daily bars */}
              {(summary.daily || []).length > 0 && (
                <div className="glass-card p-6 mb-8">
                  <h2 className="font-display text-lg text-cream mb-4 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-gold-400" /> Daily income vs expenses
                  </h2>
                  <div className="space-y-2">
                    {summary.daily.map(d => (
                      <div key={d.date} className="flex items-center gap-3 text-xs">
                        <span className="text-emerald-300 w-20 shrink-0">{d.date.slice(5)}</span>
                        <div className="grow min-w-0">
                          <div className="h-2 rounded-full bg-emerald-900/60 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(d.income / maxDaily) * 100}%`, background: 'linear-gradient(90deg, #c9a84c, #f0d080)' }} />
                          </div>
                          {d.expense > 0 && (
                            <div className="h-1 mt-0.5 rounded-full bg-emerald-900/60 overflow-hidden">
                              <div className="h-full rounded-full bg-red-800" style={{ width: `${(d.expense / maxDaily) * 100}%` }} />
                            </div>
                          )}
                        </div>
                        <span className="text-gold-400 w-20 text-right whitespace-nowrap">{inr(d.income)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Breakdowns */}
              <div className="grid md:grid-cols-3 gap-4">
                <div className="glass-card p-6">
                  <h2 className="font-display text-lg text-cream mb-4 flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-gold-400" /> By stylist
                  </h2>
                  <Breakdown rows={summary.income_by_stylist} empty="No confirmed income in this window." />
                </div>
                <div className="glass-card p-6">
                  <h2 className="font-display text-lg text-cream mb-4 flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-gold-400" /> Income by service
                  </h2>
                  <Breakdown rows={summary.income_by_category} empty="No confirmed income in this window." />
                </div>
                <div className="glass-card p-6">
                  <h2 className="font-display text-lg text-cream mb-4 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-gold-400" /> Expenses by category
                  </h2>
                  <Breakdown rows={summary.expenses_by_category} empty="No expenses recorded." />
                </div>
              </div>
            </>
          )
        )}

        {/* ── Expenses ──────────────────────────────────────────────────── */}
        {tab === 'expenses' && (
          <>
            <form onSubmit={addExpense} className="glass-card p-6 mb-8">
              <h2 className="font-display text-lg text-cream mb-5 flex items-center gap-2">
                <Plus className="w-4 h-4 text-gold-400" /> Record an expense
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="exp-date">Date</label>
                  <input id="exp-date" type="date" value={expDate} onChange={e => setExpDate(e.target.value)} className="luxury-input" required />
                </div>
                <div>
                  <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="exp-cat">Category</label>
                  <select id="exp-cat" value={expCategory} onChange={e => setExpCategory(e.target.value)} className="luxury-input">
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="exp-desc">Description</label>
                  <input id="exp-desc" value={expDesc} onChange={e => setExpDesc(e.target.value)} placeholder="e.g. Hair colour stock" className="luxury-input" />
                </div>
                <div>
                  <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="exp-amount">Amount (₹)</label>
                  <input id="exp-amount" type="number" min="1" step="0.01" value={expAmount} onChange={e => setExpAmount(e.target.value)} placeholder="0" className="luxury-input" required />
                </div>
              </div>
              <button type="submit" disabled={expSaving} className="btn-gold !px-6 !py-2.5 text-sm mt-5 disabled:opacity-40 disabled:cursor-not-allowed">
                {expSaving ? 'Saving…' : 'Add expense'}
              </button>
            </form>

            <h2 className="font-display text-lg text-cream mb-4 flex items-center gap-2">
              Entries <span className="text-emerald-500 text-xs font-normal">{from} → {to}</span>
              <button onClick={() => exportCsv('expenses')} className="btn-outline !px-3 !py-1.5 text-[11px] inline-flex items-center gap-1.5 ml-auto">
                <Download className="w-3 h-3" /> Expenses CSV
              </button>
            </h2>
            {loadingExp ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="glass-card h-14 animate-pulse" />)}
              </div>
            ) : expenses.length === 0 ? (
              <div className="glass-card p-10 text-center text-emerald-300">
                No expenses recorded in this range.
              </div>
            ) : (
              <div className="space-y-2">
                {expenses.map(x => (
                  <div key={x.id} className="glass-card p-4 flex flex-wrap items-center gap-3">
                    <span className="text-emerald-300 text-xs w-24">{x.date}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-700 bg-emerald-900/40 text-emerald-300">
                      {catLabel(x.category)}
                    </span>
                    <span className="text-cream text-sm min-w-0 truncate">{x.description || '—'}</span>
                    <span className="text-gold-400 text-sm font-semibold ml-auto">{inr(x.amount)}</span>
                    <button
                      onClick={() => deleteExpense(x.id)}
                      className="text-red-400 hover:text-red-300 transition-colors p-1"
                      title="Delete entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Budget ────────────────────────────────────────────────────── */}
        {tab === 'budget' && (
          <>
            <div className="glass-card p-5 mb-8 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs text-emerald-300 mb-1.5" htmlFor="eco-month">Month</label>
                <input id="eco-month" type="month" value={month} onChange={e => { setMonth(e.target.value); setBudgetDrafts({}) }} className="luxury-input max-w-xs" />
              </div>
              <p className="text-emerald-500 text-xs sm:ml-auto max-w-md">
                Monthly targets per expense category. Zero clears a target. Spent is pulled from recorded expenses.
              </p>
            </div>
            {budget && (
              <div className="space-y-3">
                {budget.categories.map(bc => {
                  const pct = bc.target > 0 ? Math.min(100, Math.round((bc.spent / bc.target) * 100)) : 0
                  const over = bc.target > 0 && bc.spent > bc.target
                  const near = bc.target > 0 && !over && pct >= 80
                  return (
                    <div key={bc.category} className="glass-card p-4">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <span className="text-cream text-sm font-medium">{catLabel(bc.category)}</span>
                        <span className="text-emerald-300 text-xs">{inr(bc.spent)} of {inr(bc.target)}</span>
                        {bc.target > 0 && (
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${over ? 'text-red-400 bg-red-900/20 border-red-800' : near ? 'text-amber-400 bg-amber-900/20 border-amber-800' : 'text-emerald-400 bg-emerald-900/20 border-emerald-700'}`}>
                            {pct}%
                          </span>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={budgetDrafts[bc.category] ?? (bc.target || '')}
                            onChange={e => setBudgetDrafts(d => ({ ...d, [bc.category]: e.target.value }))}
                            placeholder="No target"
                            className="luxury-input !w-32 !py-1.5 text-xs"
                            aria-label={`${catLabel(bc.category)} target for ${month}`}
                          />
                          <button
                            onClick={() => saveBudget(bc.category)}
                            disabled={budgetSaving === bc.category}
                            className="btn-outline !px-3 !py-1.5 text-xs disabled:opacity-40"
                          >
                            {budgetSaving === bc.category ? '…' : 'Save'}
                          </button>
                        </div>
                      </div>
                      {bc.target > 0 && (
                        <div className="w-full bg-emerald-900 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-500 ${over ? 'bg-red-800' : ''}`}
                            style={over ? { width: '100%' } : { width: `${pct}%`, background: 'linear-gradient(90deg, #c9a84c, #f0d080)' }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* Rows for the "by X" breakdown cards — sorted by amount desc with share bars */
function Breakdown({ rows, empty }) {
  const entries = Object.entries(rows || {}).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return <p className="text-emerald-300 text-sm">{empty}</p>
  const total = entries.reduce((s, [, v]) => s + v, 0)
  return (
    <div className="space-y-2.5">
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="flex items-center justify-between gap-2 text-xs mb-1">
            <span className="text-cream">{catLabel(k)}</span>
            <span className="text-gold-400">{inr(v)} <span className="text-emerald-500">· {Math.round((v / total) * 100)}%</span></span>
          </div>
          <div className="w-full bg-emerald-900 rounded-full h-1.5">
            <div className="h-1.5 rounded-full" style={{ width: `${(v / total) * 100}%`, background: 'linear-gradient(90deg, #c9a84c, #f0d080)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
