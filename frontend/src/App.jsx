import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { MotionConfig } from 'framer-motion'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import MarqueeTicker from './components/MarqueeTicker'
import Services from './components/Services'
import Philosophy from './components/Philosophy'
import BeforeAfterGallery from './components/BeforeAfterGallery'
import Testimonials from './components/Testimonials'
import CTABand from './components/CTABand'
import ContactLocation from './components/ContactLocation'
import FAQAccordion from './components/FAQAccordion'
import WhatsAppFloat from './components/WhatsAppFloat'
import BookingComponent from './components/BookingComponent'
import ServicesPage from './pages/ServicesPage'
import StylistsPage from './pages/StylistsPage'
import StylistProfilePage from './pages/StylistProfilePage'
import Login from './components/Auth/Login'
import Signup from './components/Auth/Signup'
import MyAppointments from './components/MyAppointments'
import AdminDashboard from './components/Admin/Dashboard'

// ── Protected route wrappers ──────────────────────────────────────────────────
function PrivateRoute({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_admin) return <Navigate to="/" replace />
  return children
}

// ── Landing Page ──────────────────────────────────────────────────────────────
function LandingPage() {
  return (
    <>
      <Hero />
      <MarqueeTicker />
      <Services />
      <Philosophy />
      <BeforeAfterGallery />
      <Testimonials />
      <CTABand />
      <ContactLocation />
      <FAQAccordion />
      {/* Footer — four columns: brand, explore, hours, visit */}
      <footer className="border-t border-cream/10 px-6 pt-16 pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 pb-12">
            {/* Brand */}
            <div className="md:col-span-5">
              <p className="font-display text-3xl text-cream tracking-tight">
                Ayra <span className="italic text-gold-400">Saloon</span>
              </p>
              <p className="mt-3 text-sm text-cream/50 font-light max-w-xs leading-relaxed">
                Modern grooming for everyone — precision cuts, beard work,
                colour, bridal styling and tattoos in the heart of
                Tirunelveli.
              </p>
            </div>

            {/* Explore */}
            <div className="md:col-span-2">
              <p className="uppercase tracking-[0.18em] text-xs text-cream/40 mb-4">Explore</p>
              <ul className="space-y-2.5 text-sm text-cream/75">
                <li><Link to="/services" className="transition-colors duration-200 hover:text-gold-400">Services</Link></li>
                <li><Link to="/stylists" className="transition-colors duration-200 hover:text-gold-400">Our team</Link></li>
                <li><Link to="/book" className="transition-colors duration-200 hover:text-gold-400">Book now</Link></li>
                <li><Link to="/my-appointments" className="transition-colors duration-200 hover:text-gold-400">My bookings</Link></li>
              </ul>
            </div>

            {/* Hours */}
            <div className="md:col-span-2">
              <p className="uppercase tracking-[0.18em] text-xs text-cream/40 mb-4">Hours</p>
              <ul className="space-y-2.5 text-sm text-cream/75">
                <li>Mon – Sun · 10 AM – 9 PM</li>
                <li>Walk-ins welcome</li>
              </ul>
            </div>

            {/* Visit */}
            <div className="md:col-span-3">
              <p className="uppercase tracking-[0.18em] text-xs text-cream/40 mb-4">Visit us</p>
              <address className="not-italic space-y-2.5 text-sm text-cream/75 leading-relaxed">
                <p>
                  1C1/1, Kayal Complex, Military Line,
                  Samathanapuram, Tirunelveli,
                  Tamil Nadu 627011
                </p>
                <p>
                  <a href="tel:+918270606750" className="transition-colors duration-200 hover:text-gold-400">+91 82706 06750</a>
                </p>
                <p>
                  <a
                    href="https://maps.app.goo.gl/QLcLJ9cR52dpPg3b7"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gold-400 transition-colors duration-200 hover:text-gold-300"
                  >
                    Get directions →
                  </a>
                </p>
              </address>
            </div>
          </div>

          <div className="pt-6 border-t border-cream/10 flex flex-col sm:flex-row justify-between gap-2 text-xs text-cream/50">
            <p>© {new Date().getFullYear()} Ayra Saloon. All rights reserved.</p>
            <p>Tirunelveli, Tamil Nadu, India</p>
          </div>
        </div>
      </footer>
    </>
  )
}

// ── App Shell ─────────────────────────────────────────────────────────────────
function AppShell() {
  return (
    <div className="min-h-screen bg-emerald-950">
      <Navbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/stylists" element={<StylistsPage />} />
        <Route path="/stylists/:slug" element={<StylistProfilePage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/book" element={<BookingComponent />} />
        <Route
          path="/my-appointments"
          element={<PrivateRoute><MyAppointments /></PrivateRoute>}
        />
        <Route
          path="/admin"
          element={<AdminRoute><AdminDashboard /></AdminRoute>}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <WhatsAppFloat />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MotionConfig reducedMotion="user">
          <AppShell />
        </MotionConfig>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1a3a2a',
              color: '#faf6ee',
              border: '1px solid rgba(201,168,76,0.3)',
              fontFamily: 'Jost, sans-serif',
            },
            success: { iconTheme: { primary: '#c9a84c', secondary: '#0d1f17' } },
            error:   { iconTheme: { primary: '#f87171', secondary: '#0d1f17' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}
