import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Register from './Register'

function renderRegister() {
  return render(<MemoryRouter><Register /></MemoryRouter>)
}

function fillForm(email: string, password: string, confirm: string) {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: email } })
  fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: password } })
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: confirm } })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('Register', () => {
  it('renders the registration form', () => {
    renderRegister()
    expect(screen.getByText('Create account')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
  })

  it('shows a link to Login', () => {
    renderRegister()
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })

  it('shows error when email is invalid', async () => {
    renderRegister()
    fillForm('notanemail', 'Password1!', 'Password1!')
    fireEvent.click(screen.getByText('Create account'))
    expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument()
  })

  it('shows error when passwords do not match', async () => {
    renderRegister()
    fillForm('user@test.com', 'Password1!', 'Different1!')
    fireEvent.click(screen.getByText('Create account'))
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
  })

  it('shows error when password is shorter than 8 characters', async () => {
    renderRegister()
    fillForm('user@test.com', 'short', 'short')
    fireEvent.click(screen.getByText('Create account'))
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
  })

  it('shows API error message on failed registration', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'Email already registered' }),
    } as Response)
    renderRegister()
    fillForm('existing@test.com', 'Password1!', 'Password1!')
    fireEvent.click(screen.getByText('Create account'))
    await waitFor(() => expect(screen.getByText('Email already registered')).toBeInTheDocument())
  })

  it('shows loading state while submitting', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ ok: true, json: async () => ({}) } as Response), 100))
    )
    renderRegister()
    fillForm('user@test.com', 'Password1!', 'Password1!')
    fireEvent.click(screen.getByText('Create account'))
    expect(screen.getByText('Creating account…')).toBeInTheDocument()
  })

  it('navigates away on successful registration', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'tok' }),
    } as Response)
    renderRegister()
    fillForm('new@test.com', 'Password1!', 'Password1!')
    fireEvent.click(screen.getByText('Create account'))
    await waitFor(() => expect(screen.queryByText('Creating account…')).not.toBeInTheDocument())
  })
})
