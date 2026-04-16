interface Props {
  outboundPrice: number | null
  inboundPrice: number | null
  currency: string
}

export default function CheapestTotal({ outboundPrice, inboundPrice, currency }: Props) {
  if (outboundPrice === null && inboundPrice === null) return null
  const total = (outboundPrice ?? 0) + (inboundPrice ?? 0)

  return (
    <div className="bg-white rounded-2xl border border-brand-200 ring-1 ring-brand-100 px-6 py-4 flex items-center justify-between dark:bg-gray-900 dark:border-brand-800 dark:ring-brand-900">
      <div className="text-sm text-gray-500 dark:text-gray-400 space-y-0.5">
        {outboundPrice !== null && (
          <p>Outbound: <span className="font-medium text-gray-700 dark:text-gray-200">{currency} {outboundPrice.toFixed(2)}</span></p>
        )}
        {inboundPrice !== null && (
          <p>Return: <span className="font-medium text-gray-700 dark:text-gray-200">{currency} {inboundPrice.toFixed(2)}</span></p>
        )}
      </div>
      <div className="text-right">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-0.5">Cheapest total</p>
        <p className="text-3xl font-bold text-brand-600 dark:text-brand-400">{currency} {total.toFixed(2)}</p>
      </div>
    </div>
  )
}
