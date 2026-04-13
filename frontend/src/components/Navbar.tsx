import { Bookmark, LogOut, Plane, Search } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

export default function Navbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  function handleLogout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  const navItem = (to: string, label: string, Icon: React.ElementType) => {
    const active = pathname === to
    return (
      <Link
        to={to}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
          active
            ? 'bg-brand-50 text-brand-700'
            : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
        }`}
      >
        <Icon className="w-4 h-4" />
        {label}
      </Link>
    )
  }

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/search" className="flex items-center gap-2.5">
            <div className="bg-brand-600 rounded-lg p-1.5">
              <Plane className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">El Cheapo</span>
          </Link>

          <div className="flex items-center gap-1">
            {navItem('/search', 'Search', Search)}
            {navItem('/saved-searches', 'Saved searches', Bookmark)}
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </nav>
  )
}
