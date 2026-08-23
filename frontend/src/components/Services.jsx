import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { services } from '../data/landing'
import ScrollEntrance from './ScrollEntrance'

function ServiceRow({ service, index }) {
  const flip = index % 2 === 1

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-center py-16 md:py-24 border-t border-cream/10 first:border-t-0 first:pt-0">
      {/* Image — clip-path entrance on every downward pass; static on the way up */}
      <ScrollEntrance
        hiddenState={{ clipPath: 'inset(0% 0% 100% 0%)' }}
        visibleState={{ clipPath: 'inset(0% 0% 0% 0%)' }}
        duration={0.8}
        ease={[0.77, 0, 0.175, 1]}
        className={`md:col-span-7 aspect-[4/3] overflow-hidden rounded-2xl group ${
          flip ? 'md:order-2' : ''
        }`}
      >
        <img
          src={service.image}
          alt={service.name}
          loading="lazy"
          className="img-zoom w-full h-full object-cover"
        />
      </ScrollEntrance>

      {/* Copy */}
      <ScrollEntrance
        delay={0.1}
        className={`md:col-span-5 ${flip ? 'md:order-1' : ''}`}
      >
        <span className="font-display text-6xl text-gold-500/25 leading-none" aria-hidden="true">
          {service.id}
        </span>
        <h3 className="font-display text-3xl md:text-4xl text-cream mt-4 tracking-tight">
          {service.name}
        </h3>
        <p className="mt-4 text-cream/70 leading-relaxed font-light max-w-md">
          {service.description}
        </p>

        <ul className="mt-6 space-y-2">
          {service.details.map((d) => (
            <li key={d} className="flex items-center gap-3 text-sm text-cream/60">
              <span className="w-1 h-1 rounded-full bg-gold-400 shrink-0" aria-hidden="true" />
              {d}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex items-center gap-6">
          <span className="text-gold-400 font-display text-xl">{service.price}</span>
          <Link
            to="/book"
            className="inline-flex items-center gap-2 text-sm font-medium text-cream transition-colors duration-200 hover:text-gold-400"
          >
            Book this service
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </ScrollEntrance>
    </div>
  )
}

export default function Services() {
  return (
    <section id="services" className="py-28 md:py-36 px-6 scroll-mt-20">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <ScrollEntrance className="max-w-2xl mb-16 md:mb-24">
          <p className="text-gold-400 text-xs font-medium tracking-[0.25em] uppercase mb-5">
            Services
          </p>
          <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.08] tracking-[-0.02em] text-cream">
            Chosen by hand, <span className="italic text-gold-400">perfected by practice.</span>
          </h2>
        </ScrollEntrance>

        {services.map((s, i) => (
          <ServiceRow key={s.id} service={s} index={i} />
        ))}
      </div>
    </section>
  )
}
