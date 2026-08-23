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

export default function ServicesCarousel() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get('/services/')
      .then(r => setServices(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <section className="py-28 bg-emerald-900 border-t border-b border-emerald-800 overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        viewport={{ margin: "-50px" }}
        className="max-w-7xl mx-auto px-6 mb-16"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-gold-400 text-sm font-medium tracking-widest uppercase mb-4">Variant B</p>
            <h2 className="section-title !mb-0 text-left">Curated Experiences</h2>
            <div className="w-24 h-px bg-gold-500 mt-6" />
          </div>
          <p className="text-emerald-300 max-w-sm leading-relaxed font-light">
            Swipe through our collection of premium treatments designed to elevate your style and rejuvenate your spirit.
          </p>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex gap-6 px-6 overflow-x-auto pb-10 hide-scrollbar">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="min-w-[320px] md:min-w-[400px] h-[500px] bg-emerald-950/50 rounded-2xl animate-pulse flex-shrink-0" />
          ))}
        </div>
      ) : (
        <div className="flex gap-6 px-6 overflow-x-auto pb-10 hide-scrollbar snap-x snap-mandatory">
          {services.map((svc) => {
            const Icon = categoryIcons[svc.category] || Sparkles
            return (
              <motion.div 
                key={svc.id} 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                viewport={{ margin: "-50px" }}
                className="relative min-w-[85vw] sm:min-w-[400px] h-[550px] rounded-3xl overflow-hidden group snap-center flex-shrink-0"
              >
                {/* Background Image */}
                <img 
                  src={getServiceImage(svc.category)} 
                  alt={svc.name}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                />
                
                {/* Gradient Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-emerald-950 via-emerald-950/60 to-transparent opacity-90 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="absolute inset-0 bg-gold-900/10 mix-blend-overlay" />

                {/* Content */}
                <div className="absolute inset-0 p-8 flex flex-col justify-end">
                  <div className="transform translate-y-4 transition-transform duration-500 group-hover:translate-y-0">
                    <div className="w-12 h-12 rounded-full bg-emerald-900/80 backdrop-blur-sm border border-gold-500/30 flex items-center justify-center mb-6">
                      <Icon className="w-5 h-5 text-gold-400" />
                    </div>
                    
                    <h3 className="font-display text-3xl text-cream mb-3">{svc.name}</h3>
                    
                    {/* Hover revealed description */}
                    <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-500">
                      <div className="overflow-hidden">
                        <p className="text-emerald-100/90 text-sm leading-relaxed mb-6 font-light">
                          {svc.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-emerald-800/60 pt-5 mt-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-gold-400 font-display text-2xl">₹{svc.price}</span>
                        <span className="text-emerald-300 text-xs tracking-wider">/ {svc.duration_mins} MIN</span>
                      </div>
                      
                      <Link
                        to={`/book?service=${svc.id}`}
                        className="w-10 h-10 rounded-full bg-gold-500/20 flex items-center justify-center text-gold-400 hover:bg-gold-400 hover:text-emerald-950 transition-colors"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </section>
  )
}
