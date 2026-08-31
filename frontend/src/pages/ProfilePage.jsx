import { useState } from 'react'
import { User, Phone, Save, CheckCircle2 } from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import client from '../api/client'
import { useAuth } from '../context/AuthContext'
import usePageMeta from '../hooks/usePageMeta'

const EASE_OUT = [0.16, 1, 0.3, 1]

export default function ProfilePage() {
  usePageMeta({
    title: 'My Profile | Ayra Unisex Salon Tirunelveli',
    description: 'Manage your Ayra Unisex Salon profile — name, WhatsApp number and preferences.',
  })

  const { user, updateUser } = useAuth()
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    gender: user?.gender || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setSaved(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await client.put('/users/me', {
        name: form.name,
        phone: form.phone,
        gender: form.gender || null,
      })
      updateUser({ name: data.name, phone: data.phone, gender: data.gender })
      toast.success('Profile saved')
      setSaved(true)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen pt-28 pb-24 px-6">
      <div className="max-w-xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        >
          <p className="text-gold-400 text-xs font-medium tracking-[0.25em] uppercase mb-5">
            My Profile
          </p>
          <h1 className="font-display text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.06] tracking-[-0.02em] text-cream">
            Your details, <span className="italic text-gold-400">your way.</span>
          </h1>
          <p className="mt-4 text-cream/75 leading-relaxed">
            Keep this updated — your WhatsApp number is where booking
            confirmations reach you, and your gender helps us pre-fill
            the right services.
          </p>
        </motion.div>

        <motion.form
          onSubmit={handleSave}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.1 }}
          className="glass-card p-6 sm:p-8 mt-10 space-y-5"
        >
          <div>
            <label className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">
              Full Name
            </label>
            <input
              value={form.name}
              onChange={set('name')}
              required
              className="luxury-input"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">
              Email
            </label>
            <input
              value={user?.email || ''}
              disabled
              className="luxury-input opacity-60 cursor-not-allowed"
            />
            <p className="text-emerald-300 text-xs mt-1.5">Email can't be changed.</p>
          </div>

          <div>
            <label className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">
              WhatsApp Number
            </label>
            <input
              value={form.phone}
              onChange={set('phone')}
              className="luxury-input"
              placeholder="+91 98765 43210"
            />
            <p className="text-emerald-300 text-xs mt-1.5">
              Booking updates reach you here on WhatsApp.
            </p>
          </div>

          <div>
            <label className="text-gold-400 text-xs font-medium tracking-widest uppercase block mb-2">
              Gender
            </label>
            <select value={form.gender} onChange={set('gender')} className="luxury-input">
              <option value="">Prefer not to say</option>
              <option value="men">Male</option>
              <option value="women">Female</option>
            </select>
            <p className="text-emerald-300 text-xs mt-1.5">
              Pre-fills the right services when you book.
            </p>
          </div>

          <button type="submit" disabled={saving} className="btn-gold w-full inline-flex items-center justify-center gap-2">
            {saving ? 'Saving…' : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save changes</>}
          </button>
        </motion.form>
      </div>
    </div>
  )
}
