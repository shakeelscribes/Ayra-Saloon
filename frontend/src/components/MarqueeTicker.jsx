import { marqueeWords } from '../data/landing'

/**
 * Infinite keyword ticker — a single duplicated track translating to -50%,
 * so the loop point is invisible. Decorative only (aria-hidden); under
 * prefers-reduced-motion the animation stops and the words simply wrap.
 */
export default function MarqueeTicker() {
  return (
    <div
      className="relative overflow-hidden bg-emerald-900/40 py-3"
      aria-hidden="true"
    >
      <div className="flex w-max animate-marquee motion-reduce:w-full motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center">
            {marqueeWords.map((word) => (
              <span
                key={word}
                className="mx-5 flex items-center gap-5 whitespace-nowrap text-xs md:text-sm uppercase tracking-[0.24em] text-cream/60"
              >
                {word}
                <span className="text-gold-500 text-[0.7em]" aria-hidden="true">
                  ✦
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
