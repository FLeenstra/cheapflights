import { BookmarkCheck, Search as SearchIcon } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import AirportInput from '../components/AirportInput'
import DateRangePicker from '../components/DateRangePicker'
import CheapestTotal from '../components/CheapestTotal'
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
  const location = useLocation()

  const [origin, setOrigin] = useState<Airport | null>(null)
  const [destination, setDestination] = useState<Airport | null>(null)
  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()
  const [results, setResults] = useState<SearchResults | null>(null)
  const [searchedRoute, setSearchedRoute] = useState<{ origin: Airport; destination: Airport; dateFrom: string; dateTo: string } | null>(null)
  const [selectedOutbound, setSelectedOutbound] = useState<Flight | null>(null)
  const [selectedInbound, setSelectedInbound] = useState<Flight | null>(null)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')

  // Save / edit route state
  const [editRouteId, setEditRouteId] = useState<string | null>(null)
  const [trackRoute, setTrackRoute] = useState(false)
  const [alertPrice, setAlertPrice] = useState('')
  const [notifyAvailable, setNotifyAvailable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Pre-fill from navigation state when arriving from the edit button
  useEffect(() => {
    const edit = (location.state as { editRoute?: { id: string; origin: Airport; destination: Airport; dateFrom: Date; dateTo: Date; alertPrice: string; notifyAvailable: boolean } } | null)?.editRoute
    if (!edit) return
    setEditRouteId(edit.id)
    setOrigin(edit.origin)
    setDestination(edit.destination)
    setDateFrom(edit.dateFrom)
    setDateTo(edit.dateTo)
    setAlertPrice(edit.alertPrice)
    setNotifyAvailable(edit.notifyAvailable)
    setTrackRoute(true)
  }, [location.state])

  // Immediately run a search when arriving from a saved-search card click
  useEffect(() => {
    const run = (location.state as { runSearch?: { origin: Airport; destination: Airport; dateFrom: Date; dateTo: Date } } | null)?.runSearch
    if (!run) return
    setOrigin(run.origin)
    setDestination(run.destination)
    setDateFrom(run.dateFrom)
    setDateTo(run.dateTo)
    doSearch(run.origin, run.destination, run.dateFrom, run.dateTo)
  // doSearch is stable (no deps change it) — only re-run when state changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

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
      setSelectedOutbound(null)
      setSelectedInbound(null)
      setDateFrom(from)
      setDateTo(to)
      setSearchedRoute({ origin: org, destination: dest, dateFrom: toISO(from), dateTo: toISO(to) })
      if (data.outbound.flights.length > 0) setNotifyAvailable(false)
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
      const url = editRouteId ? `/api/routes/${editRouteId}` : '/api/routes/'
      const method = editRouteId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          origin: origin.iata,
          destination: destination.iata,
          date_from: toISO(dateFrom),
          date_to: toISO(dateTo),
          alert_price: alertPrice ? parseInt(alertPrice, 10) : null,
          notify_available: notifyAvailable,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? (editRouteId ? 'Failed to update route' : 'Failed to save route'))
      setSaveSuccess(true)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-50 dark:bg-gray-950">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Search card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8 dark:bg-gray-900 dark:border-gray-800">
          <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">Search flights</h1>
          <p className="text-gray-500 text-sm mb-7 dark:text-gray-400">
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
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-5 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !origin || !destination || !dateFrom || !dateTo}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-8 py-3 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              <SearchIcon className="w-4 h-4" />
              {loading ? 'Searching…' : 'Search flights'}
            </button>

            {/* Save-route section */}
            <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-800">
              <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={trackRoute}
                  onChange={e => {
                    setTrackRoute(e.target.checked)
                    if (!e.target.checked) {
                      setAlertPrice('')
                      setNotifyAvailable(false)
                      setSaveError('')
                      setSaveSuccess(false)
                    }
                  }}
                  className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {editRouteId ? 'Edit saved search' : 'Start route search'}
                </span>
              </label>

              {trackRoute && (
                <div className="mt-4 space-y-4">
                  <div className={results && results.outbound.flights.length > 0 ? 'opacity-40 pointer-events-none select-none' : ''}>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
                      <input
                        type="checkbox"
                        checked={notifyAvailable}
                        disabled={results !== null && results.outbound.flights.length > 0}
                        onChange={e => {
                          setSaveSuccess(false)
                          setSaveError('')
                          setNotifyAvailable(e.target.checked)
                          if (e.target.checked) setAlertPrice('')
                        }}
                        className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-200">Notify when flights become available</span>
                    </label>
                    {results && results.outbound.flights.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">Flights are already available on this route</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <div className={notifyAvailable ? 'opacity-40 pointer-events-none select-none' : ''}>
                      <label className="block text-sm font-medium text-gray-700 mb-0.5 dark:text-gray-200">
                        Max total price (€) <span className="text-gray-400 font-normal dark:text-gray-500">— optional</span>
                      </label>
                      <p className="text-xs text-gray-400 mb-1.5 dark:text-gray-500">Outbound + return combined</p>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        disabled={notifyAvailable}
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
                        className="w-36 px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveRoute}
                      disabled={saving || !origin || !destination || !dateFrom || !dateTo}
                      className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                    >
                      <BookmarkCheck className="w-4 h-4" />
                      {saving ? (editRouteId ? 'Updating…' : 'Saving…') : (editRouteId ? 'Update search' : 'Save search')}
                    </button>
                  </div>
                </div>
              )}

              {trackRoute && saveSuccess && (
                <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
                  <BookmarkCheck className="w-4 h-4 shrink-0" />
                  {editRouteId ? 'Route updated successfully.' : 'Route saved successfully.'}
                </div>
              )}
              {trackRoute && saveError && (
                <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
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
                <div key={i} className="bg-white rounded-2xl border border-gray-100 h-20 animate-pulse dark:bg-gray-900 dark:border-gray-800" />
              ))}
            </div>
            <div className="space-y-2.5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 h-20 animate-pulse dark:bg-gray-900 dark:border-gray-800" />
              ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 h-36 animate-pulse dark:bg-gray-900 dark:border-gray-800" />
          </div>
        )}

        {/* Cheapest total summary */}
        {!loading && results && (
          <CheapestTotal
            outboundPrice={(selectedOutbound ?? results.outbound.flights[0])?.price ?? null}
            inboundPrice={(selectedInbound ?? results.inbound.flights[0])?.price ?? null}
            currency={results.currency}
            isCustomSelection={!!(selectedOutbound || selectedInbound)}
          />
        )}

        {/* Results */}
        {!loading && results && searchedRoute && (
          <div className="space-y-8">
            <FlightList
              label="Outbound"
              from={searchedRoute.origin.city}
              to={searchedRoute.destination.city}
              date={searchedRoute.dateFrom}
              outboundDate={searchedRoute.dateFrom}
              inboundDate={searchedRoute.dateTo}
              flights={results.outbound.flights}
              error={results.outbound.error}
              selectedFlight={selectedOutbound}
              onSelect={setSelectedOutbound}
            />

            <FlightList
              label="Return"
              from={searchedRoute.destination.city}
              to={searchedRoute.origin.city}
              date={searchedRoute.dateTo}
              outboundDate={searchedRoute.dateFrom}
              inboundDate={searchedRoute.dateTo}
              flights={results.inbound.flights}
              error={results.inbound.error}
              selectedFlight={selectedInbound}
              onSelect={setSelectedInbound}
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
