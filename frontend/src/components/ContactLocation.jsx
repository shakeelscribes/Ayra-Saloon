import { Link } from 'react-router-dom'
import { Phone, MapPin, Clock, ArrowRight } from 'lucide-react'
import ScrollEntrance from './ScrollEntrance'

const details = [
  {
    icon: Phone,
    title: 'Direct line',
    body: (
      <a href="tel:+918270606750" className="transition-colors duration-200 hover:text-gold-400">
        +91 82706 06750
      </a>
    ),
  },
  {
    icon: MapPin,
    title: 'Find us',
    body: (
      <a
        href="https://maps.app.goo.gl/QLcLJ9cR52dpPg3b7"
        target="_blank"
        rel="noopener noreferrer"
        className="transition-colors duration-200 hover:text-gold-400"
      >
        1C1/1, Kayal Complex, Military Line,
        <br />
        Samathanapuram, Tirunelveli, Tamil Nadu
      </a>
    ),
  },
  {
    icon: Clock,
    title: 'Hours',
    body: (
      <>
        Mon – Sat · 9:00 AM – 8:00 PM
        <br />
        Sunday · By appointment
      </>
    ),
  },
]

export default function ContactLocation() {
  return (
    <section id="contact" className="py-28 md:py-36 px-6 border-t border-cream/10">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        {/* Info */}
        <ScrollEntrance>
          <p className="text-gold-400 text-xs font-medium tracking-[0.25em] uppercase mb-5">
            Visit Us
          </p>
          <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.08] tracking-[-0.02em] text-cream">
            Your chair is <span className="italic text-gold-400">waiting.</span>
          </h2>

          <div className="mt-12 space-y-8">
            {details.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-start gap-5">
                <div className="w-11 h-11 rounded-full border border-gold-500/30 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-gold-400" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-cream font-medium">{title}</h3>
                  <p className="text-cream/60 mt-1 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollEntrance>

        {/* CTA panel — one translucent surface, no stacking of lights (apple-design §12) */}
        <ScrollEntrance
          delay={0.1}
          className="rounded-3xl bg-emerald-900/50 backdrop-blur-xl border border-gold-500/20 p-10 md:p-14 shadow-2xl shadow-black/30"
        >
          <p className="font-display italic text-2xl md:text-3xl text-cream/90 leading-snug">
            “Walk out feeling like the best version of yourself — every single time.”
          </p>
          <p className="mt-6 text-sm uppercase tracking-[0.2em] text-gold-400">
            The Ayra Promise
          </p>

          <div className="mt-10 pt-8 border-t border-cream/10">
            <p className="text-cream/70 leading-relaxed mb-8">
              First visit? Book online in under a minute and our team will hold
              your slot — walk-ins welcome when the chair is free.
            </p>
            <Link to="/book" className="btn-gold w-full inline-flex items-center justify-center gap-2">
              Book an appointment
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </ScrollEntrance>
      </div>
    </section>
  )
}
