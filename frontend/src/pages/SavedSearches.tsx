import { ArrowRight, Bell, BellOff, CheckCircle2, Pencil, Radio, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { airports } from '../data/airports'

interface SavedRoute {
  id: string
  origin: string
  destination: string
  date_from: string
  date_to: string
  passengers: number
  adults_count: number | null
  children_ages: number[]
  alert_price: number | null
  notify_available: boolean
  is_active: boolean
  created_at: string
  goal_reached_at: string | null
}

function paxSummary(route: SavedRoute): string {
  const adults = route.adults_count ?? route.passengers
  const children = route.children_ages ?? []
  if (adults === 1 && children.length === 0) return ''
  const parts = [`${adults} adult${adults !== 1 ? 's' : ''}`]
  const n = children.length
  if (n === 1) {
    const age = children[0]
    parts.push(`1 ${age < 2 ? 'infant' : 'child'} (age ${age})`)
  } else if (n > 1) {
    parts.push(`${n} children (ages ${children.join(', ')})`)
  }
  return parts.join(', ')
}

type SortKey = 'newest' | 'oldest' | 'origin' | 'destination' | 'departure'
type AlertFilter = 'all' | 'price' | 'available' | 'none'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest',      label: 'Newest first' },
  { value: 'oldest',      label: 'Oldest first' },
  { value: 'departure',   label: 'Departure date' },
  { value: 'origin',      label: 'Origin A → Z' },
  { value: 'destination', label: 'Destination A → Z' },
]

