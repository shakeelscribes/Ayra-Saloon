import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, User, Phone, Eye, EyeOff, Scissors } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'

export default function Signup() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', gender: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      const user = await register(form.name, form.email, form.password, form.phone, form.gender)
      toast.success(`Welcome to Ayra Saloon, ${user.name}!`)
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const fields = [
    { id: 'signup-name', name: 'name', type: 'text', label: 'Full Name', placeholder: 'Your full name', Icon: User, autoComplete: 'name' },
    { id: 'signup-email', name: 'email', type: 'email', label: 'Email Address', placeholder: 'you@example.com', Icon: Mail, autoComplete: 'email' },
    { id: 'signup-phone', name: 'phone', type: 'tel', label: 'Phone Number', placeholder: '+91 98765 43210', Icon: Phone, autoComplete: 'tel' },
  ]

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-20 pb-10">
      <div className="fixed top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full opacity-10 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #c9a84c, transparent)' }} />

      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-gold-gradient flex items-center justify-center mx-auto mb-4">
            <Scissors className="w-8 h-8 text-emerald-950" />
          </div>
          <h1 className="font-display text-3xl text-cream">Create Account</h1>
          <div className="gold-divider" />
          <p className="text-emerald-300 text-sm mt-2">Join Ayra Saloon — modern grooming for everyone</p>
        </div>

        <div className="glass-card p-8">
          <form onSubmit={submit} className="space-y-5">
            {fields.map(({ id, name, type, label, placeholder, Icon, autoComplete }) => (
              <div key={name}>
                <label className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">
                  {label}
                </label>
                <div className="relative">
                  <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-300" />
                  <input
                    id={id}
                    type={type}
                    name={name}
                    autoComplete={autoComplete}
                    placeholder={placeholder}
                    value={form[name]}
                    onChange={handle}
                    required={name !== 'phone'}
                    className="luxury-input pl-11"
                  />
                </div>
              </div>
            ))}

            {/* Gender — stored on the profile so the booking flow can skip
                the "for whom" step (locked decision #9). Optional. */}
            <div>
              <label htmlFor="signup-gender" className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">
                Gender
              </label>
              <select
                id="signup-gender"
                name="gender"
                value={form.gender}
                onChange={handle}
                className="luxury-input"
              >
                <option value="">Prefer not to say</option>
                <option value="men">Male</option>
                <option value="women">Female</option>
              </select>
              <p className="text-emerald-300 text-xs mt-1.5">Pre-fills the right services when you book.</p>
            </div>

            {/* Password */}
            <div>
              <label className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-300" />
                <input
                  id="signup-password"
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  placeholder="Min 6 characters"
                  value={form.password}
                  onChange={handle}
                  required
                  className="luxury-input pl-11 pr-11"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-300 hover:text-gold-400 transition-colors">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button id="signup-submit" type="submit" disabled={loading} className="btn-gold w-full text-center mt-2">
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-emerald-300 text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-gold-400 hover:text-gold-300 font-medium transition-colors">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
