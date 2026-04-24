import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Admin from './Admin'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const adminUser = { id: '1', email: 'admin@test.com', created_at: '2024-01-01T00:00:00Z', route_count: 3, is_admin: true }
const regularUser = { id: '2', email: 'user@test.com', created_at: '2024-01-02T00:00:00Z', route_count: 1, is_admin: false }

function renderAdmin() {
  return render(<MemoryRouter><Admin /></MemoryRouter>)
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockNavigate.mockReset()
  vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
    const path = url.toString()
    if (path.includes('/admin/users')) return Promise.resolve({ ok: true, status: 200, json: async () => [adminUser, regularUser] } as Response)
    if (path.includes('/admin/logs')) return Promise.resolve({ ok: true, json: async () => [] } as Response)
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
  })
})

describe('Admin page — users table', () => {
  it('renders user rows after loading', async () => {
    renderAdmin()
    await waitFor(() => expect(screen.getByText('admin@test.com')).toBeInTheDocument())
    expect(screen.getByText('user@test.com')).toBeInTheDocument()
  })

  it('shows admin toggle on for admin user', async () => {
    renderAdmin()
    await waitFor(() => expect(screen.getByText('admin@test.com')).toBeInTheDocument())
    const toggles = screen.getAllByRole('switch')
    const adminToggle = toggles.find(t => t.getAttribute('aria-checked') === 'true')
    expect(adminToggle).toBeTruthy()
  })

  it('shows admin toggle off for non-admin user', async () => {
    renderAdmin()
    await waitFor(() => expect(screen.getByText('user@test.com')).toBeInTheDocument())
    const toggles = screen.getAllByRole('switch')
    const regularToggle = toggles.find(t => t.getAttribute('aria-checked') === 'false')
    expect(regularToggle).toBeTruthy()
  })

  it('calls PUT when toggling a non-admin user to admin', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      const path = url.toString()
      if (path.includes('/admin/users') && !path.includes('make-admin')) return Promise.resolve({ ok: true, status: 200, json: async () => [adminUser, regularUser] } as Response)
      if (path.includes('/admin/logs')) return Promise.resolve({ ok: true, json: async () => [] } as Response)
      if (path.includes('make-admin')) return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })
    renderAdmin()
    await waitFor(() => expect(screen.getByText('user@test.com')).toBeInTheDocument())
    const offToggle = screen.getAllByRole('switch').find(t => t.getAttribute('aria-checked') === 'false')!
    fireEvent.click(offToggle)
    await waitFor(() => {
      const makeAdminCall = fetchMock.mock.calls.find(([url, init]) =>
        url.toString().includes('make-admin') && (init as RequestInit)?.method === 'PUT'
      )
      expect(makeAdminCall).toBeTruthy()
    })
  })

  it('calls DELETE when toggling an admin user to non-admin', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL, init?: RequestInit) => {
      const path = url.toString()
      if (path.includes('/admin/users') && !path.includes('make-admin')) return Promise.resolve({ ok: true, status: 200, json: async () => [adminUser, regularUser] } as Response)
      if (path.includes('/admin/logs')) return Promise.resolve({ ok: true, json: async () => [] } as Response)
      if (path.includes('make-admin')) return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })
    renderAdmin()
    await waitFor(() => expect(screen.getByText('admin@test.com')).toBeInTheDocument())
    const onToggle = screen.getAllByRole('switch').find(t => t.getAttribute('aria-checked') === 'true')!
    fireEvent.click(onToggle)
    await waitFor(() => {
      const revokeCall = fetchMock.mock.calls.find(([url, init]) =>
        url.toString().includes('make-admin') && (init as RequestInit)?.method === 'DELETE'
      )
      expect(revokeCall).toBeTruthy()
    })
  })

  it('shows error message when toggle fails', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const path = url.toString()
      if (path.includes('/admin/users') && !path.includes('make-admin')) return Promise.resolve({ ok: true, status: 200, json: async () => [adminUser, regularUser] } as Response)
      if (path.includes('/admin/logs')) return Promise.resolve({ ok: true, json: async () => [] } as Response)
      if (path.includes('make-admin')) return Promise.resolve({ ok: false, json: async () => ({ detail: 'Cannot demote the primary admin' }) } as Response)
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })
    renderAdmin()
    await waitFor(() => expect(screen.getByText('admin@test.com')).toBeInTheDocument())
    const onToggle = screen.getAllByRole('switch').find(t => t.getAttribute('aria-checked') === 'true')!
    fireEvent.click(onToggle)
    await waitFor(() => expect(screen.getByText('Cannot demote the primary admin')).toBeInTheDocument())
  })

  it('navigates away on 401 from users endpoint', async () => {
    vi.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const path = url.toString()
      if (path.includes('/admin/users')) return Promise.resolve({ ok: false, status: 401, json: async () => ({}) } as Response)
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    })
    renderAdmin()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/search'))
  })
})
