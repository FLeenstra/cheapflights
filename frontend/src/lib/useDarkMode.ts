import { useEffect, useState } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

function getStoredPreference(): ThemePreference {
  const stored = localStorage.getItem('theme-preference')
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  // Migrate from old boolean 'theme' key
  const legacy = localStorage.getItem('theme')
  if (legacy === 'light' || legacy === 'dark') return legacy
  return 'system'
}

// Module-level state so all hook instances stay in sync without Context
let _preference: ThemePreference = getStoredPreference()
const _listeners = new Set<(p: ThemePreference) => void>()

function applyToDOM(pref: ThemePreference) {
  document.documentElement.classList.toggle('dark', resolveTheme(pref) === 'dark')
}

function setGlobalPreference(pref: ThemePreference) {
  _preference = pref
  localStorage.setItem('theme-preference', pref)
  applyToDOM(pref)
  _listeners.forEach(fn => fn(pref))
}

// Apply on module load so there's no flash on page refresh
applyToDOM(_preference)

export function useDarkMode() {
  const [preference, setLocal] = useState<ThemePreference>(_preference)

  useEffect(() => {
    _listeners.add(setLocal)
    return () => { _listeners.delete(setLocal) }
  }, [])

  // React to OS-level changes when in system mode
  useEffect(() => {
    if (preference !== 'system') return
    function onOsChange() { applyToDOM('system') }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', onOsChange)
    return () => mq.removeEventListener('change', onOsChange)
  }, [preference])

  return { preference, setPreference: setGlobalPreference }
}
