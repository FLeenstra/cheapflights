import { MapPin } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
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

export default function AirportInput({ label, placeholder, value, onChange, allowedIata, loading }: Props) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const pool = allowedIata ? airports.filter(a => allowedIata.has(a.iata)) : airports
  const results = query.length >= 1
    ? pool
        .filter(a => match(a, query))
        .sort((a, b) => rank(a, query) - rank(b, query))
        .slice(0, 8)
    : []

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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[highlighted]) handleSelect(results[highlighted])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Reset highlight when results change
  useEffect(() => setHighlighted(0), [query])

  const displayValue = value ? `${value.name || value.city} (${value.iata})` : ''

  function countryLabel(airport: Airport): string {
    const localized = airport.countryCode ? localCountry(airport.countryCode, locale) : ''
    return localized || airport.country
  }

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
          aria-expanded={open && results.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && results[highlighted] ? `${listboxId}-${results[highlighted].iata}` : undefined}
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
          maxLength={30}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:placeholder-gray-600"
        />
      </div>

      {open && results.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1.5 w-full bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden dark:bg-gray-900 dark:border-gray-800"
        >
          {results.map((airport, i) => (
            <li
              key={airport.iata}
              id={`${listboxId}-${airport.iata}`}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={() => handleSelect(airport)}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex items-center justify-between px-4 py-3 cursor-pointer transition ${
                i === highlighted
                  ? 'bg-brand-50 dark:bg-brand-900/30'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <div>
                <span className="font-medium text-gray-900 dark:text-white">{airport.city}</span>
                <span className="text-sm text-gray-400 ml-2 dark:text-gray-500">{countryLabel(airport)}</span>
                {airport.name && (
                  <div className="text-xs text-gray-400 dark:text-gray-600">{airport.name}</div>
                )}
              </div>
              <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md dark:text-brand-400 dark:bg-brand-900/30">
                {airport.iata}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-50 mt-1.5 w-full bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-500">
          {t('airportInput.noResults', { query })}
        </div>
      )}
    </div>
  )
}
