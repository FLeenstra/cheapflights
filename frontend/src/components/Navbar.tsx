import { Bookmark, Globe, LogOut, Monitor, Moon, Plane, Search, ShieldCheck, Sun, UserCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LANGUAGES } from '../lib/i18n'
import { useDarkMode } from '../lib/useDarkMode'

export default function Navbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { t, i18n } = useTranslation()
  const [isAdmin, setIsAdmin] = useState(false)
  const { preference, setPreference } = useDarkMode()
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.is_admin) setIsAdmin(true) })
      .catch(() => {})
  }, [])

  // Close language dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    navigate('/login')
  }

  function cycleTheme() {
    const next = preference === 'light' ? 'dark' : preference === 'dark' ? 'system' : 'light'
    setPreference(next)
  }

  function handleLangSelect(code: string) {
    i18n.changeLanguage(code)
    setLangOpen(false)
    // Persist to profile if logged in
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(me => {
        if (!me) return
        fetch('/api/profile/', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ language: code }),
        }).catch(() => {})
      })
      .catch(() => {})
  }

  const ThemeIcon = preference === 'dark' ? Moon : preference === 'light' ? Sun : Monitor
  const themeLabel = preference === 'dark' ? t('nav.theme.dark') : preference === 'light' ? t('nav.theme.light') : t('nav.theme.system')
  const currentLang = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0]

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
            <span className="font-bold text-gray-900 dark:text-white">{t('brand')}</span>
          </Link>

          <div className="flex items-center gap-1">
            {navItem('/search', t('nav.search'), Search)}
            {navItem('/saved-searches', t('nav.savedSearches'), Bookmark)}
            {isAdmin && navItem('/admin', t('nav.admin'), ShieldCheck)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cycleTheme}
            aria-label={themeLabel}
            title={themeLabel}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-800"
          >
            <ThemeIcon className="w-4 h-4" />
          </button>

          {/* Language picker */}
          <div ref={langRef} className="relative">
            <button
              onClick={() => setLangOpen(o => !o)}
              aria-label="Change language"
              title="Change language"
              className="flex items-center gap-1.5 p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-gray-800"
            >
              <Globe className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase">{currentLang.code}</span>
            </button>

            {langOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden z-50 dark:bg-gray-900 dark:border-gray-800">
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => handleLangSelect(lang.code)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition ${
                      i18n.language === lang.code
                        ? 'bg-brand-50 text-brand-700 font-medium dark:bg-brand-900/30 dark:text-brand-400'
                        : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {navItem('/profile', t('nav.profile'), UserCircle)}

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition dark:text-gray-400 dark:hover:text-gray-200"
          >
            <LogOut className="w-4 h-4" />
            {t('nav.signOut')}
          </button>
        </div>
      </div>
    </nav>
  )
}
