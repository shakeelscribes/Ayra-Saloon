import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Services from './components/Services'
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
      {/* Testimonials / footer strip */}
      <footer className="border-t border-emerald-800 py-12 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="font-display text-2xl text-cream mb-2">
            Ayra <span className="text-gold-400">Saloon</span>
          </p>
          <p className="text-emerald-700 text-sm">
            Where every visit is an experience. © {new Date().getFullYear()} Ayra Saloon. All rights reserved.
          </p>
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
        <AppShell />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1a3a2a',
              color: '#faf6ee',
              border: '1px solid rgba(201,168,76,0.3)',
              fontFamily: 'Inter, sans-serif',
            },
            success: { iconTheme: { primary: '#c9a84c', secondary: '#0d1f17' } },
            error:   { iconTheme: { primary: '#f87171', secondary: '#0d1f17' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  )
}
