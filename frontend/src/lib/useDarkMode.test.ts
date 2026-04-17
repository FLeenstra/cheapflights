import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDarkMode } from './useDarkMode'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('useDarkMode', () => {
  it('returns a preference value', () => {
    const { result } = renderHook(() => useDarkMode())
    expect(['light', 'dark', 'system']).toContain(result.current.preference)
  })

  it('setPreference to dark adds the dark class and persists to localStorage', () => {
    const { result } = renderHook(() => useDarkMode())
    act(() => result.current.setPreference('dark'))
    expect(result.current.preference).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('theme-preference')).toBe('dark')
  })

  it('setPreference to light removes the dark class', () => {
    const { result } = renderHook(() => useDarkMode())
    act(() => result.current.setPreference('dark'))
    act(() => result.current.setPreference('light'))
    expect(result.current.preference).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme-preference')).toBe('light')
  })

  it('setPreference to system persists system to localStorage', () => {
    const { result } = renderHook(() => useDarkMode())
    act(() => result.current.setPreference('system'))
    expect(result.current.preference).toBe('system')
    expect(localStorage.getItem('theme-preference')).toBe('system')
  })

  it('two hook instances stay in sync when one updates preference', () => {
    const { result: a } = renderHook(() => useDarkMode())
    const { result: b } = renderHook(() => useDarkMode())
    act(() => a.current.setPreference('dark'))
    expect(b.current.preference).toBe('dark')
  })

  it('setPreference cycles back to light after system', () => {
    const { result } = renderHook(() => useDarkMode())
    act(() => result.current.setPreference('light'))
    act(() => result.current.setPreference('dark'))
    act(() => result.current.setPreference('system'))
    act(() => result.current.setPreference('light'))
    expect(result.current.preference).toBe('light')
  })
})
