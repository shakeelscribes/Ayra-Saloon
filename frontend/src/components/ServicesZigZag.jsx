import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Scissors, Sparkles, Crown, Palette, Wind, Droplets, ArrowRight, PenTool } from 'lucide-react'
import { motion } from 'framer-motion'
import client from '../api/client'

const categoryIcons = {
  hair: Scissors,
  grooming: Wind,
  bridal: Crown,
  color: Palette,
  treatment: Droplets,
  general: Sparkles,
  tattoo: PenTool,
}

const getServiceImage = (category) => {
  switch (category) {
    case 'hair': return '/images/service_hair.jpg';
    case 'grooming': return '/images/service_grooming.jpg';
    case 'bridal': return '/images/service_bridal.jpg';
    case 'tattoo': return '/images/service_tattoo.jpg';
    default: return '/images/service_hair.jpg'; // Using hair as a beautiful fallback
  }
}

export default function ServicesZigZag() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get('/services/')
      .then(r => setServices(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <section className="py-28 px-6 bg-emerald-950">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-24">
          <p className="text-gold-400 text-sm font-medium tracking-widest uppercase mb-4">Variant A</p>
          <h2 className="section-title">The Signature Collection</h2>
          <div className="gold-divider" />
          <p className="text-emerald-500 max-w-xl mx-auto mt-4 leading-relaxed font-light">
            An alternating showcase of our most requested services.
          </p>
        </div>

        {loading ? (
          <div className="space-y-20 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-96 bg-emerald-900/50 rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-32">
            {services.map((svc, index) => {
              const Icon = categoryIcons[svc.category] || Sparkles
              const isEven = index % 2 === 0
              
              return (
                <div key={svc.id} className={`flex flex-col gap-12 items-center ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}>
                  {/* Image Side */}
                  <motion.div 
                    initial={{ clipPath: 'inset(0 0 100% 0)', filter: 'blur(10px)' }}
                    whileInView={{ clipPath: 'inset(0 0 0 0)', filter: 'blur(0px)' }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    viewport={{ margin: "-100px" }}
                    className="w-full lg:w-1/2 relative group"
                  >
                    <div className="absolute inset-0 bg-gold-500/20 rounded-2xl transform translate-x-4 translate-y-4 transition-transform group-hover:translate-x-6 group-hover:translate-y-6" />
                    <img 
                      src={getServiceImage(svc.category)} 
                      alt={svc.name}
                      className="relative z-10 w-full h-[500px] object-cover rounded-2xl shadow-2xl transition-transform duration-700 group-hover:scale-[1.02]"
                    />
                    {/* Icon floating badge */}
                    <div className="absolute -top-6 -left-6 z-20 w-16 h-16 rounded-full bg-emerald-900 border border-gold-500/30 flex items-center justify-center shadow-xl">
                      <Icon className="w-8 h-8 text-gold-400" />
                    </div>
                  </motion.div>

                  {/* Text Side */}
                  <motion.div 
                    initial={{ opacity: 0, y: 30, filter: 'blur(4px)' }}
                    whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    viewport={{ margin: "-100px" }}
                    className="w-full lg:w-1/2 px-4 lg:px-12"
                  >
                    <p className="text-gold-400 text-sm tracking-widest uppercase mb-3 flex items-center gap-2">
                      <span className="w-8 h-px bg-gold-400"></span>
                      {svc.category}
                    </p>
                    <h3 className="font-display text-4xl text-cream mb-6">{svc.name}</h3>
                    <p className="text-emerald-200 text-lg leading-relaxed mb-8 font-light">
                      {svc.description}
                    </p>
                    
                    <div className="flex items-center gap-8 mb-10">
                      <div>
                        <p className="text-sm text-emerald-500 uppercase tracking-wider mb-1">Investment</p>
                        <p className="text-2xl text-gold-400 font-display">₹{svc.price}</p>
                      </div>
                      <div className="w-px h-12 bg-emerald-800" />
                      <div>
                        <p className="text-sm text-emerald-500 uppercase tracking-wider mb-1">Duration</p>
                        <p className="text-2xl text-cream font-display">{svc.duration_mins} min</p>
                      </div>
                    </div>

                    <Link
                      to={`/book?service=${svc.id}`}
                      className="btn-gold inline-flex items-center gap-2 !px-8"
                    >
                      Reserve Session <ArrowRight className="w-4 h-4" />
                    </Link>
                  </motion.div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
