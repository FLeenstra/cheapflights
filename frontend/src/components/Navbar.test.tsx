import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './Navbar'

function renderNavbar(path = '/search') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navbar />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ is_admin: false }),
  } as Response)
})

describe('Navbar', () => {
  it('renders main navigation links', () => {
    renderNavbar()
    expect(screen.getByText('Search')).toBeInTheDocument()
    expect(screen.getByText('Saved searches')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
    expect(screen.getByText('Sign out')).toBeInTheDocument()
  })

  it('renders the El Cheapo brand link', () => {
    renderNavbar()
    expect(screen.getByText('El Cheapo')).toBeInTheDocument()
  })

  it('does not show Admin link for non-admin users', async () => {
    renderNavbar()
    await waitFor(() => expect(screen.queryByText('Admin')).not.toBeInTheDocument())
  })

  it('shows Admin link when /auth/me returns is_admin: true', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ is_admin: true }),
    } as Response)
    renderNavbar()
    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument())
  })

  it('does not show Admin link when /auth/me returns non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response)
    renderNavbar()
    await waitFor(() => expect(screen.queryByText('Admin')).not.toBeInTheDocument())
  })

  it('cycles through themes on button click without crashing', () => {
    renderNavbar()
    const themeBtn = screen.getByRole('button', { name: /theme/i })
    expect(themeBtn).toBeInTheDocument()
    fireEvent.click(themeBtn) // system → light
    fireEvent.click(themeBtn) // light → dark
    fireEvent.click(themeBtn) // dark → system
    expect(themeBtn).toBeInTheDocument()
  })

  it('calls POST /auth/logout when Sign out is clicked', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)
    renderNavbar()
    fireEvent.click(screen.getByText('Sign out'))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })

  it('highlights the active nav item based on current path', () => {
    renderNavbar('/saved-searches')
    // The Saved searches link should have the active class
    const savedLink = screen.getByText('Saved searches').closest('a')
    expect(savedLink?.className).toContain('bg-brand-50')
  })
})
