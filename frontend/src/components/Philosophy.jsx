import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import ScrollEntrance from './ScrollEntrance'

export default function Philosophy() {
  return (
    <section className="py-28 md:py-36 px-6 border-t border-cream/10">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-center">
        {/* Copy — takes the wider share, type leads */}
        <ScrollEntrance className="lg:col-span-7">
          <p className="text-gold-400 text-xs font-medium tracking-[0.25em] uppercase mb-5">
            Our Philosophy
          </p>
          <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.08] tracking-[-0.02em] text-cream">
            Sharp looks shouldn't cost a fortune,
            <span className="italic text-gold-400"> and they don't here.</span>
          </h2>
          <div className="mt-8 space-y-5 max-w-xl text-base md:text-[17px] text-cream/75 leading-relaxed">
              <p>
                We opened Ayra with one belief: a great saloon isn't gold taps
                and chandeliers — it is skill. A barber who reads your hairline
                before the first cut. Stylists who ask how the last colour
                aged. Chairs that never feel rushed.
              </p>
              <p>
                Twelve years on, that hasn't changed. Modern equipment,
                continuously trained stylists, fair prices — and precise work
                that looks like you on your best day, every day.
              </p>
          </div>

          {/* Pull-quote — the belief in one breath */}
          <blockquote className="mt-8 rounded-2xl border border-gold-500/20 bg-emerald-900/40 p-7 md:p-8">
            <p className="font-display italic text-xl md:text-2xl text-cream/90 leading-snug">
              “A great saloon isn't gold taps and chandeliers — it's skilled
              hands, clean tools, and honest prices.”
            </p>
          </blockquote>

          {/* Credentials strip */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              ['Hygiene-first studio', 'Sealed tools, sanitised chairs, every single client'],
              ['Certified stylists', 'Trained, re-trained, and held to a standard'],
              ['Upfront pricing', 'The quote is the price. No surprises at billing'],
            ].map(([title, body]) => (
              <div
                key={title}
                className="rounded-xl border border-cream/10 bg-emerald-900/30 px-5 py-4"
              >
                <p className="text-gold-400 text-sm font-medium">{title}</p>
                <p className="mt-1 text-sm text-cream/65 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex items-center gap-10">
            <div>
              <p className="font-display text-4xl text-gold-400">12+</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-cream/60">
                Years of mastery
              </p>
            </div>
            <div className="w-px h-12 bg-cream/15" aria-hidden="true" />
            <Link
              to="/book"
              className="inline-flex items-center gap-2 text-sm font-medium text-cream transition-colors duration-200 hover:text-gold-400"
            >
              Reserve your chair
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </ScrollEntrance>

        {/* Image — clip-path entrance on every downward pass; static on the way up */}
        <ScrollEntrance
          hiddenState={{ clipPath: 'inset(0% 0% 100% 0%)' }}
          visibleState={{ clipPath: 'inset(0% 0% 0% 0%)' }}
          duration={0.8}
          ease={[0.77, 0, 0.175, 1]}
          delay={0.08}
          className="lg:col-span-5"
        >
          <div className="aspect-[3/4] overflow-hidden rounded-2xl">
            <img
              src="/images/luxury_salon_hero.jpg"
              alt="Bright modern interior of Ayra Saloon, Tirunelveli, with professional styling stations"
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
        </ScrollEntrance>
      </div>
    </section>
  )
}
