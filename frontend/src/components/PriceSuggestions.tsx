import { TrendingDown } from 'lucide-react'

export interface Suggestion {
  offset: number
  outbound_date: string
  inbound_date: string
  outbound_cheapest: number | null
  inbound_cheapest: number | null
  total: number | null
  is_selected: boolean
}

interface Props {
  suggestions: Suggestion[]
  currency: string
  onSelect: (outboundDate: string, inboundDate: string) => void
}

function shortDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short',
  })
}

function offsetLabel(offset: number) {
  if (offset === 0) return 'Selected'
  return offset > 0 ? `+${offset}d` : `${offset}d`
}

export default function PriceSuggestions({ suggestions, currency, onSelect }: Props) {
  const selectedTotal = suggestions.find(s => s.is_selected)?.total ?? null
  const hasBetterOption = suggestions.some(s => !s.is_selected && s.total !== null && selectedTotal !== null && s.total < selectedTotal)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown className="w-4 h-4 text-brand-600" />
        <h3 className="text-sm font-semibold text-gray-900">Price comparison ±3 days</h3>
        <span className="text-xs text-gray-400">· same trip duration</span>
        {!hasBetterOption && selectedTotal !== null && (
          <span className="ml-auto text-xs text-green-600 font-semibold bg-green-50 px-2.5 py-1 rounded-full">
            Best price window
          </span>
        )}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {suggestions.map(s => {
          const isCheaper = !s.is_selected && s.total !== null && selectedTotal !== null && s.total < selectedTotal
          const isMoreExpensive = !s.is_selected && s.total !== null && selectedTotal !== null && s.total > selectedTotal
          const saving = isCheaper && selectedTotal !== null && s.total !== null
            ? selectedTotal - s.total
            : null

          return (
            <button
              key={s.offset}
              type="button"
              disabled={s.is_selected || s.total === null}
              onClick={() => !s.is_selected && onSelect(s.outbound_date, s.inbound_date)}
              className={`rounded-xl p-2.5 text-center border transition flex flex-col items-center gap-1 w-full ${
                s.is_selected
                  ? 'border-brand-200 bg-brand-50 ring-1 ring-brand-200 cursor-default'
                  : isCheaper
                    ? 'border-green-200 bg-green-50 hover:shadow-md hover:scale-105 cursor-pointer'
                    : s.total !== null
                      ? 'border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm cursor-pointer'
                      : 'border-gray-100 bg-white cursor-default opacity-50'
              }`}
            >
              <span className={`text-xs font-bold ${
                s.is_selected ? 'text-brand-600' : isCheaper ? 'text-green-600' : 'text-gray-400'
              }`}>
                {offsetLabel(s.offset)}
              </span>

              <div className="text-xs text-gray-500 leading-tight">
                <div>{shortDate(s.outbound_date)}</div>
                <div className="text-gray-300">↓</div>
                <div>{shortDate(s.inbound_date)}</div>
              </div>

              {s.total !== null ? (
                <div>
                  <p className={`text-sm font-bold leading-none ${
                    s.is_selected ? 'text-brand-700' : isCheaper ? 'text-green-700' : isMoreExpensive ? 'text-gray-400' : 'text-gray-700'
                  }`}>
                    {currency} {s.total.toFixed(0)}
                  </p>
                  {saving !== null && (
                    <p className="text-xs text-green-600 font-semibold mt-0.5">
                      −{currency} {saving.toFixed(0)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-300">—</p>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Total = cheapest outbound + cheapest return on each date pair
      </p>
    </div>
  )
}
