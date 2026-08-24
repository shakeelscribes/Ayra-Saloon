import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { stylists } from '../data/team'
import TiltCard from '../components/TiltCard'
import StatCounter from '../components/StatCounter'
import Monogram from '../components/Monogram'
import CTABand from '../components/CTABand'
import usePageMeta from '../hooks/usePageMeta'

const EASE_OUT = [0.16, 1, 0.3, 1]

function StylistCard({ stylist, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.65, ease: EASE_OUT, delay: index * 0.12 }}
    >
      <TiltCard className="rounded-3xl">
        <div className="h-full rounded-3xl border border-cream/10 bg-emerald-900/40 backdrop-blur-sm p-8 md:p-10 flex flex-col items-center text-center gap-5">
          {/* Springy rotated role chip */}
          <motion.span
            initial={{ rotate: -8, scale: 0.9, opacity: 0 }}
            whileInView={{ rotate: -3, scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.25 + index * 0.12 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-gradient text-emerald-950 text-[11px] font-semibold uppercase tracking-[0.14em] shadow-md"
          >
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            {stylist.role}
          </motion.span>

          <Monogram name={stylist.name} photo={stylist.photo} />

          <h2 className="font-display text-4xl md:text-5xl text-cream tracking-tight">
            {stylist.name}
          </h2>
          <p className="text-cream/75 leading-relaxed max-w-sm">{stylist.tagline}</p>

          {/* Specialty chips */}
          <ul className="flex flex-wrap justify-center gap-2 mt-1">
            {stylist.specialties.slice(0, 3).map((s) => (
              <li
                key={s}
                className="px-3 py-1 rounded-full border border-gold-500/30 text-gold-300 text-xs uppercase tracking-wider"
              >
                {s}
              </li>
            ))}
          </ul>

          {/* Fun-fact teaser */}
          <p className="text-sm text-cream/55 italic">
            “{stylist.funFacts[1].value}”
          </p>

          {/* Mini stat */}
          <div className="flex items-center gap-2 text-sm text-cream/60">
            <StatCounter
              value={stylist.experienceYears}
              suffix="+"
              className="font-display text-2xl text-cream"
            />
            years in the craft
          </div>

          {/* CTAs */}
          <div className="mt-2 w-full flex flex-col sm:flex-row gap-3">
            <Link
              to={`/stylists/${stylist.slug}`}
              className="btn-outline flex-1 inline-flex items-center justify-center gap-2 !py-2.5"
            >
              Full profile
            </Link>
            <Link
              to={`/book?stylist=${encodeURIComponent(stylist.name)}`}
              className="btn-gold flex-1 inline-flex items-center justify-center gap-2 !py-2.5"
            >
              Book with {stylist.name}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </TiltCard>
    </motion.div>
  )
}

export default function StylistsPage() {
  usePageMeta({
    title: 'Meet Our Stylists | Ayra Saloon Tirunelveli',
    description:
      'Meet Raja and Ajay — the stylists behind Ayra Saloon, Tirunelveli. Precision fades, beard sculpting and custom tattoos with zero attitude. Book your chair online.',
  })

  return (
    <div className="min-h-screen pt-28 pb-24 px-6 overflow-x-clip">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          className="text-center mb-16"
        >
          <p className="text-gold-400 text-xs font-medium tracking-[0.25em] uppercase mb-5">
            The Team
          </p>
          <h1 className="font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.04] tracking-[-0.02em] text-cream">
            Two chairs.
            <br />
            <span className="italic text-gold-400">Zero attitude.</span>
          </h1>
          <p className="mt-6 text-base md:text-[17px] text-cream/75 leading-relaxed max-w-xl mx-auto">
            No army of junior trainees rotating through your appointment — you
            book the person you met. Small team, serious craft.
          </p>
        </motion.header>

        {/* Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10 [perspective:1200px]">
          {stylists.map((s, i) => (
            <StylistCard key={s.slug} stylist={s} index={i} />
          ))}
        </div>

        <p className="mt-12 text-center text-sm text-cream/55 italic">
          Looking for bridal? Those assignments are handled by our trusted
          partner artists — book a consultation and we will match you.
        </p>
      </div>

      <CTABand
        eyebrow="Convinced yet"
        title="Grab a chair?"
        sub="Pick your stylist, pick your slot — booking takes under a minute."
      />
    </div>
  )
}
