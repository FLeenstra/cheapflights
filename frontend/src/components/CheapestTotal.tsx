import { useTranslation } from 'react-i18next'

interface Props {
  outboundPrice: number | null
  inboundPrice: number | null
  currency: string
  passengers?: number
  isCustomSelection?: boolean
}

export default function CheapestTotal({ outboundPrice, inboundPrice, currency, passengers = 1, isCustomSelection }: Props) {
  const { t } = useTranslation()
  if (outboundPrice === null && inboundPrice === null) return null
  const perPersonTotal = (outboundPrice ?? 0) + (inboundPrice ?? 0)
  const groupTotal = perPersonTotal * passengers
  const label = isCustomSelection ? t('cheapestTotal.selectedTotal') : t('cheapestTotal.cheapestTotal')
  const passengerLabel = passengers > 1 ? t('cheapestTotal.forPassengers', { n: passengers }) : t('cheapestTotal.perPerson')

  return (
    <div className="bg-white rounded-2xl border border-brand-200 ring-1 ring-brand-100 px-6 py-4 flex items-center justify-between dark:bg-gray-900 dark:border-brand-800 dark:ring-brand-900">
      <div className="text-sm text-gray-500 dark:text-gray-400 space-y-0.5">
        {outboundPrice !== null && (
          <p>{t('cheapestTotal.outbound')}: <span className="font-medium text-gray-700 dark:text-gray-200">{currency} {outboundPrice.toFixed(2)}</span> <span className="text-gray-400 dark:text-gray-500">{t('cheapestTotal.perPerson')}</span></p>
        )}
        {inboundPrice !== null && (
          <p>{t('cheapestTotal.return')}: <span className="font-medium text-gray-700 dark:text-gray-200">{currency} {inboundPrice.toFixed(2)}</span> <span className="text-gray-400 dark:text-gray-500">{t('cheapestTotal.perPerson')}</span></p>
        )}
      </div>
      <div className="text-right">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-0.5">
          {label} · {passengerLabel}
        </p>
        <p className="text-3xl font-bold text-brand-600 dark:text-brand-400">{currency} {groupTotal.toFixed(2)}</p>
        {passengers > 1 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{currency} {perPersonTotal.toFixed(2)} {t('cheapestTotal.perPerson')}</p>
        )}
      </div>
    </div>
  )
}
