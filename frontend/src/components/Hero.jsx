import { Link } from 'react-router-dom'
import { ArrowRight, Star, Award, Clock } from 'lucide-react'

const stats = [
  { icon: Star, label: 'Happy Clients', value: '2,000+' },
  { icon: Award, label: 'Years of Excellence', value: '12+' },
  { icon: Clock, label: 'Services Offered', value: '20+' },
]

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 bg-luxury-gradient" />
      <div className="absolute inset-0 hero-overlay" />

      {/* Decorative gold orbs */}
      <div className="absolute top-1/4 left-10 w-64 h-64 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #c9a84c, transparent)' }} />
      <div className="absolute bottom-1/4 right-10 w-96 h-96 rounded-full opacity-5"
        style={{ background: 'radial-gradient(circle, #c9a84c, transparent)' }} />

      {/* Decorative lines */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-32 bg-gradient-to-b from-transparent to-gold-500 opacity-30" />

      <div className="relative z-10 max-w-4xl mx-auto text-center px-6 animate-fade-in">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 glass-card px-5 py-2 mb-8">
          <span className="w-2 h-2 rounded-full bg-gold-400 animate-pulse" />
          <span className="text-gold-400 text-sm font-medium tracking-widest uppercase">
            Luxury Hair & Beauty
          </span>
        </div>

        {/* Heading */}
        <h1 className="font-display text-5xl md:text-7xl text-cream leading-tight mb-6">
          Where Beauty
          <span className="block italic text-gold-400">Meets Elegance</span>
        </h1>

        {/* Subtext */}
        <p className="text-emerald-600 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed font-light">
          Experience the finest grooming services in a sanctuary of luxury.
          Our master stylists craft each look with artistry and precision.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
          <Link to="/book" id="hero-book-btn" className="btn-gold flex items-center gap-2 text-base !px-10 !py-4">
            Book Your Experience
            <ArrowRight className="w-5 h-5" />
          </Link>
          <a href="#services" className="btn-outline text-base !px-10 !py-4">
            Explore Services
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 max-w-2xl mx-auto">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="glass-card px-4 py-5 text-center">
              <Icon className="w-5 h-5 text-gold-400 mx-auto mb-2" />
              <p className="font-display text-2xl text-cream">{value}</p>
              <p className="text-emerald-600 text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-50">
        <span className="text-xs text-gold-400 tracking-widest uppercase">Scroll</span>
        <div className="w-px h-12 bg-gradient-to-b from-gold-400 to-transparent" />
      </div>
    </section>
  )
}
