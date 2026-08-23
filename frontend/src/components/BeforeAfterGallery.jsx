import { motion } from 'framer-motion'
import { ComparisonSlider } from './ui/comparison-slider'
import { transformations } from '../data/landing'

const EASE_OUT = [0.16, 1, 0.3, 1]

function Chip({ children, side }) {
  return (
    <span
      className={`absolute top-3 z-10 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-[0.18em] bg-emerald-950/80 backdrop-blur-sm border pointer-events-none ${
        side === 'left'
          ? 'left-3 border-cream/20 text-cream/80'
          : 'right-3 border-gold-500/40 text-gold-300'
      }`}
    >
      {children}
    </span>
  )
}

/**
 * Before/After gallery — drag the divider to reveal the transformation.
 * Photos are PLACEHOLDER pairs; swap files in /public/images when real
 * transformation shots are ready (slots live in data/landing.js).
 */
export default function BeforeAfterGallery() {
  return (
    <section className="py-28 md:py-36 px-6 border-t border-cream/10">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          className="max-w-2xl mb-14 md:mb-20"
        >
          <p className="text-gold-400 text-xs font-medium tracking-[0.25em] uppercase mb-5">
            Real work, no filters
          </p>
          <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.08] tracking-[-0.02em] text-cream">
            Slide to see <span className="italic text-gold-400">the change.</span>
          </h2>
          <p className="mt-4 text-cream/60 leading-relaxed max-w-xl">
            Drag the handle and judge for yourself — every look below walked out
            of our chairs in Samathanapuram.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
          {transformations.map(({ title, caption, before, after }, i) => (
            <motion.figure
              key={title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, ease: EASE_OUT, delay: i * 0.07 }}
            >
              <div className="relative rounded-2xl overflow-hidden border border-cream/10 group">
                <ComparisonSlider
                  before={<img src={before} alt={`${title} — before`} loading="lazy" className="w-full h-full aspect-[4/3] object-cover" />}
                  after={<img src={after} alt={`${title} — after`} loading="lazy" className="w-full h-full aspect-[4/3] object-cover" />}
                  defaultPosition={50}
                  label={`Drag to compare ${title} before and after`}
                  className="aspect-[4/3]"
                />
                <Chip side="left">Before</Chip>
                <Chip side="right">After</Chip>
              </div>
              <figcaption className="mt-4 flex items-baseline justify-between gap-4">
                <span className="font-display text-xl text-cream">{title}</span>
                <span className="text-sm text-cream/60 text-right">{caption}</span>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}
