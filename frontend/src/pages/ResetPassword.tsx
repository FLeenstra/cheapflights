import { Plane } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { sanitizeText } from '../lib/sanitize'

export default function ResetPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('resetPassword.errorPasswordMatch'))
      return
    }
    if (password.length < 8) {
      setError(t('resetPassword.errorPasswordLength'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? t('common.somethingWentWrong'))
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.somethingWentWrong'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-5/12 flex-col justify-between bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 rounded-xl p-2">
            <Plane className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">{t('brand')}</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            {t('resetPassword.headline')}
          </h1>
          <p className="text-brand-200 text-lg leading-relaxed">
            {t('resetPassword.tagline')}
          </p>
        </div>

        <div className="flex items-center gap-4 text-brand-200 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            {t('resetPassword.atLeast8')}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-300" />
            {t('resetPassword.singleUseLink')}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-white px-6 py-12 dark:bg-gray-900">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="bg-brand-600 rounded-xl p-2">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-white">{t('brand')}</span>
          </div>

          {!token ? (
            <>
              <h2 className="text-3xl font-bold text-gray-900 mb-2 dark:text-white">{t('resetPassword.invalidLink')}</h2>
              <p className="text-gray-500 mb-8 dark:text-gray-400">
                {t('resetPassword.invalidLinkSubtitle')}
              </p>
              <Link
                to="/forgot-password"
                className="block w-full text-center bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition"
              >
                {t('resetPassword.requestNewLink')}
              </Link>
            </>
          ) : done ? (
            <>
              <div className="mb-6 flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30">
                <svg className="w-7 h-7 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2 dark:text-white">{t('resetPassword.passwordUpdated')}</h2>
              <p className="text-gray-500 mb-8 dark:text-gray-400">
                {t('resetPassword.passwordUpdatedSubtitle')}
              </p>
              <Link
                to="/login"
                className="block w-full text-center bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition"
              >
                {t('resetPassword.signInNow')}
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-gray-900 mb-2 dark:text-white">{t('resetPassword.title')}</h2>
              <p className="text-gray-500 mb-8 dark:text-gray-400">{t('resetPassword.subtitle')}</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 dark:text-gray-200">
                    {t('resetPassword.newPasswordLabel')}
                  </label>
                  <input
                    type="password"
                    required
                    maxLength={128}
                    value={password}
                    onChange={e => setPassword(sanitizeText(e.target.value))}
                    placeholder={t('resetPassword.atLeast8')}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 dark:text-gray-200">
                    {t('resetPassword.confirmPasswordLabel')}
                  </label>
                  <input
                    type="password"
                    required
                    maxLength={128}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(sanitizeText(e.target.value))}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                >
                  {loading ? t('resetPassword.updating') : t('resetPassword.updatePassword')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
