import { Plane } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { sanitizeEmail } from '../lib/sanitize'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail ?? 'Something went wrong')
      }
      setSubmitted(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
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
          <span className="text-xl font-bold tracking-tight">El Cheapo</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Locked out?<br />No problem.
          </h1>
          <p className="text-brand-200 text-lg leading-relaxed">
            Enter your email and we'll send you a link to reset your password. The link is valid for one hour.
          </p>
        </div>

        <div className="flex items-center gap-4 text-brand-200 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            Secure link
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-300" />
            Expires in 1 hour
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-300" />
            Single use
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
            <span className="text-lg font-bold text-gray-900 dark:text-white">El Cheapo</span>
          </div>

          {submitted ? (
            <>
              <div className="mb-6 flex items-center justify-center w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30">
                <svg className="w-7 h-7 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2 dark:text-white">Check your inbox</h2>
              <p className="text-gray-500 mb-8 dark:text-gray-400">
                If <span className="font-medium text-gray-700 dark:text-gray-200">{email}</span> is registered, you'll receive a password reset link shortly.
              </p>
              <Link
                to="/login"
                className="block w-full text-center bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
              >
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-gray-900 mb-2 dark:text-white">Forgot password?</h2>
              <p className="text-gray-500 mb-8 dark:text-gray-400">
                Enter the email address for your account and we'll send you a reset link.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 dark:text-gray-200">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={e => setEmail(sanitizeEmail(e.target.value))}
                    placeholder="you@example.com"
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
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Remember your password?{' '}
                <Link to="/login" className="text-brand-600 font-semibold hover:text-brand-700 transition dark:text-brand-400 dark:hover:text-brand-300">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
