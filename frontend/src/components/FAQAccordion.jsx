import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { faqs } from '../data/landing'

const EASE_OUT = [0.16, 1, 0.3, 1]

/**
 * FAQ accordion — one item open at a time. Height animates via the
 * grid-rows-[0fr→1fr] technique (smooth without measuring content), the chevron
 * rotates 180° on open. Injects FAQPage JSON-LD for search engines and cleans
 * it up on unmount.
 */
export default function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState(0)
  const schemaRef = useRef(null)

  // FAQPage structured data — helps Google surface these Q&As directly.
  useEffect(() => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.id = 'faq-schema'
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    })
    document.head.appendChild(script)
    schemaRef.current = script
    return () => script.remove()
  }, [])

  return (
    <section className="py-28 md:py-36 px-6 border-t border-cream/10">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          className="text-center mb-14"
        >
          <p className="text-gold-400 text-xs font-medium tracking-[0.25em] uppercase mb-5">
            Questions
          </p>
          <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.08] tracking-[-0.02em] text-cream">
            Before you <span className="italic text-gold-400">ask.</span>
          </h2>
          <p className="mt-4 text-cream/60 leading-relaxed max-w-xl mx-auto">
            Everything you want to know before booking your chair. Still curious?
            One call away.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.1 }}
          className="divide-y divide-cream/10 border-y border-cream/10"
        >
          {faqs.map(({ q, a }, i) => {
            const open = openIndex === i
            return (
              <div key={q}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`faq-panel-${i}`}
                  onClick={() => setOpenIndex(open ? -1 : i)}
                  className="w-full flex items-center justify-between gap-6 py-6 text-left group"
                >
                  <span className="flex items-baseline gap-4">
                    <span
                      className="font-display text-gold-500/40 text-lg shrink-0 w-8"
                      aria-hidden="true"
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className={`font-medium transition-colors duration-200 ${open ? 'text-gold-400' : 'text-cream group-hover:text-gold-300'}`}>
                      {q}
                    </span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-gold-400 transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                    style={{ transitionTimingFunction: 'var(--ease-out)' }}
                    aria-hidden="true"
                  />
                </button>

                {/* Smooth height via grid-template-rows — no JS measurement */}
                <div
                  id={`faq-panel-${i}`}
                  role="region"
                  aria-hidden={!open}
                  className={`grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                  style={{ transitionTimingFunction: 'var(--ease-out)' }}
                >
                  <div className="overflow-hidden">
                    <p className="pb-6 pl-12 pr-4 text-cream/75 leading-relaxed md:text-[17px]">
                      {a}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
