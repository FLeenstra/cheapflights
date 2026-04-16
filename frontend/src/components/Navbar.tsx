import { Bookmark, LogOut, Moon, Plane, Search, ShieldCheck, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useDarkMode } from '../lib/useDarkMode'

export default function Navbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [isAdmin, setIsAdmin] = useState(false)
  const { theme, toggle } = useDarkMode()

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.is_admin) setIsAdmin(true) })
      .catch(() => {})
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    navigate('/login')
  }

  const navItem = (to: string, label: string, Icon: React.ElementType) => {
    const active = pathname === to
    return (
      <Link
        to={to}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
          active
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800'
        }`}
      >
        <Icon className="w-4 h-4" />
        {label}
      </Link>
    )
  }

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-10 dark:bg-gray-900 dark:border-gray-800">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/search" className="flex items-center gap-2.5">
            <div className="bg-brand-600 rounded-lg p-1.5">
              <Plane className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 dark:text-white">El Cheapo</span>
          </Link>

          <div className="flex items-center gap-1">
            {navItem('/search', 'Search', Search)}
            {navItem('/saved-searches', 'Saved searches', Bookmark)}
            {isAdmin && navItem('/admin', 'Admin', ShieldCheck)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            aria-label="Toggle dark mode"
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-800"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition dark:text-gray-400 dark:hover:text-gray-200"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
