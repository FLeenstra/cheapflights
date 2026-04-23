import { TrendingDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

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

export default function PriceSuggestions({ suggestions, currency, onSelect }: Props) {
  const { t } = useTranslation()
  const selectedTotal = suggestions.find(s => s.is_selected)?.total ?? null
  const hasBetterOption = suggestions.some(s => !s.is_selected && s.total !== null && selectedTotal !== null && s.total < selectedTotal)

  function offsetLabel(offset: number) {
    if (offset === 0) return t('priceSuggestions.selected')
    return offset > 0 ? `+${offset}d` : `${offset}d`
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown className="w-4 h-4 text-brand-600 dark:text-brand-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('priceSuggestions.title')}</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">· {t('priceSuggestions.sameDuration')}</span>
        {!hasBetterOption && selectedTotal !== null && (
          <span className="ml-auto text-xs text-green-600 font-semibold bg-green-50 px-2.5 py-1 rounded-full dark:text-green-400 dark:bg-green-900/20">
            {t('priceSuggestions.bestWindow')}
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
                  ? 'border-brand-200 bg-brand-50 ring-1 ring-brand-200 cursor-default dark:border-brand-800 dark:bg-brand-900/30 dark:ring-brand-800'
                  : isCheaper
                    ? 'border-green-200 bg-green-50 hover:shadow-md hover:scale-105 cursor-pointer dark:border-green-800 dark:bg-green-900/20'
                    : s.total !== null
                      ? 'border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm cursor-pointer dark:border-gray-800 dark:bg-gray-800 dark:hover:border-gray-600'
                      : 'border-gray-100 bg-white cursor-default opacity-50 dark:border-gray-800 dark:bg-gray-800'
              }`}
            >
              <span className={`text-xs font-bold ${
                s.is_selected
                  ? 'text-brand-600 dark:text-brand-400'
                  : isCheaper
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-400 dark:text-gray-500'
              }`}>
                {offsetLabel(s.offset)}
              </span>

              <div className="text-xs text-gray-500 leading-tight dark:text-gray-400">
                <div>{shortDate(s.outbound_date)}</div>
                <div className="text-gray-300 dark:text-gray-600">↓</div>
                <div>{shortDate(s.inbound_date)}</div>
              </div>

              {s.total !== null ? (
                <div>
                  <p className={`text-sm font-bold leading-none ${
                    s.is_selected
                      ? 'text-brand-700 dark:text-brand-300'
                      : isCheaper
                        ? 'text-green-700 dark:text-green-400'
                        : isMoreExpensive
                          ? 'text-gray-400 dark:text-gray-500'
                          : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {currency} {s.total.toFixed(0)}
                  </p>
                  {saving !== null && (
                    <p className="text-xs text-green-600 font-semibold mt-0.5 dark:text-green-400">
                      −{currency} {saving.toFixed(0)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-300 dark:text-gray-600">—</p>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3 dark:text-gray-500">
        {t('priceSuggestions.totalNote')}
      </p>
    </div>
  )
}
