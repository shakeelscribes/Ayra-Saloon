import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Scissors, Sparkles, Crown, Palette, Wind, Droplets, ArrowRight, PenTool, ChevronUp, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
    default: return '/images/service_hair.jpg';
  }
}

export default function ServicesClickSlide() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState(1) // 1 for down, -1 for up

  useEffect(() => {
    client.get('/services/')
      .then(r => setServices(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleNext = () => {
    setDirection(1)
    setCurrentIndex((prev) => (prev + 1) % services.length)
  }

  const handlePrev = () => {
    setDirection(-1)
    setCurrentIndex((prev) => (prev - 1 + services.length) % services.length)
  }

  const variants = {
    enter: (dir) => ({
      y: dir > 0 ? 1000 : -1000,
      opacity: 0,
      scale: 0.9,
    }),
    center: {
      zIndex: 1,
      y: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (dir) => ({
      zIndex: 0,
      y: dir < 0 ? 1000 : -1000,
      opacity: 0,
      scale: 0.9,
    })
  }

  return (
    <section className="bg-emerald-900 py-24 px-6 border-t border-emerald-800 relative overflow-hidden">
      <div className="max-w-7xl mx-auto flex flex-col xl:flex-row items-center gap-12 xl:gap-20">
        
        {/* Text Section */}
        <div className="w-full xl:w-1/3 xl:py-20 text-center xl:text-left z-10">
          <h2 className="text-gold-400 text-sm font-medium tracking-widest uppercase mb-4">PROTOTYPE 2</h2>
          <h3 className="font-display text-4xl md:text-5xl text-cream mb-6">Curated Selection</h3>
          <div className="w-24 h-px bg-gold-500 mx-auto xl:mx-0 mb-8" />
          <p className="text-emerald-300 font-light leading-relaxed mb-12">
            Interact to explore our services, from precision cuts to fine-line tattoos.
          </p>
          
          <div className="flex xl:flex-col gap-4 justify-center xl:justify-start">
            <button 
              onClick={handlePrev}
              className="w-14 h-14 rounded-full border border-gold-500/30 flex items-center justify-center text-gold-400 hover:bg-gold-500/10 transition-colors"
            >
              <ChevronUp className="w-6 h-6" />
            </button>
            <button 
              onClick={handleNext}
              className="w-14 h-14 rounded-full border border-gold-500/30 flex items-center justify-center text-gold-400 hover:bg-gold-500/10 transition-colors"
            >
              <ChevronDown className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Carousel Section */}
        <div className="w-full xl:w-2/3 h-[600px] md:h-[700px] relative">
          {loading ? (
            <div className="w-full h-full bg-emerald-950/50 rounded-3xl animate-pulse" />
          ) : services.length > 0 ? (
            <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl border border-emerald-800/50">
              <AnimatePresence initial={false} custom={direction}>
                <motion.div
                  key={currentIndex}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    y: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 },
                  }}
                  className="absolute inset-0 w-full h-full bg-emerald-950 flex flex-col md:flex-row"
                >
                  {/* Image Side */}
                  <div className="w-full md:w-1/2 h-1/2 md:h-full relative overflow-hidden">
                    <img 
                      src={getServiceImage(services[currentIndex].category)} 
                      alt={services[currentIndex].name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-emerald-950 to-transparent" />
                  </div>

                  {/* Content Side */}
                  <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col justify-center p-8 md:p-12 relative z-10">
                    <p className="text-gold-400 text-sm tracking-widest uppercase mb-3">
                      {services[currentIndex].category}
                    </p>
                    <h3 className="font-display text-3xl md:text-4xl text-cream mb-4">
                      {services[currentIndex].name}
                    </h3>
                    <p className="text-emerald-200/90 text-base md:text-lg leading-relaxed mb-8 font-light line-clamp-3">
                      {services[currentIndex].description}
                    </p>
                    
                    <div className="flex items-center gap-6 mb-8">
                      <div>
                        <p className="text-xs text-emerald-500 uppercase tracking-wider mb-1">Investment</p>
                        <p className="text-xl text-gold-400 font-display">₹{services[currentIndex].price}</p>
                      </div>
                      <div className="w-px h-8 bg-emerald-800" />
                      <div>
                        <p className="text-xs text-emerald-500 uppercase tracking-wider mb-1">Duration</p>
                        <p className="text-xl text-cream font-display">{services[currentIndex].duration_mins} min</p>
                      </div>
                    </div>

                    <Link
                      to={`/book?service=${services[currentIndex].id}`}
                      className="inline-flex items-center gap-2 text-gold-400 hover:text-cream transition-colors group w-max"
                    >
                      <span className="font-medium tracking-wide uppercase text-sm">Reserve</span> 
                      <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          ) : (
             <div className="w-full h-full flex items-center justify-center text-cream">No services found.</div>
          )}
        </div>
      </div>
    </section>
  )
}
