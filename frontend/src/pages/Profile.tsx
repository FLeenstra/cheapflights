import { Monitor, Moon, Plus, Sun, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import AirportInput from '../components/AirportInput'
import Navbar from '../components/Navbar'
import { type Airport, airports } from '../data/airports'
import { type ThemePreference, useDarkMode } from '../lib/useDarkMode'

interface ProfileData {
  default_origin: string | null
  travel_adults: number
  travel_children_birthdates: string[]
  theme_preference: ThemePreference
}

function calcAge(birthdate: string, referenceDate = new Date()): number {
  const birth = new Date(birthdate + 'T12:00:00')
  let age = referenceDate.getFullYear() - birth.getFullYear()
  const m = referenceDate.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && referenceDate.getDate() < birth.getDate())) age--
  return Math.max(0, age)
}

function ageCategory(age: number): { label: string; className: string } {
  if (age < 2)  return { label: 'Infant',  className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
  if (age < 16) return { label: 'Child',   className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' }
  return         { label: 'Adult',    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
}

const today = new Date().toISOString().split('T')[0]

export default function Profile() {
  const { preference: currentTheme, setPreference } = useDarkMode()

  const [defaultOrigin, setDefaultOrigin] = useState<Airport | null>(null)
  const [travelAdults, setTravelAdults] = useState(1)
  const [childrenBirthdates, setChildrenBirthdates] = useState<string[]>([])
  const [theme, setTheme] = useState<ThemePreference>(currentTheme)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [deleteRequesting, setDeleteRequesting] = useState(false)
  const [deleteRequested, setDeleteRequested] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/profile/', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
      fetch('/api/auth/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    ]).then(([profile, me]: [ProfileData | null, { is_admin: boolean } | null]) => {
      if (profile) {
        setDefaultOrigin(profile.default_origin ? (airports.find(a => a.iata === profile.default_origin) ?? null) : null)
        setTravelAdults(profile.travel_adults)
        setChildrenBirthdates(profile.travel_children_birthdates ?? [])
        setTheme(profile.theme_preference)
        setPreference(profile.theme_preference)
      }
      if (me) setIsAdmin(me.is_admin)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  function handleThemeSelect(pref: ThemePreference) {
    setTheme(pref)
    setPreference(pref)
  }

  function updateBirthdate(index: number, value: string) {
    setSaveSuccess(false)
    setChildrenBirthdates(prev => prev.map((d, i) => i === index ? value : d))
  }

  function removeChild(index: number) {
    setSaveSuccess(false)
    setChildrenBirthdates(prev => prev.filter((_, i) => i !== index))
  }

  function addChild() {
    if (travelAdults + childrenBirthdates.length >= 9) return
    setSaveSuccess(false)
    setChildrenBirthdates(prev => [...prev, ''])
  }

  async function handleRequestDelete() {
    setDeleteRequesting(true)
    setDeleteError('')
    try {
      const res = await fetch('/api/auth/request-delete-account', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? 'Request failed')
      setDeleteRequested(true)
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setDeleteRequesting(false)
    }
  }

  async function handleSave() {
    if (travelAdults + childrenBirthdates.length > 9) {
      setSaveError('Total passengers (adults + children) cannot exceed 9.')
      return
    }
    const invalidDates = childrenBirthdates.filter(d => !d)
    if (invalidDates.length > 0) {
      setSaveError('Please fill in a date of birth for each child.')
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
          travel_children_birthdates: childrenBirthdates,
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
    { value: 'light',  label: 'Light',  Icon: Sun },
    { value: 'dark',   label: 'Dark',   Icon: Moon },
    { value: 'system', label: 'Device', Icon: Monitor },
  ]

  function Counter({ value, onChange, min, max }: { value: number; onChange: (n: number) => void; min: number; max: number }) {
    return (
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
          −
        </button>
        <span className="w-6 text-center font-semibold text-gray-900 dark:text-white">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
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
              <AirportInput label="" placeholder="e.g. Dublin" value={defaultOrigin} onChange={setDefaultOrigin} />
              {defaultOrigin && (
                <button type="button" onClick={() => setDefaultOrigin(null)}
                  className="mt-2 text-xs text-gray-400 hover:text-red-500 transition dark:text-gray-600 dark:hover:text-red-400">
                  Clear
                </button>
              )}
            </div>

            {/* Travel group */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 dark:bg-gray-900 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-700 mb-1 dark:text-gray-200">Default travel group</h2>
              <p className="text-xs text-gray-400 mb-5 dark:text-gray-500">Pre-fills the passenger count on every new search.</p>

              {/* Adults */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Adults</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">16 years and above</p>
                </div>
                <Counter
                  value={travelAdults}
                  onChange={v => { setSaveSuccess(false); setTravelAdults(v) }}
                  min={1}
                  max={9 - childrenBirthdates.length}
                />
              </div>

              {/* Children */}
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Children</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Under 16 — enter date of birth to verify age category</p>
                  </div>
                </div>

                {childrenBirthdates.length === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">No children added.</p>
                )}

                <div className="space-y-3 mb-3">
                  {childrenBirthdates.map((bd, i) => {
                    const age = bd ? calcAge(bd) : null
                    const cat = age !== null ? ageCategory(age) : null
                    return (
                      <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 dark:bg-gray-800">
                        <span className="text-xs font-medium text-gray-500 w-14 shrink-0 dark:text-gray-400">Child {i + 1}</span>
                        <input
                          type="date"
                          value={bd}
                          max={today}
                          onChange={e => updateBirthdate(i, e.target.value)}
                          className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent transition dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                        {cat && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-md shrink-0 ${cat.className}`}>
                            {age}y · {cat.label}
                          </span>
                        )}
                        {age !== null && age >= 16 && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">⚠ counts as adult</span>
                        )}
                        <button type="button" onClick={() => removeChild(i)}
                          className="text-gray-400 hover:text-red-500 transition dark:text-gray-600 dark:hover:text-red-400 shrink-0">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>

                {travelAdults + childrenBirthdates.length < 9 && (
                  <button type="button" onClick={addChild}
                    className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium transition dark:text-brand-400 dark:hover:text-brand-300">
                    <Plus className="w-4 h-4" />
                    Add child
                  </button>
                )}

                {travelAdults + childrenBirthdates.length > 1 && (
                  <p className="text-xs text-gray-400 mt-3 dark:text-gray-500">
                    {travelAdults + childrenBirthdates.length} passengers total
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
                  <button key={value} type="button"
                    onClick={() => { setSaveSuccess(false); handleThemeSelect(value) }}
                    className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition ${
                      theme === value
                        ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-900/30 dark:text-brand-400'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}>
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>

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

            <button type="button" onClick={handleSave} disabled={saving}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 dark:focus:ring-offset-gray-950">
              {saving ? 'Saving…' : 'Save profile'}
            </button>

            {/* Danger zone */}
            <div className="bg-white rounded-2xl border border-red-100 p-6 dark:bg-gray-900 dark:border-red-900/50">
              <h2 className="text-sm font-semibold text-red-700 mb-1 dark:text-red-400">Danger zone</h2>
              <p className="text-xs text-gray-400 mb-4 dark:text-gray-500">
                Permanently delete your account and all associated data. This cannot be undone.
              </p>
              {isAdmin ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400">
                  Admin accounts cannot be deleted. Revoke your admin rights in the admin panel first.
                </div>
              ) : deleteRequested ? (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
                  Check your email for a confirmation link to complete the deletion.
                </div>
              ) : (
                <>
                  {deleteError && (
                    <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                      {deleteError}
                    </div>
                  )}
                  <button type="button" onClick={handleRequestDelete} disabled={deleteRequesting}
                    className="border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed font-semibold px-5 py-2.5 rounded-xl text-sm transition dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20">
                    {deleteRequesting ? 'Sending…' : 'Delete account'}
                  </button>
                </>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
