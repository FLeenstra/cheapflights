import { LogOut, Plane, Search as SearchIcon } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AirportInput from '../components/AirportInput'
import DateRangePicker from '../components/DateRangePicker'
import FlightList, { type Flight } from '../components/FlightList'
import PriceSuggestions, { type Suggestion } from '../components/PriceSuggestions'
import type { Airport } from '../data/airports'

interface SearchResults {
  outbound: { flights: Flight[]; error: string | null }
  inbound:  { flights: Flight[]; error: string | null }
  suggestions: Suggestion[]
  currency: string
}

// Format a Date using local calendar date, avoiding UTC shift on toISOString()
function toISO(d: Date) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

// Parse an ISO date string back into a local-noon Date (avoids off-by-one on re-search)
function fromISO(s: string) {
  return new Date(s + 'T12:00:00')
}

export default function Search() {
  const navigate = useNavigate()
  const [origin, setOrigin] = useState<Airport | null>(null)
  const [destination, setDestination] = useState<Airport | null>(null)
  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()
  const [results, setResults] = useState<SearchResults | null>(null)
  const [searchedRoute, setSearchedRoute] = useState<{ origin: Airport; destination: Airport; dateFrom: string; dateTo: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')

  function handleLogout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!origin || !destination || !dateFrom || !dateTo) return
    await doSearch(origin, destination, dateFrom, dateTo)
  }

  async function doSearch(org: Airport, dest: Airport, from: Date, to: Date) {
    setFormError('')
    setResults(null)
    setLoading(true)
    try {
      const params = new URLSearchParams({
        origin: org.iata,
        destination: dest.iata,
        date_from: toISO(from),
        date_to: toISO(to),
      })
      const res = await fetch(`/api/flights/search?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? 'Search failed')
      setResults(data)
      setDateFrom(from)
      setDateTo(to)
      setSearchedRoute({ origin: org, destination: dest, dateFrom: toISO(from), dateTo: toISO(to) })
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/search" className="flex items-center gap-2.5">
            <div className="bg-brand-600 rounded-lg p-1.5">
              <Plane className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">El Cheapo</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Search card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Search flights</h1>
          <p className="text-gray-500 text-sm mb-7">
            Select your departure and return date — we'll show all flights and suggest nearby cheaper alternatives
          </p>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <AirportInput
                label="From"
                placeholder="e.g. Dublin"
                value={origin}
                onChange={setOrigin}
              />
              <AirportInput
                label="To"
                placeholder="e.g. Barcelona"
                value={destination}
                onChange={setDestination}
              />
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onChange={({ from, to }) => { setDateFrom(from); setDateTo(to) }}
              />
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !origin || !destination || !dateFrom || !dateTo}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-8 py-3 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
            >
              <SearchIcon className="w-4 h-4" />
              {loading ? 'Searching…' : 'Search flights'}
            </button>
          </form>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 h-36 animate-pulse" />
            <div className="space-y-2.5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 h-20 animate-pulse" />
              ))}
            </div>
            <div className="space-y-2.5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 h-20 animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {!loading && results && searchedRoute && (
          <div className="space-y-8">
            <PriceSuggestions
              suggestions={results.suggestions}
              currency={results.currency}
              onSelect={(outboundDate, inboundDate) => {
                if (!origin || !destination) return
                doSearch(origin, destination, fromISO(outboundDate), fromISO(inboundDate))
              }}
            />

            <FlightList
              label="Outbound"
              from={searchedRoute.origin.city}
              to={searchedRoute.destination.city}
              date={searchedRoute.dateFrom}
              flights={results.outbound.flights}
              error={results.outbound.error}
            />

            <FlightList
              label="Return"
              from={searchedRoute.destination.city}
              to={searchedRoute.origin.city}
              date={searchedRoute.dateTo}
              flights={results.inbound.flights}
              error={results.inbound.error}
            />
          </div>
        )}
      </div>
    </div>
  )
}
