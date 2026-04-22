interface Props {
  value: string   // YYYY-MM-DD or ''
  onChange: (value: string) => void
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const TODAY = new Date()
const THIS_YEAR = TODAY.getFullYear()

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate()
}

function parse(value: string): { year: string; month: string; day: string } {
  if (!value) return { year: '', month: '', day: '' }
  const [y, m, d] = value.split('-')
  return { year: y ?? '', month: m ?? '', day: d ?? '' }
}

function build(year: string, month: string, day: string): string {
  if (!year || !month || !day) return ''
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

const selectClass =
  'text-sm text-gray-900 bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent cursor-pointer transition hover:border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:border-gray-500'

export default function BirthdateInput({ value, onChange }: Props) {
  const { year, month, day } = parse(value)

  const yearNum = year ? parseInt(year) : THIS_YEAR - 5
  const monthNum = month ? parseInt(month) : 1
  const maxDay = daysInMonth(monthNum, yearNum)

  function update(field: 'year' | 'month' | 'day', val: string) {
    const next = {
      year: field === 'year' ? val : year,
      month: field === 'month' ? val : month,
      day: field === 'day' ? val : day,
    }
    // Clamp day if month/year change makes it out of range
    if (next.year && next.month && next.day) {
      const max = daysInMonth(parseInt(next.month), parseInt(next.year))
      if (parseInt(next.day) > max) next.day = String(max)
    }
    onChange(build(next.year, next.month, next.day))
  }

  return (
    <div className="flex items-center gap-1.5 flex-1">
      {/* Day */}
      <select value={day} onChange={e => update('day', e.target.value)} className={selectClass}>
        <option value="">Day</option>
        {Array.from({ length: maxDay }, (_, i) => i + 1).map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {/* Month */}
      <select value={month} onChange={e => update('month', e.target.value)} className={selectClass}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={i + 1} value={i + 1}>{name}</option>
        ))}
      </select>

      {/* Year */}
      <select value={year} onChange={e => update('year', e.target.value)} className={selectClass}>
        <option value="">Year</option>
        {Array.from({ length: 18 }, (_, i) => THIS_YEAR - i).map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  )
}
