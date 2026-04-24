import { MapPin } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { airports, type Airport } from '../data/airports'
import { sanitizeText } from '../lib/sanitize'

interface Props {
  label: string
  placeholder: string
  value: Airport | null
  onChange: (airport: Airport) => void
  allowedIata?: Set<string>
  loading?: boolean
}

function normalize(str: string): string {
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

// Precomputed once at module load — unique country code + English name pairs (with normalized form)
const uniqueCountries: Array<{ code: string; englishName: string; normalizedEnglish: string }> = (() => {
  const map = new Map<string, string>()
  for (const a of airports) {
    if (!map.has(a.countryCode)) map.set(a.countryCode, a.country)
  }
  return [...map.entries()]
    .map(([code, englishName]) => ({ code, englishName, normalizedEnglish: normalize(englishName) }))
    .sort((a, b) => a.englishName.localeCompare(b.englishName))
})()

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return ''
  const base = 0x1F1E6
  const offset = 65 // 'A'.charCodeAt(0)
  return String.fromCodePoint(
    base + code.toUpperCase().charCodeAt(0) - offset,
    base + code.toUpperCase().charCodeAt(1) - offset,
  )
}

function localCountry(countryCode: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(countryCode) ?? ''
  } catch {
    return ''
  }
}

function match(airport: Airport, query: string): boolean {
  const q = query.toLowerCase()
  return (
    airport.iata.toLowerCase().includes(q) ||
    airport.city.toLowerCase().includes(q) ||
    airport.name.toLowerCase().includes(q) ||
    airport.country.toLowerCase().includes(q)
  )
}

function rank(airport: Airport, query: string): number {
  const q = query.toLowerCase()
  if (airport.iata.toLowerCase() === q) return 0
  if (airport.city.toLowerCase().startsWith(q)) return 1
  if (airport.name.toLowerCase().startsWith(q)) return 2
  if (airport.city.toLowerCase().includes(q)) return 3
  return 4
}

type DropdownItem =
  | { kind: 'country'; code: string; displayName: string }
  | { kind: 'airport'; airport: Airport }

