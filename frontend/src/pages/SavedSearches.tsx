import { ArrowRight, Bell, BellOff, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { airports } from '../data/airports'

interface SavedRoute {
  id: string
  origin: string
  destination: string
  date_from: string
  date_to: string
  alert_price: number | null
  is_active: boolean
  created_at: string
}

export default function SavedSearches() {
  const navigate = useNavigate()
  const [routes, setRoutes] = useState<SavedRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/routes/', { credentials: 'include' })
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          navigate('/login')
          return null
        }
        return res.json()
      })
      .then(data => {
        if (data) setRoutes(data)
      })
      .catch(() => setError('Failed to load saved searches'))
      .finally(() => setLoading(false))
  }, [navigate])

  function handleEdit(route: SavedRoute) {
    const originAirport = airports.find(a => a.iata === route.origin)
    const destinationAirport = airports.find(a => a.iata === route.destination)
    if (!originAirport || !destinationAirport) return
    navigate('/search', {
      state: {
        editRoute: {
          id: route.id,
          origin: originAirport,
          destination: destinationAirport,
          dateFrom: new Date(route.date_from + 'T12:00:00'),
          dateTo: new Date(route.date_to + 'T12:00:00'),
          alertPrice: route.alert_price?.toString() ?? '',
        },
      },
    })
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/routes/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Delete failed')
      setRoutes(prev => prev.filter(r => r.id !== id))
    } catch {
      setError('Failed to delete the search. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-brand-50">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Saved searches</h1>
          <p className="text-gray-500 text-sm">
            Routes you're tracking. Set a target price when saving a search to get alerted when fares drop below it.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 h-24 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && routes.length === 0 && !error && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <p className="text-gray-400 text-sm">No saved searches yet.</p>
            <p className="text-gray-400 text-sm mt-1">
              Use the <span className="font-medium text-gray-600">Start route search</span> option on the Search page to save a route.
            </p>
          </div>
        )}

        {!loading && routes.length > 0 && (
          <div className="space-y-3">
            {routes.map(route => (
              <div
                key={route.id}
                className="bg-white rounded-2xl border border-gray-100 px-6 py-5 flex items-center justify-between gap-4"
              >
                {/* Route info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 font-semibold text-gray-900 text-lg">
                    <span>{route.origin}</span>
                    <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>{route.destination}</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {route.date_from} — {route.date_to}
                  </div>
                </div>

                {/* Alert price */}
                <div className="shrink-0 text-sm text-right">
                  {route.alert_price !== null ? (
                    <div className="flex items-center gap-1.5 text-brand-700 bg-brand-50 px-3 py-1.5 rounded-lg font-medium">
                      <Bell className="w-3.5 h-3.5" />
                      Max total €{route.alert_price}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-gray-400 px-3 py-1.5">
                      <BellOff className="w-3.5 h-3.5" />
                      No alert
                    </div>
                  )}
                </div>

                {/* Edit */}
                <button
                  onClick={() => handleEdit(route)}
                  aria-label="Edit saved search"
                  className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition"
                >
                  <Pencil className="w-4 h-4" />
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(route.id)}
                  disabled={deletingId === route.id}
                  aria-label="Delete saved search"
                  className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
