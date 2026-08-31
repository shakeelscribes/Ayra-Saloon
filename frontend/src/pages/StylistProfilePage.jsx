import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  MessageCircle,
  Music,
  PenTool,
  Scissors,
  Sparkles,
} from 'lucide-react'
import { getStylistBySlug } from '../data/team'
import TiltCard from '../components/TiltCard'
import StatCounter from '../components/StatCounter'
import Monogram from '../components/Monogram'
import usePageMeta from '../hooks/usePageMeta'

const EASE_OUT = [0.16, 1, 0.3, 1]

const FUN_FACT_ICONS = {
  music: Music,
  scissors: Scissors,
  chat: MessageCircle,
  pen: PenTool,
  sparkles: Sparkles,
}

export default function StylistProfilePage() {
  const { slug } = useParams()
  const stylist = getStylistBySlug(slug)

  const metaTitle = stylist
    ? `${stylist.name} — ${stylist.role} | Ayra Unisex Salon Tirunelveli`
    : 'Ayra Unisex Salon Team'

  usePageMeta({
    title: metaTitle,
    description: stylist
      ? `${stylist.name}, ${stylist.role.toLowerCase()} at Ayra Unisex Salon Tirunelveli. ${stylist.tagline} Book your chair online.`
      : undefined,
  })

  // JSON-LD Person — helps search engines attach the profile to the salon.
  useEffect(() => {
    if (!stylist) return
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.id = `person-schema-${stylist.slug}`
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: stylist.name,
      jobTitle: stylist.role,
      description: stylist.bio[0],
      worksFor: { '@type': 'HairSalon', name: 'Ayra Unisex Salon', address: 'Tirunelveli, Tamil Nadu, India' },
      knowsAbout: stylist.specialties,
    })
    document.head.appendChild(script)
    return () => script.remove()
  }, [stylist])

  if (!stylist) return <Navigate to="/stylists" replace />

  return (
    <div className="min-h-screen pt-28 pb-24 px-6 overflow-x-clip">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          {/* Main column */}
          <div className="lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT }}
            >
              <motion.span
                initial={{ rotate: -8, scale: 0.9 }}
                animate={{ rotate: -3, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.2 }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-gradient text-emerald-950 text-[11px] font-semibold uppercase tracking-[0.14em] shadow-md"
              >
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                {stylist.role}
              </motion.span>

              <h1 className="mt-5 font-display text-[clamp(2.75rem,6vw,4.5rem)] leading-[1.02] tracking-[-0.02em] text-cream">
                {stylist.name.split(' ')[0]}
                <span className="italic text-gold-400">.</span>
              </h1>
              <p className="mt-4 text-lg text-cream/80 font-medium max-w-xl">
                {stylist.tagline}
              </p>
            </motion.div>

            {/* Stats band */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.1 }}
              className="mt-10 grid grid-cols-3 gap-4"
            >
              {stylist.stats.map(({ value, suffix, label }) => (
                <div key={label} className="glass-card p-5 text-center">
                  <StatCounter
                    value={value}
                    suffix={suffix}
                    className="font-display text-3xl md:text-4xl text-gold-400"
                  />
                  <p className="mt-1.5 text-xs uppercase tracking-[0.15em] text-cream/60">
                    {label}
                  </p>
                </div>
              ))}
            </motion.div>

            {/* Bio */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.05 }}
              className="mt-10 space-y-5 max-w-xl text-base md:text-[17px] text-cream/75 leading-relaxed"
            >
              {stylist.bio.map((para) => (
                <p key={para.slice(0, 24)}>{para}</p>
              ))}
            </motion.div>

            {/* Specialties */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, ease: EASE_OUT }}
              className="mt-10"
            >
              <p className="text-xs uppercase tracking-[0.22em] text-gold-400 mb-3">
                Specialties
              </p>
              <ul className="flex flex-wrap gap-2">
                {stylist.specialties.map((s) => (
                  <li
                    key={s}
                    className="px-3.5 py-1.5 rounded-full border border-gold-500/30 bg-emerald-900/40 text-gold-300 text-sm"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Services handled */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, ease: EASE_OUT }}
              className="mt-8"
            >
              <p className="text-xs uppercase tracking-[0.22em] text-gold-400 mb-3">
                What they handle
              </p>
              <ul className="flex flex-wrap gap-2">
                {stylist.servicesHandled.map((cat) => (
                  <li key={cat}>
                    <Link
                      to={`/services#cat-${cat}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-cream/15 text-cream/80 text-sm hover:border-gold-500/40 hover:text-gold-300 transition-colors duration-200 capitalize"
                    >
                      {cat === 'grooming' ? 'beard & grooming' : cat}
                      <ArrowRight className="w-3 h-3" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Fun facts */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, ease: EASE_OUT }}
              className="mt-12"
            >
              <p className="text-xs uppercase tracking-[0.22em] text-gold-400 mb-4">
                Beyond the chair
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {stylist.funFacts.map(({ icon, label, value }, i) => {
                  const Icon = FUN_FACT_ICONS[icon] || Sparkles
                  return (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, y: 16, rotate: i % 2 ? 1.5 : -1.5 }}
                      whileInView={{ opacity: 1, y: 0, rotate: i % 2 ? 1 : -1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.45, ease: EASE_OUT, delay: i * 0.08 }}
                      className="rounded-2xl border border-gold-500/20 bg-emerald-900/40 p-5"
                    >
                      <Icon className="w-5 h-5 text-gold-400" aria-hidden="true" />
                      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-cream/50">
                        {label}
                      </p>
                      <p className="mt-1 text-cream font-medium leading-snug">{value}</p>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          </div>

          {/* Sticky side column: portrait slot + booking */}
          <div className="lg:col-span-5 lg:sticky lg:top-28 flex flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.15 }}
            >
              <TiltCard max={4} className="rounded-3xl">
                <div className="rounded-3xl border border-cream/10 bg-emerald-900/40 p-6 flex flex-col items-center gap-6">
                  <Monogram name={stylist.name} photo={stylist.photo} size="xl" />
                  <p className="text-xs uppercase tracking-[0.2em] text-cream/50 text-center">
                    {stylist.photo ? '' : 'Photo dropping soon'}
                  </p>
                </div>
              </TiltCard>

              <div className="rounded-3xl border border-gold-500/25 bg-emerald-900/60 backdrop-blur-sm p-7 mt-6 shadow-xl shadow-black/30">
                <p className="font-display italic text-xl md:text-2xl text-cream leading-snug">
                  “Grab the chair before someone else does.”
                </p>
                <Link
                  to={`/book?stylist=${encodeURIComponent(stylist.name)}`}
                  className="btn-gold mt-6 w-full inline-flex items-center justify-center gap-2"
                >
                  Book with {stylist.name}
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
                <p className="mt-3 text-center text-xs text-cream/55">
                  Walk-ins welcome whenever the chair is free.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
