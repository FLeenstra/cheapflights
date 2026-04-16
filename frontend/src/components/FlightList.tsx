import { AlertCircle, ArrowRight, Plane } from 'lucide-react'

export interface Flight {
  flight_number: string
  price: number
  currency: string
  origin: string
  origin_full: string
  destination: string
  destination_full: string
  departure_time: string
}

interface Props {
  label: string
  from: string
  to: string
  date: string
  outboundDate?: string
  inboundDate?: string
  flights: Flight[]
  error: string | null
  selectedFlight?: Flight | null
  onSelect?: (flight: Flight) => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  })
}

function buildDeeplink(flight: Flight, outboundDate?: string, inboundDate?: string) {
  const isReturn = !!(outboundDate && inboundDate)
  const params = new URLSearchParams({
    adults: '1', teens: '0', children: '0', infants: '0',
    dateOut: outboundDate ?? flight.departure_time.slice(0, 10),
    ...(isReturn ? { dateIn: inboundDate! } : {}),
    isConnectedFlight: 'false',
    isReturn: String(isReturn),
    originIata: flight.origin,
    destinationIata: flight.destination,
    toUs: 'AGREED',
  })
  return `https://www.ryanair.com/gb/en/trip/flights/select?${params}`
}

function isSelected(flight: Flight, selected?: Flight | null) {
  return !!selected &&
    selected.flight_number === flight.flight_number &&
    selected.departure_time === flight.departure_time
}

export default function FlightList({ label, from, to, date, outboundDate, inboundDate, flights, error, selectedFlight, onSelect }: Props) {
  const cheapestPrice = flights.length > 0 ? flights[0].price : null
  const currency = flights.length > 0 ? flights[0].currency : null

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</span>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <span>{from}</span>
            <ArrowRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600" />
            <span>{to}</span>
          </div>
          <span className="text-sm text-gray-400 dark:text-gray-500">{formatDate(date)}</span>
        </div>
        {cheapestPrice !== null && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            from <span className="font-semibold text-brand-600 dark:text-brand-400">{currency} {cheapestPrice.toFixed(2)}</span>
            <span className="text-gray-400 ml-1 dark:text-gray-600">· {flights.length} flight{flights.length !== 1 ? 's' : ''}</span>
          </p>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3 dark:bg-red-900/20 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0 dark:text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Could not load {label.toLowerCase()} flights</p>
            <p className="text-xs text-red-500 mt-0.5 dark:text-red-500">{error}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!error && flights.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 px-8 py-10 text-center dark:bg-gray-900 dark:border-gray-800">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-50 mb-4 dark:bg-brand-900/30">
            <Plane className="w-5 h-5 text-brand-300 dark:text-brand-500" />
          </div>
          <p className="font-medium text-gray-900 mb-1 dark:text-white">No {label.toLowerCase()} flights on this date</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Ryanair doesn't appear to fly this route on the selected date.
            Check the price suggestions below for nearby dates.
          </p>
        </div>
      )}

      {/* Flight cards */}
      {!error && flights.length > 0 && (
        <div className="space-y-2.5">
          {flights.map((flight, i) => {
            const selected = isSelected(flight, selectedFlight)
            return (
              <div
                key={i}
                onClick={() => onSelect?.(flight)}
                className={`bg-white rounded-2xl border px-5 py-4 flex items-center justify-between transition hover:shadow-sm dark:bg-gray-900 ${
                  onSelect ? 'cursor-pointer' : ''
                } ${
                  selected
                    ? 'border-brand-500 ring-2 ring-brand-200 dark:border-brand-500 dark:ring-brand-800'
                    : i === 0
                      ? 'border-brand-200 ring-1 ring-brand-100 dark:border-brand-800 dark:ring-brand-900'
                      : 'border-gray-100 dark:border-gray-800'
                }`}
              >
                <div className="flex items-center gap-4">
                  <img src="/ryanair.png" alt="Ryanair" className="w-7 h-7 rounded-full shrink-0" />
                  {i === 0 && (
                    <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-full shrink-0 dark:text-brand-400 dark:bg-brand-900/30">
                      Best price
                    </span>
                  )}
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                      <span>{flight.origin}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600" />
                      <span>{flight.destination}</span>
                      <span className="text-gray-400 font-normal text-sm ml-1 dark:text-gray-500">
                        {formatTime(flight.departure_time)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 dark:text-gray-600">{flight.origin_full} → {flight.destination_full}</p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                      {flight.currency} {flight.price.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 dark:text-gray-600">{flight.flight_number}</p>
                  </div>
                  <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                    <a
                      href={buildDeeplink(flight)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 transition dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-200"
                    >
                      1-way
                    </a>
                    {outboundDate && inboundDate && (
                      <a
                        href={buildDeeplink(flight, outboundDate, inboundDate)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium px-2.5 py-1 rounded-lg border border-brand-200 text-brand-600 hover:bg-brand-50 transition dark:border-brand-800 dark:text-brand-400 dark:hover:bg-brand-900/30"
                      >
                        Return
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
