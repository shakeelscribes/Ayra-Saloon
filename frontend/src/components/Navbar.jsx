import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Scissors, Menu, X, User, LogOut, Calendar, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/')
    setOpen(false)
  }

  const navLinks = [
    { label: 'Home', href: '/' },
    { label: 'Services', href: '/#services' },
    { label: 'Book Now', href: '/book' },
  ]

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? 'bg-emerald-950/95 backdrop-blur-md shadow-lg shadow-black/20' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-full bg-gold-gradient flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Scissors className="w-5 h-5 text-emerald-950" />
          </div>
          <span className="font-display text-2xl text-cream tracking-wide">
            Ayra <span className="text-gold-400">Saloon</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <Link
              key={l.label}
              to={l.href}
              className={`text-sm font-medium transition-colors duration-200 hover:text-gold-400 ${
                location.pathname === l.href ? 'text-gold-400' : 'text-cream/80'
              }`}
            >
              {l.label}
            </Link>
          ))}
          {user ? (
            <div className="flex items-center gap-3">
              {user.is_admin && (
                <Link to="/admin" className="flex items-center gap-1.5 text-gold-400 text-sm hover:text-gold-300 transition-colors">
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
              )}
              <Link to="/my-appointments" className="flex items-center gap-1.5 text-cream/80 text-sm hover:text-gold-400 transition-colors">
                <Calendar className="w-4 h-4" />
                My Bookings
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 btn-outline text-sm !px-5 !py-2"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link to="/login" className="btn-outline text-sm !px-5 !py-2">Login</Link>
              <Link to="/signup" className="btn-gold text-sm !px-5 !py-2">Sign Up</Link>
            </div>
          )}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden text-gold-400" onClick={() => setOpen(!open)}>
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {open && (
        <div className="md:hidden bg-emerald-950/98 backdrop-blur-md border-t border-emerald-800 px-6 py-6 flex flex-col gap-5 animate-fade-in">
          {navLinks.map((l) => (
            <Link
              key={l.label}
              to={l.href}
              onClick={() => setOpen(false)}
              className="text-cream/80 hover:text-gold-400 transition-colors font-medium"
            >
              {l.label}
            </Link>
          ))}
          {user ? (
            <>
              {user.is_admin && (
                <Link to="/admin" onClick={() => setOpen(false)} className="text-gold-400 font-medium">
                  Admin Dashboard
                </Link>
              )}
              <Link to="/my-appointments" onClick={() => setOpen(false)} className="text-cream/80 hover:text-gold-400">
                My Bookings
              </Link>
              <button onClick={handleLogout} className="text-left text-red-400 hover:text-red-300 font-medium">
                Logout
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <Link to="/login" onClick={() => setOpen(false)} className="btn-outline text-center">Login</Link>
              <Link to="/signup" onClick={() => setOpen(false)} className="btn-gold text-center">Sign Up</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  )
}
