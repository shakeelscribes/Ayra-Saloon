import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, Scissors, Crown } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

// "Switchboard" login — one form, one segmented door toggle. The door you pick
// is pure UX: accent, copy and CTA swap with it, but the account's ROLE decides
// where you land (owner → salon console, stylist → your chair dashboard), so
// picking the wrong door is harmless — you still end up in the right place.
const DOORS = {
  stylist: {
    label: 'Stylist',
    icon: Scissors,
    title: 'Stylist Login',
    sub: 'Your schedule & your earnings',
    cta: 'Sign in to my chair',
    accent: '#34d399',
    welcome: (name) => `Welcome back, ${name} — this is your chair's dashboard`,
  },
  admin: {
    label: 'Admin',
    icon: Crown,
    title: 'Admin Login',
    sub: 'Salon-wide stats, expenses & budget',
    cta: 'Sign in to console',
    accent: '#c9a84c',
    welcome: () => 'Signed in as Owner — opening the salon console',
  },
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [door, setDoor] = useState('stylist')
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const d = DOORS[door]
  const DoorIcon = d.icon

  const handle = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: undefined })
  }

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!form.email.trim()) next.email = 'Enter your email address'
    if (!form.password) next.password = 'Enter your password'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    try {
      const user = await login(form.email, form.password)
      const role = user.role || (user.stylist_id ? 'stylist' : 'owner')
      if (role === 'stylist') {
        toast.success(DOORS.stylist.welcome(user.name))
      } else {
        toast.success(DOORS.admin.welcome(user.name))
      }
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 relative">
      {/* Background orb */}
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-10 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #c9a84c, transparent)' }} />

      <div className="w-full max-w-md animate-slide-up">
        {/* Brand */}
        <div className="text-center mb-8">
          <img
            src="/brand/ayra-mark.png"
            alt="Ayra Unisex Salon emblem"
            className="w-14 h-14 mx-auto mb-3 transition-transform duration-300 hover:scale-105"
          />
          <h1 className="font-display text-2xl text-cream">Ayra Unisex Salon</h1>
          <div className="gold-divider" />
          <p className="text-emerald-300 text-sm">Staff panel — choose your door and sign in</p>
        </div>

        {/* Door toggle */}
        <div className="login-seg mb-5" role="tablist" aria-label="Choose your door">
          <span className="login-seg-highlight" aria-hidden="true"
            style={{
              transform: door === 'stylist' ? 'translateX(0)' : 'translateX(100%)',
              borderColor: d.accent,
            }} />
          {Object.entries(DOORS).map(([key, cfg]) => {
            const Icon = cfg.icon
            return (
              <button key={key} type="button" role="tab" aria-selected={door === key}
                className="login-seg-item" data-active={door === key || undefined}
                onClick={() => setDoor(key)}>
                <Icon className="w-4 h-4" style={door === key ? { color: cfg.accent } : undefined} />
                {cfg.label}
              </button>
            )
          })}
        </div>

        {/* One form — accent follows the door */}
        <form onSubmit={submit} noValidate className="glass-card p-8 relative overflow-hidden">
          {/* Accent bar — persistent, color crossfades; never remounts with the swap */}
          <div className="login-accent-bar" style={{ backgroundColor: d.accent }} />
          <div key={door} className="login-swap">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: door === 'stylist' ? 'rgba(52,211,153,0.12)' : 'rgba(201,168,76,0.12)',
                  color: d.accent,
                }}>
                <DoorIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-xl text-cream leading-tight">{d.title}</h2>
                <p className="text-emerald-300 text-xs mt-0.5">{d.sub}</p>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="login-email" className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-300" />
              <input
                id="login-email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@ayrasaloon.com"
                value={form.email}
                onChange={handle}
                className={`luxury-input pl-11 ${errors.email ? 'input-error' : ''}`}
              />
            </div>
            {errors.email && <p className="text-red-400 text-xs mt-1.5" role="alert">{errors.email}</p>}
          </div>

          <div className="mb-5">
            <label htmlFor="login-password" className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-300" />
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={handle}
                className={`luxury-input pl-11 pr-11 ${errors.password ? 'input-error' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-300 hover:text-gold-400 transition-colors"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && <p className="text-red-400 text-xs mt-1.5" role="alert">{errors.password}</p>}
          </div>

          <div key={`cta-${door}`} className="login-swap">
            <button type="submit" disabled={loading} className="btn-gold w-full text-center">
              {loading ? 'Signing in…' : d.cta}
            </button>
          </div>
        </form>

        <p className="text-center text-emerald-300/60 text-xs mt-6">
          Either door signs you in — the panel opens where your role belongs.
        </p>
      </div>
    </div>
  )
}
