import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Scissors, Menu, X } from 'lucide-react'
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
    { label: 'Services', href: '/services' },
    { label: 'Our Team', href: '/stylists' },
    { label: 'Book Now', href: '/book' },
  ]

  // Shared link treatment — gold marks where you are (wayfinding), cream
  // otherwise. Account links sit a touch dimmer so site nav reads first.
  const linkCls = (href, base = 'text-cream/80') =>
    `text-sm font-medium transition-colors duration-200 hover:text-gold-400 ${
      location.pathname === href ? 'text-gold-400' : base
    }`

  const navMaterial = scrolled
    ? 'bg-emerald-950/70 backdrop-blur-xl [backdrop-filter:blur(20px)_saturate(180%)] border-b border-gold-500/10 shadow-lg shadow-black/20'
    : 'bg-transparent border-b border-transparent'

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-[background-color,border-color,box-shadow] duration-300 ${navMaterial}`}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-full bg-gold-gradient flex items-center justify-center">
            <Scissors className="w-5 h-5 text-emerald-950" />
          </div>
          <span className="font-display text-2xl text-cream tracking-wide">
            Ayra <span className="text-gold-400">Saloon</span>
          </span>
        </Link>

        {/* Desktop Nav — two groups (site / account) split by a hairline.
            Account actions are text-quiet: the boxed Logout button was the
            heaviest element in the bar despite being the least important. */}
        <div className="hidden md:flex items-center gap-7">
          {navLinks.map((l) => (
            <Link key={l.label} to={l.href} className={linkCls(l.href)}>
              {l.label}
            </Link>
          ))}

          <div className="h-5 w-px bg-cream/15" aria-hidden="true" />

          {user ? (
            <div className="flex items-center gap-5">
              {user.is_admin && (
                <Link to="/admin" className={linkCls('/admin', 'text-gold-400/90')}>
                  Dashboard
                </Link>
              )}
              <Link to="/my-appointments" className={linkCls('/my-appointments', 'text-cream/70')}>
                Bookings
              </Link>
              <Link to="/profile" className={linkCls('/profile', 'text-cream/70')}>
                Profile
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-cream/60 hover:text-gold-400 transition-colors duration-200"
              >
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
                  Dashboard
                </Link>
              )}
              <Link to="/my-appointments" onClick={() => setOpen(false)} className="text-cream/80 hover:text-gold-400">
                Bookings
              </Link>
              <Link to="/profile" onClick={() => setOpen(false)} className="text-cream/80 hover:text-gold-400">
                Profile
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
