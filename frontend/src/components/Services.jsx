import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Scissors, Sparkles, Crown, Palette, Wind, Droplets, ArrowRight } from 'lucide-react'
import client from '../api/client'

const categoryIcons = {
  hair: Scissors,
  grooming: Wind,
  bridal: Crown,
  color: Palette,
  treatment: Droplets,
  general: Sparkles,
}

const categoryColors = {
  hair: 'from-emerald-700 to-emerald-600',
  grooming: 'from-slate-700 to-slate-600',
  bridal: 'from-rose-900 to-rose-800',
  color: 'from-violet-900 to-violet-800',
  treatment: 'from-teal-900 to-teal-800',
  general: 'from-emerald-800 to-emerald-700',
}

export default function Services() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get('/services/')
      .then(r => setServices(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <section id="services" className="py-28 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="text-gold-400 text-sm font-medium tracking-widest uppercase mb-4">Our Offerings</p>
          <h2 className="section-title">Signature Services</h2>
          <div className="gold-divider" />
          <p className="text-emerald-600 max-w-xl mx-auto mt-4 leading-relaxed">
            From classic cuts to grand bridal transformations, each service is a masterpiece.
          </p>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-card h-48 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((svc) => {
              const Icon = categoryIcons[svc.category] || Sparkles
              const gradient = categoryColors[svc.category] || categoryColors.general
              return (
                <div key={svc.id} className="service-card group">
                  {/* Icon badge */}
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-6 h-6 text-gold-300" />
                  </div>

                  <h3 className="font-display text-xl text-cream mb-2">{svc.name}</h3>
                  <p className="text-emerald-600 text-sm leading-relaxed mb-5">{svc.description}</p>

                  <div className="flex items-center justify-between mt-auto">
                    <div>
                      <span className="text-gold-400 font-semibold text-lg">₹{svc.price}</span>
                      <span className="text-emerald-600 text-xs ml-2">/ {svc.duration_mins} min</span>
                    </div>
                    <Link
                      to={`/book?service=${svc.id}`}
                      className="flex items-center gap-1 text-gold-400 text-sm hover:text-gold-300 transition-colors group/link"
                    >
                      Book
                      <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* CTA */}
        <div className="text-center mt-14">
          <Link to="/book" className="btn-gold inline-flex items-center gap-2">
            Book an Appointment <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </section>
  )
}
