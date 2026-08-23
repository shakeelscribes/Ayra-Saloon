import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Scissors, Sparkles, Crown, Palette, Wind, Droplets, ArrowRight, PenTool } from 'lucide-react'
import { motion, useScroll, useTransform } from 'framer-motion'
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

const ServiceCard = ({ svc, index, progress, total }) => {
  const Icon = categoryIcons[svc.category] || Sparkles
  
  // Create a staggered effect where cards stack on top of each other
  // or slide up based on scroll progress
  const start = index / total;
  const end = (index + 1) / total;
  
  const nextStart = end;
  const nextEnd = (index + 2) / total;
  const currentY = useTransform(progress, 
    [start, end, nextStart, nextEnd], 
    ["100vh", "0vh", "0vh", "-10vh"]
  );
  
  const currentScale = useTransform(progress, 
    [start, end, nextStart, nextEnd], 
    [0.8, 1, 1, 0.9]
  );
  
  const currentOpacity = useTransform(progress,
    [start, end, nextStart, nextEnd],
    [0, 1, 1, 0]
  );

  return (
    <motion.div 
      style={{ y: currentY, scale: currentScale, opacity: currentOpacity }}
      className="absolute inset-0 w-full h-full flex items-center justify-center p-6"
    >
      <div className="relative w-full max-w-5xl h-[80vh] bg-emerald-950 rounded-3xl overflow-hidden shadow-2xl border border-emerald-800/50 flex flex-col md:flex-row group">
        
        {/* Image Side */}
        <div className="w-full md:w-1/2 h-1/2 md:h-full relative overflow-hidden">
          <div className="absolute inset-0 bg-gold-500/20 mix-blend-overlay z-10 pointer-events-none transition-opacity duration-700 group-hover:opacity-0" />
          <img 
            src={getServiceImage(svc.category)} 
            alt={svc.name}
            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
          />
        </div>

        {/* Content Side */}
        <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col justify-center p-8 md:p-12 relative">
          <div className="absolute top-8 right-8 w-16 h-16 rounded-full bg-emerald-900 border border-gold-500/30 flex items-center justify-center">
            <Icon className="w-6 h-6 text-gold-400" />
          </div>
          
          <p className="text-gold-400 text-sm tracking-widest uppercase mb-4 flex items-center gap-2">
            <span className="w-8 h-px bg-gold-400"></span>
            {svc.category}
          </p>
          <h3 className="font-display text-4xl text-cream mb-6">{svc.name}</h3>
          <p className="text-emerald-200 text-lg leading-relaxed mb-10 font-light line-clamp-3">
            {svc.description}
          </p>
          
          <div className="flex flex-wrap items-center gap-8 mb-10">
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
            className="btn-gold inline-flex items-center gap-2 w-max"
          >
            Reserve Session <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </motion.div>
  )
}

export default function ServicesScrollLinked() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const containerRef = useRef(null)

  useEffect(() => {
    client.get('/services/')
      .then(r => setServices(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  })

  // To give enough scrolling room, set container height to number of services * 100vh
  const heightStr = loading || services.length === 0 ? '100vh' : `${services.length * 80}vh`;

  return (
    <div className="bg-emerald-950 pb-20">
      {/* Prototype label */}
      <div className="pt-24 pb-12 text-center px-4 border-t border-emerald-900">
        <h2 className="text-gold-400 text-sm font-medium tracking-widest uppercase mb-2">PROTOTYPE 1</h2>
        <h3 className="font-display text-4xl text-cream">Scroll-Linked Presentation</h3>
        <div className="w-24 h-px bg-gold-500 mx-auto mt-6 mb-4" />
        <p className="text-emerald-400 font-light mt-2 max-w-md mx-auto">
          Scroll down to seamlessly move through our full service list.
        </p>
      </div>

      <section ref={containerRef} style={{ height: heightStr }} className="relative w-full">
        <div className="sticky top-0 w-full h-screen overflow-hidden flex items-center justify-center">
          
          {loading ? (
            <div className="w-full max-w-5xl h-[80vh] bg-emerald-900/50 rounded-3xl animate-pulse mx-6" />
          ) : (
            <>
              {/* If services is empty, show empty state */}
              {services.length === 0 && (
                <div className="text-cream text-xl">No services found. Start your backend server to seed data.</div>
              )}
              
              {/* Render all cards on top of each other, absolutely positioned */}
              {services.map((svc, index) => (
                <ServiceCard 
                  key={svc.id} 
                  svc={svc} 
                  index={index} 
                  total={services.length} 
                  progress={scrollYProgress} 
                />
              ))}
            </>
          )}

        </div>
      </section>
    </div>
  )
}
