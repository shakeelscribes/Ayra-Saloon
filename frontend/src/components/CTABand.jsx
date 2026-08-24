import { Link } from 'react-router-dom'
import { ArrowRight, Phone } from 'lucide-react'
import { motion } from 'framer-motion'

const EASE_OUT = [0.16, 1, 0.3, 1]

/**
 * Full-width call-to-action band. Reusable across pages — pass a different
 * eyebrow/title to repurpose it.
 */
export default function CTABand({
  eyebrow = 'Looking for',
  title = 'a sharp new look?',
  sub = 'Book online in under a minute — walk-ins welcome whenever a chair is free.',
}) {
  return (
    <section className="relative overflow-hidden border-t border-cream/10">
      {/* Soft gold glow, same radial language as the hero overlay */}
      <div
        className="absolute inset-0 opacity-60"
        style={{ background: 'radial-gradient(ellipse at center, rgba(201,168,76,0.08) 0%, transparent 70%)' }}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
        className="relative z-10 max-w-4xl mx-auto px-6 py-20 md:py-28 text-center"
      >
        <p className="text-gold-400 text-xs font-medium tracking-[0.25em] uppercase mb-4">
          {eyebrow}
        </p>
        <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.08] tracking-[-0.02em] text-cream">
          {title.split(' ').slice(0, -1).join(' ')}{' '}
          <span className="italic text-gold-400">{title.split(' ').slice(-1)}</span>
        </h2>
        <p className="mt-5 max-w-xl mx-auto text-base md:text-[17px] text-cream/75 leading-relaxed">
          {sub}
        </p>

        <div className="mt-9 flex flex-col sm:flex-row justify-center gap-4">
          <Link to="/book" className="btn-gold inline-flex items-center justify-center gap-2">
            Book your slot
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          <a href="tel:+918270606750" className="btn-outline inline-flex items-center justify-center gap-2">
            <Phone className="w-4 h-4" aria-hidden="true" />
            Call +91 82706 06750
          </a>
        </div>
      </motion.div>
    </section>
  )
}
