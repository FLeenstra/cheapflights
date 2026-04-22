import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DayPicker, type DropdownProps } from 'react-day-picker'

interface Props {
  value: string   // YYYY-MM-DD or ''
  onChange: (value: string) => void
}

const TODAY = new Date()
const FROM_YEAR = TODAY.getFullYear() - 17
const TO_YEAR = TODAY.getFullYear()

function toDate(s: string): Date | undefined {
  if (!s) return undefined
  const d = new Date(s + 'T12:00:00')
  return isNaN(d.getTime()) ? undefined : d
}

function fromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(d: Date | undefined) {
  if (!d) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function NavDropdown({ value, onChange, options }: DropdownProps) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="text-sm font-semibold text-gray-800 bg-gray-100 hover:bg-gray-200 border-0 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
    >
      {options?.map(o => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  )
}

export default function BirthdateInput({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = toDate(value)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  return (
    <div ref={ref} className="relative flex-1">

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-white text-sm text-left transition focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent dark:bg-gray-700 ${
          open
            ? 'border-brand-500 ring-2 ring-brand-200 dark:border-brand-500 dark:ring-brand-900'
            : 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500'
        }`}
      >
        <CalendarDays className="w-4 h-4 text-brand-400 shrink-0" />
        <span className={selected ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}>
          {fmt(selected) ?? 'Select date of birth'}
        </span>
      </button>

      {/* Calendar popup */}
      {open && (
        <div className="absolute z-50 mt-2 left-0 bg-white border border-gray-100 rounded-2xl shadow-2xl p-5 dark:bg-gray-900 dark:border-gray-800">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={day => { if (day) { onChange(fromDate(day)); setOpen(false) } }}
            disabled={{ after: TODAY }}
            captionLayout="dropdown"
            fromYear={FROM_YEAR}
            toYear={TO_YEAR}
            defaultMonth={selected ?? new Date(TO_YEAR - 6, 0)}
            components={{
              Dropdown: NavDropdown,
              Chevron: ({ orientation }) =>
                orientation === 'left'
                  ? <ChevronLeft className="w-4 h-4" />
                  : <ChevronRight className="w-4 h-4" />,
            }}
            classNames={{
              root: 'text-sm select-none',
              month: 'space-y-3',
              month_caption: 'flex items-center gap-2 mb-2',
              dropdowns: 'flex items-center gap-1.5 flex-1',
              caption_label: 'hidden',
              nav: 'flex items-center gap-1 ml-auto',
              button_previous: 'p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition focus:outline-none dark:hover:bg-gray-800 dark:text-gray-400',
              button_next: 'p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition focus:outline-none dark:hover:bg-gray-800 dark:text-gray-400',
              month_grid: 'w-full border-collapse',
              weekdays: 'flex mb-1',
              weekday: 'w-9 h-7 flex items-center justify-center text-xs font-medium text-gray-400 dark:text-gray-600',
              week: 'flex',
              day: 'p-0',
              day_button: 'w-9 h-9 flex items-center justify-center rounded-lg text-gray-700 text-sm font-medium hover:bg-brand-50 hover:text-brand-700 transition focus:outline-none dark:text-gray-300 dark:hover:bg-brand-900/30 dark:hover:text-brand-400',
              today: '[&>button]:text-brand-600 [&>button]:font-bold dark:[&>button]:text-brand-400',
              outside: '[&>button]:text-gray-300 [&>button]:hover:bg-transparent dark:[&>button]:text-gray-700',
              disabled: '[&>button]:text-gray-200 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent dark:[&>button]:text-gray-700',
              selected: '[&>button]:bg-brand-600 [&>button]:text-white [&>button]:hover:bg-brand-700 [&>button]:rounded-lg',
            }}
          />
        </div>
      )}
    </div>
  )
}
