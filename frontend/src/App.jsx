import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { MotionConfig } from 'framer-motion'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Services from './components/Services'
import Philosophy from './components/Philosophy'
import Testimonials from './components/Testimonials'
import ContactLocation from './components/ContactLocation'
import BookingComponent from './components/BookingComponent'
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
      <Services />
      <Philosophy />
      <Testimonials />
      <ContactLocation />
      {/* Footer */}
      <footer className="border-t border-cream/10 px-6 pt-16 pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pb-12">
            <div>
              <p className="font-display text-3xl text-cream tracking-tight">
                Ayra <span className="italic text-gold-400">Saloon</span>
              </p>
              <p className="mt-2 text-sm text-cream/50 font-light max-w-xs leading-relaxed">
                1C1/1, Kayal Complex, Military Line,
                Samathanapuram, Tirunelveli, Tamil Nadu.
                Modern grooming for everyone.
              </p>
            </div>
            <div className="flex gap-14 text-sm">
              <div>
                <p className="uppercase tracking-[0.18em] text-xs text-cream/40 mb-3">Explore</p>
                <ul className="space-y-2 text-cream/70">
                  <li><a href="#services" className="transition-colors duration-200 hover:text-gold-400">Services</a></li>
                  <li><Link to="/book" className="transition-colors duration-200 hover:text-gold-400">Book now</Link></li>
                </ul>
              </div>
              <div>
                <p className="uppercase tracking-[0.18em] text-xs text-cream/40 mb-3">Hours</p>
                <p className="text-cream/70 leading-relaxed">
                  Mon – Sat<br />9 AM – 8 PM
                </p>
              </div>
            </div>
          </div>
          <div className="pt-6 border-t border-cream/10 flex flex-col sm:flex-row justify-between gap-2 text-xs text-cream/40">
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