export default function AirportInput({ label, placeholder, value, onChange, allowedIata, loading }: Props) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  // Localized country display names, recomputed only when locale changes
  const localizedCountries = useMemo(() => {
    try {
      const dn = new Intl.DisplayNames([locale], { type: 'region' })
      return uniqueCountries.map(c => {
        const displayName = dn.of(c.code) ?? c.englishName
        return { code: c.code, englishName: c.englishName, normalizedEnglish: c.normalizedEnglish, displayName, normalizedDisplay: normalize(displayName) }
      })
    } catch {
      return uniqueCountries.map(c => ({ ...c, displayName: c.englishName, normalizedDisplay: c.normalizedEnglish }))
    }
  }, [locale])

  function getCountryMatches(q: string): Array<{ code: string; displayName: string }> {
    if (!q) return []
    const ql = normalize(q)
    return localizedCountries
      .filter(c =>
        c.normalizedEnglish.includes(ql) ||
        c.normalizedDisplay.includes(ql) ||
        c.code.toLowerCase() === ql,
      )
      .sort((a, b) => {
        const al = a.normalizedDisplay
        const bl = b.normalizedDisplay
        if (al.startsWith(ql) && !bl.startsWith(ql)) return -1
        if (!al.startsWith(ql) && bl.startsWith(ql)) return 1
        return a.displayName.localeCompare(b.displayName)
      })
  }

  // Parse query for "Country: Airport" syntax
  const colonIdx = query.indexOf(':')
  const inCountryMode = colonIdx >= 0
  const countryPrefix = inCountryMode ? query.slice(0, colonIdx).trim() : ''
  const airportQuery = inCountryMode ? query.slice(colonIdx + 1).trim() : query

  const matchedCountries = inCountryMode && countryPrefix.length > 0
    ? getCountryMatches(countryPrefix)
    : []
  const countryFilter: Set<string> | null = matchedCountries.length > 0
    ? new Set(matchedCountries.map(c => c.code))
    : null

  // Country suggestions shown at the top when there is no colon yet
  const countrySuggestions: DropdownItem[] = !inCountryMode && query.length >= 1
    ? getCountryMatches(query).slice(0, 3).map(c => ({ kind: 'country' as const, code: c.code, displayName: c.displayName }))
    : []

  // Airport pool: filtered by allowedIata and/or country
  const basePool = allowedIata ? airports.filter(a => allowedIata.has(a.iata)) : airports
  const pool = countryFilter
    ? basePool.filter(a => (countryFilter as Set<string>).has(a.countryCode))
    : basePool

  // Airport items
  const airportItems: DropdownItem[] = (() => {
    if (inCountryMode) {
      if (!countryFilter) return []
      const sorted = airportQuery.length === 0
        ? pool.slice().sort((a, b) => a.city.localeCompare(b.city)).slice(0, 8)
        : pool.filter(a => match(a, airportQuery)).sort((a, b) => rank(a, airportQuery) - rank(b, airportQuery)).slice(0, 8)
      return sorted.map(a => ({ kind: 'airport' as const, airport: a }))
    }
    if (query.length < 1) return []
    return pool
      .filter(a => match(a, query))
      .sort((a, b) => rank(a, query) - rank(b, query))
      .slice(0, 8)
      .map(a => ({ kind: 'airport' as const, airport: a }))
  })()

  const dropdownItems: DropdownItem[] = [...countrySuggestions, ...airportItems]

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(airport: Airport) {
    onChange(airport)
    setQuery('')
    setOpen(false)
  }

  function handleCountrySelect(displayName: string) {
    setQuery(`${displayName}: `)
    setOpen(true)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || dropdownItems.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, dropdownItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = dropdownItems[highlighted]
      if (!item) return
      if (item.kind === 'country') handleCountrySelect(item.displayName)
      else handleSelect(item.airport)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Reset highlight when items change
  useEffect(() => setHighlighted(0), [query])

  const displayValue = value ? `${value.name || value.city} (${value.iata})` : ''

  function countryLabel(airport: Airport): string {
    const localized = airport.countryCode ? localCountry(airport.countryCode, locale) : ''
    return localized || airport.country
  }

  function getLocalizedCountryName(countryCode: string): string {
    return localizedCountries.find(c => c.code === countryCode)?.displayName ?? countryCode
  }

  const showNoResults = open && (
    (!inCountryMode && query.length >= 2 && dropdownItems.length === 0) ||
    (inCountryMode && countryFilter !== null && airportQuery.length >= 2 && airportItems.length === 0)
  )

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 dark:text-gray-400">
        {label}
      </label>

      <div className="relative">
        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none dark:text-gray-500" />
        {loading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-brand-300 border-t-transparent animate-spin pointer-events-none" />
        )}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open && dropdownItems.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && dropdownItems[highlighted] ? `${listboxId}-${highlighted}` : undefined}
          placeholder={open || !value ? placeholder : ''}
          value={open ? query : displayValue}
          onFocus={() => {
            setOpen(true)
            setQuery(value?.city ?? '')
          }}
          onChange={e => {
            setQuery(sanitizeText(e.target.value))
            setOpen(true)
          }}
          maxLength={60}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-600"
        />
      </div>

      {open && dropdownItems.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1.5 w-full bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden dark:bg-gray-900 dark:border-gray-800"
        >
          {dropdownItems.map((item, i) =>
            item.kind === 'country' ? (
              <li
                key={`country-${item.code}`}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={() => handleCountrySelect(item.displayName)}
                onMouseEnter={() => setHighlighted(i)}
                className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition ${
                  i === highlighted
                    ? 'bg-brand-50 dark:bg-brand-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{countryFlag(item.code)}</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{item.displayName}</span>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">→</span>
              </li>
            ) : (
              <li
                key={item.airport.iata}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === highlighted}
                onMouseDown={() => handleSelect(item.airport)}
                onMouseEnter={() => setHighlighted(i)}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer transition ${
                  i === highlighted
                    ? 'bg-brand-50 dark:bg-brand-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">{item.airport.city}</span>
                  {item.airport.countryCode && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleCountrySelect(getLocalizedCountryName(item.airport.countryCode)) }}
                      className="ml-1.5 text-sm hover:opacity-70 transition-opacity"
                    >
                      {countryFlag(item.airport.countryCode)}
                    </button>
                  )}
                  <span className="text-sm text-gray-400 ml-1 dark:text-gray-500">{countryLabel(item.airport)}</span>
                  {item.airport.name && (
                    <div className="text-xs text-gray-400 dark:text-gray-600">{item.airport.name}</div>
                  )}
                </div>
                <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md dark:text-brand-400 dark:bg-brand-900/30">
                  {item.airport.iata}
                </span>
              </li>
            )
          )}
        </ul>
      )}

      {showNoResults && (
        <div className="absolute z-50 mt-1.5 w-full bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-500">
          {t('airportInput.noResults', { query: inCountryMode ? airportQuery : query })}
        </div>
      )}
    </div>
  )
}
