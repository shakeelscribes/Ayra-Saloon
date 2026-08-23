import { Star } from 'lucide-react'
import { testimonials } from '../data/landing'
import ScrollEntrance from './ScrollEntrance'

export default function Testimonials() {
  return (
    <section className="py-28 md:py-36 px-6 border-t border-cream/10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <ScrollEntrance className="max-w-2xl mb-16 md:mb-20">
          <p className="text-gold-400 text-xs font-medium tracking-[0.25em] uppercase mb-5">
            Client Stories
          </p>
          <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.08] tracking-[-0.02em] text-cream">
            Word travels <span className="italic text-gold-400">quietly.</span>
          </h2>
        </ScrollEntrance>

        {/* Cards — short stagger on every downward pass; static on the way up */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map(({ name, role, text, avatar }, i) => (
            <ScrollEntrance
              key={name}
              as="figure"
              duration={0.55}
              delay={i * 0.06}
              className="flex flex-col justify-between rounded-2xl border border-cream/10 bg-emerald-900/40 p-8 transition-colors duration-300 hover:border-gold-500/30"
            >
              <div>
                <div className="flex gap-1 mb-6" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="w-3.5 h-3.5 fill-gold-400 text-gold-400" aria-hidden="true" />
                  ))}
                </div>
                <blockquote className="text-cream/80 leading-relaxed font-light">
                  “{text}”
                </blockquote>
              </div>
              <figcaption className="mt-8 pt-6 border-t border-cream/10 flex items-center gap-4">
                {avatar ? (
                  <img
                    src={avatar}
                    alt={`Portrait of ${name}`}
                    loading="lazy"
                    className="w-11 h-11 rounded-full object-cover border border-gold-500/30 shrink-0"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="w-11 h-11 rounded-full bg-emerald-800 border border-gold-500/30 shrink-0 flex items-center justify-center font-display text-gold-400 text-lg"
                  >
                    {name.charAt(0)}
                  </span>
                )}
                <span>
                  <span className="block text-cream font-medium">{name}</span>
                  <span className="block text-cream/50 text-sm mt-0.5">{role}</span>
                </span>
              </figcaption>
            </ScrollEntrance>
          ))}
        </div>
      </div>
    </section>
  )
}