export default function SavedSearches() {
  const navigate = useNavigate()
  const [routes, setRoutes] = useState<SavedRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('departure')
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all')

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

  function handleSearch(route: SavedRoute) {
    const originAirport = airports.find(a => a.iata === route.origin)
    const destinationAirport = airports.find(a => a.iata === route.destination)
    if (!originAirport || !destinationAirport) return
    navigate('/search', {
      state: {
        runSearch: {
          origin: originAirport,
          destination: destinationAirport,
          dateFrom: new Date(route.date_from + 'T12:00:00'),
          dateTo: new Date(route.date_to + 'T12:00:00'),
          passengers: route.passengers,
          adultsCount: route.adults_count ?? route.passengers,
          childrenAges: route.children_ages ?? [],
        },
      },
    })
  }

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
          passengers: route.passengers,
          adultsCount: route.adults_count ?? route.passengers,
          childrenAges: route.children_ages ?? [],
          alertPrice: route.alert_price?.toString() ?? '',
          notifyAvailable: route.notify_available,
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

  const visibleRoutes = useMemo(() => {
    let list = [...routes]

    if (alertFilter === 'price')     list = list.filter(r => r.alert_price !== null)
    if (alertFilter === 'available') list = list.filter(r => r.notify_available)
    if (alertFilter === 'none')      list = list.filter(r => r.alert_price === null && !r.notify_available)

    list.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':      return a.created_at.localeCompare(b.created_at)
        case 'origin':      return a.origin.localeCompare(b.origin)
        case 'destination': return a.destination.localeCompare(b.destination)
        case 'departure':   return a.date_from.localeCompare(b.date_from)
        default:            return b.created_at.localeCompare(a.created_at) // newest
      }
    })

    return list
  }, [routes, sortBy, alertFilter])

  return (
    <div className="min-h-screen bg-brand-50 dark:bg-gray-950">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">Saved searches</h1>
          <p className="text-gray-500 text-sm dark:text-gray-400">
            Routes you're tracking. Set a target price when saving a search to get alerted when fares drop below it.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-6 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 h-24 animate-pulse dark:bg-gray-900 dark:border-gray-800" />
            ))}
          </div>
        )}

        {!loading && routes.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-5">
            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortKey)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition cursor-pointer dark:border-gray-700 dark:text-gray-200 dark:bg-gray-800"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Alert filter */}
            <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden text-sm dark:border-gray-700 dark:bg-gray-800">
              {([
                { value: 'all',       label: 'All' },
                { value: 'price',     label: 'Price alert' },
                { value: 'available', label: 'Availability' },
                { value: 'none',      label: 'No alert' },
              ] as { value: AlertFilter; label: string }[]).map(f => (
                <button
                  key={f.value}
                  onClick={() => setAlertFilter(f.value)}
                  className={`px-3 py-2 transition ${
                    alertFilter === f.value
                      ? 'bg-brand-600 text-white font-medium'
                      : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <span className="text-sm text-gray-400 ml-auto dark:text-gray-500">
              {visibleRoutes.length} of {routes.length}
            </span>
          </div>
        )}

        {!loading && routes.length === 0 && !error && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center dark:bg-gray-900 dark:border-gray-800">
            <p className="text-gray-400 text-sm dark:text-gray-500">No saved searches yet.</p>
            <p className="text-gray-400 text-sm mt-1 dark:text-gray-500">
              Use the <span className="font-medium text-gray-600 dark:text-gray-400">Start route search</span> option on the Search page to save a route.
            </p>
          </div>
        )}

        {!loading && visibleRoutes.length === 0 && routes.length > 0 && !error && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center dark:bg-gray-900 dark:border-gray-800">
            <p className="text-gray-400 text-sm dark:text-gray-500">No searches match the current filter.</p>
          </div>
        )}

        {!loading && visibleRoutes.length > 0 && (
          <div className="space-y-3">
            {visibleRoutes.map(route => {
              const goalReached = route.goal_reached_at !== null
              const goalDate = goalReached
                ? new Date(route.goal_reached_at!).toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })
                : null

              return (
                <div
                  key={route.id}
                  className={`bg-white rounded-2xl border overflow-hidden dark:bg-gray-900 ${goalReached ? 'border-green-200 dark:border-green-900' : 'border-gray-100 dark:border-gray-800'}`}
                >
                  <div className="px-6 py-5 flex items-center justify-between gap-4">
                    {/* Route info — click to run search */}
                    <button
                      onClick={() => handleSearch(route)}
                      className="flex-1 min-w-0 text-left rounded-xl px-3 py-2 -mx-3 -my-2 hover:bg-brand-50 transition group dark:hover:bg-brand-900/20"
                    >
                      <div className={`flex items-center gap-2 font-semibold text-lg group-hover:text-brand-700 transition dark:group-hover:text-brand-400 ${goalReached ? 'text-gray-500 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                        <span>{route.origin}</span>
                        <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 group-hover:text-brand-500 transition dark:text-gray-600" />
                        <span>{route.destination}</span>
                      </div>
                      <div className="text-sm text-gray-500 mt-0.5 dark:text-gray-400">
                        {route.date_from} — {route.date_to}
                        {(() => { const pax = paxSummary(route); return pax ? <span className="ml-2 text-gray-400 dark:text-gray-600">· {pax}</span> : null })()}
                      </div>
                    </button>

                    {/* Badges */}
                    <div className="shrink-0 flex flex-col items-end gap-1.5 text-sm">
                      {route.alert_price !== null && (
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium ${goalReached ? 'text-gray-400 bg-gray-50 dark:text-gray-600 dark:bg-gray-800' : 'text-brand-700 bg-brand-50 dark:text-brand-400 dark:bg-brand-900/30'}`}>
                          <Bell className="w-3.5 h-3.5" />
                          Max €{route.alert_price}
                        </div>
                      )}
                      {route.notify_available && (
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium ${goalReached ? 'text-gray-400 bg-gray-50 dark:text-gray-600 dark:bg-gray-800' : 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20'}`}>
                          <Radio className="w-3.5 h-3.5" />
                          Availability
                        </div>
                      )}
                      {route.alert_price === null && !route.notify_available && (
                        <div className="flex items-center gap-1.5 text-gray-400 px-3 py-1.5 dark:text-gray-600">
                          <BellOff className="w-3.5 h-3.5" />
                          No alert
                        </div>
                      )}
                    </div>

                    {/* Edit */}
                    <button
                      onClick={() => handleEdit(route)}
                      aria-label="Edit saved search"
                      className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition dark:text-gray-600 dark:hover:text-brand-400 dark:hover:bg-brand-900/20"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(route.id)}
                      disabled={deletingId === route.id}
                      aria-label="Delete saved search"
                      className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition dark:text-gray-600 dark:hover:text-red-400 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Goal reached banner */}
                  {goalReached && (
                    <div className="flex items-center gap-2 bg-green-50 border-t border-green-100 px-6 py-2.5 text-sm text-green-700 font-medium dark:bg-green-900/20 dark:border-green-900 dark:text-green-400">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Goal reached · {goalDate}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
