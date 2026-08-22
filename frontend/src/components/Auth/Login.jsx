import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, Scissors } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const user = await login(form.email, form.password)
      toast.success(`Welcome back, ${user.name}!`)
      navigate(user.is_admin ? '/admin' : '/')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-20">
      {/* Background orb */}
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-10 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #c9a84c, transparent)' }} />

      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gold-gradient flex items-center justify-center mx-auto mb-4">
            <Scissors className="w-8 h-8 text-emerald-950" />
          </div>
          <h1 className="font-display text-3xl text-cream">Welcome Back</h1>
          <div className="gold-divider" />
          <p className="text-emerald-600 text-sm mt-2">Sign in to manage your appointments</p>
        </div>

        <div className="glass-card p-8">
          <form onSubmit={submit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
                <input
                  id="login-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={handle}
                  required
                  className="luxury-input pl-11"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600" />
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handle}
                  required
                  className="luxury-input pl-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-600 hover:text-gold-400 transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn-gold w-full text-center mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Admin hint */}
          <div className="mt-5 p-3 rounded-xl bg-emerald-900/50 border border-emerald-800">
            <p className="text-emerald-600 text-xs text-center">
              Admin: <span className="text-gold-400">admin@ayrasaloon.com</span> / <span className="text-gold-400">admin123</span>
            </p>
          </div>

          <p className="text-center text-emerald-600 text-sm mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="text-gold-400 hover:text-gold-300 font-medium transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
