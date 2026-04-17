import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Login from './Login'

function renderLogin() {
  return render(<MemoryRouter><Login /></MemoryRouter>)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('Login', () => {
  it('renders the sign-in form', () => {
    renderLogin()
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })

  it('shows a link to Register', () => {
    renderLogin()
    expect(screen.getByText('Create one')).toBeInTheDocument()
  })

  it('shows a link to Forgot password', () => {
    renderLogin()
    expect(screen.getByText('Forgot password?')).toBeInTheDocument()
  })

  it('shows an error message when the API returns an error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'Invalid credentials' }),
    } as Response)
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'user@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrongpassword' } })
    fireEvent.click(screen.getByText('Sign in'))
    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument())
  })

  it('shows fallback error when API returns no detail', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response)
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'user@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password1' } })
    fireEvent.click(screen.getByText('Sign in'))
    await waitFor(() => expect(screen.getByText('Login failed')).toBeInTheDocument())
  })

  it('shows loading state while submitting', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ ok: true, json: async () => ({}) } as Response), 100))
    )
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'user@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password1' } })
    fireEvent.click(screen.getByText('Sign in'))
    expect(screen.getByText('Signing in…')).toBeInTheDocument()
  })

  it('navigates to /search on successful login', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok' }),
    } as Response)
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'user@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password1' } })
    fireEvent.click(screen.getByText('Sign in'))
    await waitFor(() => expect(screen.queryByText('Signing in…')).not.toBeInTheDocument())
  })
})
