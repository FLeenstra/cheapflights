import { Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import AirportInput from '../components/AirportInput'
import Navbar from '../components/Navbar'
import { type Airport, airports } from '../data/airports'
import { type ThemePreference, useDarkMode } from '../lib/useDarkMode'

interface ProfileData {
  default_origin: string | null
  travel_adults: number
  travel_children: number
  theme_preference: ThemePreference
}

export default function Profile() {
  const { preference: currentTheme, setPreference } = useDarkMode()

  const [defaultOrigin, setDefaultOrigin] = useState<Airport | null>(null)
  const [travelAdults, setTravelAdults] = useState(1)
  const [travelChildren, setTravelChildren] = useState(0)
  const [theme, setTheme] = useState<ThemePreference>(currentTheme)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    fetch('/api/profile/', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: ProfileData | null) => {
        if (!data) return
        setDefaultOrigin(data.default_origin ? (airports.find(a => a.iata === data.default_origin) ?? null) : null)
        setTravelAdults(data.travel_adults)
        setTravelChildren(data.travel_children)
        setTheme(data.theme_preference)
        setPreference(data.theme_preference)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function handleThemeSelect(pref: ThemePreference) {
    setTheme(pref)
    setPreference(pref)
  }

  async function handleSave() {
    const total = travelAdults + travelChildren
    if (total > 9) {
      setSaveError('Total passengers (adults + children) cannot exceed 9.')
      return
    }
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    try {
      const res = await fetch('/api/profile/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          default_origin: defaultOrigin?.iata ?? null,
          travel_adults: travelAdults,
          travel_children: travelChildren,
          theme_preference: theme,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? 'Failed to save profile')
      setSaveSuccess(true)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const themeOptions: { value: ThemePreference; label: string; Icon: React.ElementType }[] = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark',  label: 'Dark',  Icon: Moon },
    { value: 'system', label: 'Device', Icon: Monitor },
  ]

  function Counter({ value, onChange, min, max }: { value: number; onChange: (n: number) => void; min: number; max: number }) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          −
        </button>
        <span className="w-6 text-center font-semibold text-gray-900 dark:text-white">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          +
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-brand-50 dark:bg-gray-950">
      <Navbar />

      <div className="max-w-xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 dark:text-white">Profile</h1>
        <p className="text-gray-500 text-sm mb-8 dark:text-gray-400">
          Set your defaults — they'll pre-fill the search form automatically.
        </p>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 h-28 animate-pulse dark:bg-gray-900 dark:border-gray-800" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            {/* Default origin */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 dark:bg-gray-900 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-700 mb-1 dark:text-gray-200">Default departure airport</h2>
              <p className="text-xs text-gray-400 mb-4 dark:text-gray-500">Pre-fills the "From" field on every new search.</p>
              <AirportInput
                label=""
                placeholder="e.g. Dublin"
                value={defaultOrigin}
                onChange={setDefaultOrigin}
              />
              {defaultOrigin && (
                <button
                  type="button"
                  onClick={() => setDefaultOrigin(null)}
                  className="mt-2 text-xs text-gray-400 hover:text-red-500 transition dark:text-gray-600 dark:hover:text-red-400"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Travel group */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 dark:bg-gray-900 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-700 mb-1 dark:text-gray-200">Default travel group</h2>
              <p className="text-xs text-gray-400 mb-5 dark:text-gray-500">Pre-fills the passenger count on every new search.</p>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Adults</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">16 years and above</p>
                  </div>
                  <Counter
                    value={travelAdults}
                    onChange={v => { setSaveSuccess(false); setTravelAdults(v) }}
                    min={1}
                    max={9 - travelChildren}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Children</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Under 16 years</p>
                  </div>
                  <Counter
                    value={travelChildren}
                    onChange={v => { setSaveSuccess(false); setTravelChildren(v) }}
                    min={0}
                    max={9 - travelAdults}
                  />
                </div>

                {travelAdults + travelChildren > 1 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {travelAdults + travelChildren} passengers total
                  </p>
                )}
              </div>
            </div>

            {/* Appearance */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 dark:bg-gray-900 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-700 mb-1 dark:text-gray-200">Appearance</h2>
              <p className="text-xs text-gray-400 mb-4 dark:text-gray-500">Choose how El Cheapo looks to you.</p>

              <div className="flex gap-3">
                {themeOptions.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setSaveSuccess(false); handleThemeSelect(value) }}
                    className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition ${
                      theme === value
                        ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-900/30 dark:text-brand-400'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Save */}
            {saveError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
                Profile saved.
              </div>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 dark:focus:ring-offset-gray-950"
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
