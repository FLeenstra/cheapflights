import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Profile from './Profile'

function renderProfile() {
  return render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>
  )
}

const defaultProfile = {
  default_origin: null,
  travel_adults: 1,
  travel_children: 0,
  theme_preference: 'system',
}

beforeEach(() => {
  vi.restoreAllMocks()
  // Navbar /auth/me fetch
  vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
    const path = url.toString()
    if (path.includes('/auth/me')) {
      return Promise.resolve({ ok: true, json: async () => ({ is_admin: false }) } as Response)
    }
    if (path.includes('/profile/') && !path.includes('PUT')) {
      return Promise.resolve({ ok: true, json: async () => defaultProfile } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
  })
})

describe('Profile page', () => {
  it('renders section headings', async () => {
    renderProfile()
    await waitFor(() => expect(screen.getByText('Default departure airport')).toBeInTheDocument())
    expect(screen.getByText('Default travel group')).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
  })

  it('shows loading skeletons before profile loads', () => {
    renderProfile()
    const { container } = renderProfile()
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('displays the three theme options', async () => {
    renderProfile()
    await waitFor(() => expect(screen.getByText('Light')).toBeInTheDocument())
    expect(screen.getByText('Dark')).toBeInTheDocument()
    expect(screen.getByText('Device')).toBeInTheDocument()
  })

  it('pre-fills travel group from profile', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const path = url.toString()
      if (path.includes('/auth/me')) return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      if (path.includes('/profile/')) return Promise.resolve({ ok: true, json: async () => ({ ...defaultProfile, travel_adults: 2, travel_children: 1 }) } as Response)
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })
    renderProfile()
    await waitFor(() => expect(screen.getByText('3 passengers total')).toBeInTheDocument())
  })

  it('calls PUT /profile/ with correct body on save', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      const path = url.toString()
      if (path.includes('/auth/me')) return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      if (path.includes('/profile/')) {
        if (init?.method === 'PUT') return Promise.resolve({ ok: true, json: async () => defaultProfile } as Response)
        return Promise.resolve({ ok: true, json: async () => defaultProfile } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })

    renderProfile()
    await waitFor(() => expect(screen.getByText('Save profile')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save profile'))

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT')
      expect(putCall).toBeTruthy()
      const body = JSON.parse((putCall![1] as RequestInit).body as string)
      expect(body.travel_adults).toBe(1)
      expect(body.travel_children).toBe(0)
      expect(body.theme_preference).toBe('system')
    })
  })

  it('shows success message after save', async () => {
    renderProfile()
    await waitFor(() => expect(screen.getByText('Save profile')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save profile'))
    await waitFor(() => expect(screen.getByText('Profile saved.')).toBeInTheDocument())
  })

  it('shows error when save fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      const path = url.toString()
      if (path.includes('/auth/me')) return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      if (path.includes('/profile/')) {
        if ((init as RequestInit)?.method === 'PUT') return Promise.resolve({ ok: false, json: async () => ({ detail: 'Server error' }) } as Response)
        return Promise.resolve({ ok: true, json: async () => defaultProfile } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })
    renderProfile()
    await waitFor(() => expect(screen.getByText('Save profile')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save profile'))
    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument())
  })
})
