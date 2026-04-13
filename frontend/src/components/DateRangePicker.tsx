import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'

interface Props {
  from: Date | undefined
  to: Date | undefined
  onChange: (range: DateRange) => void
}

function fmt(d: Date | undefined) {
  if (!d) return undefined
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DateRangePicker({ from, to, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const hasRange = from && to
  const hasFrom = !!from

  return (
    <div ref={containerRef} className="relative sm:col-span-2">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        Travel dates
      </label>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border bg-white text-left transition focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent ${
          open ? 'border-brand-600 ring-2 ring-brand-600' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
        <span className={hasFrom ? 'text-gray-900 font-medium' : 'text-gray-300'}>
          {fmt(from) ?? 'Departure date'}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
        <span className={to ? 'text-gray-900 font-medium' : 'text-gray-300'}>
          {fmt(to) ?? 'Return date'}
        </span>
        {hasRange && (
          <span className="ml-auto text-xs text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-semibold shrink-0">
            {Math.round((to.getTime() - from.getTime()) / 86_400_000)}d
          </span>
        )}
      </button>

      {/* Calendar popup */}
      {open && (
        <div className="absolute z-50 mt-2 left-0 bg-white border border-gray-100 rounded-2xl shadow-2xl p-5 w-max">
          <DayPicker
            mode="range"
            selected={{ from, to }}
            onSelect={range => onChange(range ?? { from: undefined, to: undefined })}
            disabled={{ before: new Date() }}
            numberOfMonths={2}
            components={{
              Chevron: ({ orientation }) =>
                orientation === 'left'
                  ? <ChevronLeft className="w-4 h-4" />
                  : <ChevronRight className="w-4 h-4" />,
            }}
            classNames={{
              root: 'text-sm select-none',
              months: 'flex gap-8',
              month: 'space-y-3',
              month_caption: 'flex items-center justify-between mb-2',
              caption_label: 'font-semibold text-gray-900 text-sm',
              nav: 'flex items-center gap-1',
              button_previous:
                'p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition focus:outline-none',
              button_next:
                'p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition focus:outline-none',
              month_grid: 'w-full border-collapse',
              weekdays: 'flex mb-1',
              weekday: 'w-9 h-7 flex items-center justify-center text-xs font-medium text-gray-400',
              week: 'flex',
              day: 'p-0',
              day_button:
                'w-9 h-9 flex items-center justify-center rounded-lg text-gray-700 text-sm font-medium hover:bg-brand-50 hover:text-brand-700 transition focus:outline-none',
              today: '[&>button]:text-brand-600 [&>button]:font-bold',
              outside: '[&>button]:text-gray-300 [&>button]:hover:bg-transparent [&>button]:cursor-default',
              disabled:
                '[&>button]:text-gray-200 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent',
              selected:
                '[&>button]:bg-brand-600 [&>button]:text-white [&>button]:hover:bg-brand-700 [&>button]:rounded-lg',
              range_start:
                'bg-brand-50 rounded-l-lg [&>button]:bg-brand-600 [&>button]:text-white [&>button]:hover:bg-brand-700',
              range_end:
                'bg-brand-50 rounded-r-lg [&>button]:bg-brand-600 [&>button]:text-white [&>button]:hover:bg-brand-700',
              range_middle:
                'bg-brand-50 rounded-none [&>button]:bg-transparent [&>button]:text-brand-700 [&>button]:rounded-none [&>button]:hover:bg-brand-100',
            }}
          />

          {hasRange && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-900">{fmt(from)}</span>
                {' → '}
                <span className="font-semibold text-gray-900">{fmt(to)}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  onChange({ from: undefined, to: undefined })
                  setOpen(false)
                }}
                className="text-xs text-gray-400 hover:text-gray-600 transition"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
