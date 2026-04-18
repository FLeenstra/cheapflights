import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'

export default function DeleteAccount() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) setError('Invalid or missing deletion link.')
  }, [token])

  async function handleConfirm() {
    setConfirming(true)
    setError('')
    try {
      const res = await fetch(`/api/auth/delete-account?token=${encodeURIComponent(token)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? 'Deletion failed')
      navigate('/login', { state: { accountDeleted: true } })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setConfirming(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-50 dark:bg-gray-950">
      <Navbar />
      <div className="max-w-md mx-auto px-6 py-16">
        <div className="bg-white rounded-2xl border border-red-200 p-8 dark:bg-gray-900 dark:border-red-900">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-5 dark:bg-red-900/30">
            <span className="text-2xl">⚠️</span>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2 dark:text-white">Delete your account</h1>
          <p className="text-sm text-gray-500 mb-6 dark:text-gray-400">
            This will permanently delete your account and all associated data — saved searches, alert history, and profile settings. This cannot be undone.
          </p>

          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
              {error}
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="flex-1 border border-gray-200 text-gray-700 font-semibold px-4 py-3 rounded-xl hover:bg-gray-50 transition dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming || !token}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 rounded-xl transition"
              >
                {confirming ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
