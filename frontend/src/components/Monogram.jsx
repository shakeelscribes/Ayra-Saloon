/**
 * Oversized monogram badge — the intentional placeholder until a real photo
 * drops in. Pass `photo` once available and it renders that instead.
 */
export default function Monogram({ name, photo, size = 'lg' }) {
  const dims = size === 'xl' ? 'w-44 h-44 text-7xl' : 'w-36 h-36 text-6xl'

  if (photo) {
    return (
      <img
        src={photo}
        alt={`${name}, stylist at Ayra Saloon`}
        className={`${dims} rounded-full object-cover border-2 border-gold-500/60 shadow-xl shadow-black/40`}
      />
    )
  }

  return (
    <div
      aria-label={`Portrait of ${name} coming soon`}
      className={`${dims} rounded-full border-2 border-gold-500/50 bg-emerald-900/60 flex items-center justify-center font-display italic text-gold-400 select-none shadow-xl shadow-black/40 relative overflow-hidden`}
    >
      {/* sheen sweep — playful shimmer, disabled under reduced motion */}
      <span className="absolute inset-0 animate-shimmer motion-reduce:animate-none bg-[linear-gradient(110deg,transparent_30%,rgba(240,208,128,0.12)_50%,transparent_70%)]" />
      {name
        .split(' ')
        .map((n) => n[0])
        .join('')}
    </div>
  )
}
