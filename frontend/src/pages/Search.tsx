import { BookmarkCheck, Search as SearchIcon } from 'lucide-react'
import { FormEvent, useState } from 'react'
import AirportInput from '../components/AirportInput'
import DateRangePicker from '../components/DateRangePicker'
import FlightList, { type Flight } from '../components/FlightList'
import Navbar from '../components/Navbar'
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
  const [origin, setOrigin] = useState<Airport | null>(null)
  const [destination, setDestination] = useState<Airport | null>(null)
  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()
  const [results, setResults] = useState<SearchResults | null>(null)
  const [searchedRoute, setSearchedRoute] = useState<{ origin: Airport; destination: Airport; dateFrom: string; dateTo: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')

  // Save-route state
  const [trackRoute, setTrackRoute] = useState(false)
  const [alertPrice, setAlertPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

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

  async function handleSaveRoute() {
    if (!origin || !destination || !dateFrom || !dateTo) return
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/routes/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          origin: origin.iata,
          destination: destination.iata,
          date_from: toISO(dateFrom),
          date_to: toISO(dateTo),
          alert_price: alertPrice ? parseInt(alertPrice, 10) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? 'Failed to save route')
      setSaveSuccess(true)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-50">
      <Navbar />

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

            {/* Save-route section */}
            <div className="mt-5 pt-5 border-t border-gray-100">
              <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={trackRoute}
                  onChange={e => {
                    setTrackRoute(e.target.checked)
                    if (!e.target.checked) {
                      setAlertPrice('')
                      setSaveError('')
                      setSaveSuccess(false)
                    }
                  }}
                  className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700">Start route search</span>
              </label>

              {trackRoute && (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-0.5">
                      Max total price (€) <span className="text-gray-400 font-normal">— optional</span>
                    </label>
                    <p className="text-xs text-gray-400 mb-1.5">Outbound + return combined</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={alertPrice}
                      onChange={e => {
                        setSaveSuccess(false)
                        setSaveError('')
                        setAlertPrice(e.target.value.replace(/\D/g, ''))
                      }}
                      onKeyDown={e => {
                        if (['.', ',', '-', '+', 'e', 'E'].includes(e.key)) e.preventDefault()
                      }}
                      placeholder="e.g. 100"
                      className="w-36 px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveRoute}
                    disabled={saving || !origin || !destination || !dateFrom || !dateTo}
                    className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
                  >
                    <BookmarkCheck className="w-4 h-4" />
                    {saving ? 'Saving…' : 'Save search'}
                  </button>
                </div>
              )}

              {trackRoute && saveSuccess && (
                <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <BookmarkCheck className="w-4 h-4 shrink-0" />
                  Route saved successfully.
                </div>
              )}
              {trackRoute && saveError && (
                <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {saveError}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-6">
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
            <div className="bg-white rounded-2xl border border-gray-100 h-36 animate-pulse" />
          </div>
        )}

        {/* Results */}
        {!loading && results && searchedRoute && (
          <div className="space-y-8">
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

            <PriceSuggestions
              suggestions={results.suggestions}
              currency={results.currency}
              onSelect={(outboundDate, inboundDate) => {
                if (!origin || !destination) return
                doSearch(origin, destination, fromISO(outboundDate), fromISO(inboundDate))
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
