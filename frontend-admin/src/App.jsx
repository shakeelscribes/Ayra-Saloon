import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Schedule from './components/Schedule'
import NewAppointment from './components/NewAppointment'
import TimeOff from './components/TimeOff'
import Economy from './components/Economy'

// Staff panel guard — the panel only ever renders for authenticated admins.
function AdminRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_admin) return <Navigate to="/login" replace />
  return children
}

// Owner-only guard — salon-wide money (economy, expenses, budgets, exports)
// never renders for stylist staff; the backend 403s these routes anyway.
function OwnerRoute({ children }) {
  const { user, role } = useAuth()
  if (!user || !user.is_admin) return <Navigate to="/login" replace />
  if (role !== 'owner') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<AdminRoute><Dashboard /></AdminRoute>} />
          <Route path="/schedule" element={<AdminRoute><Schedule /></AdminRoute>} />
          <Route path="/new-appointment" element={<AdminRoute><NewAppointment /></AdminRoute>} />
          <Route path="/time-off" element={<AdminRoute><TimeOff /></AdminRoute>} />
          <Route path="/economy" element={<OwnerRoute><Economy /></OwnerRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
