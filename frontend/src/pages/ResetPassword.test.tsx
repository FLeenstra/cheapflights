import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ResetPassword from './ResetPassword'

function renderWithToken(token = 'valid-token') {
  return render(
    <MemoryRouter initialEntries={[`/reset-password?token=${token}`]}>
      <ResetPassword />
    </MemoryRouter>
  )
}

function renderWithoutToken() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <ResetPassword />
    </MemoryRouter>
  )
}

function fillPasswords(password: string, confirm: string) {
  fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: password } })
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: confirm } })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ResetPassword', () => {
  it('shows "Invalid link" when there is no token in the URL', () => {
    renderWithoutToken()
    expect(screen.getByText('Invalid link')).toBeInTheDocument()
    expect(screen.getByText('Request a new link')).toBeInTheDocument()
  })

  it('shows the set-new-password form when a token is present', () => {
    renderWithToken()
    expect(screen.getByText('Set new password')).toBeInTheDocument()
    expect(screen.getByText('Update password')).toBeInTheDocument()
  })

  it('shows error when passwords do not match', () => {
    renderWithToken()
    fillPasswords('Password1!', 'Different1!')
    fireEvent.click(screen.getByText('Update password'))
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
  })

  it('shows error when password is shorter than 8 characters', () => {
    renderWithToken()
    fillPasswords('short', 'short')
    fireEvent.click(screen.getByText('Update password'))
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
  })

  it('shows API error on failed reset', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'Token expired' }),
    } as Response)
    renderWithToken()
    fillPasswords('NewPassword1!', 'NewPassword1!')
    fireEvent.click(screen.getByText('Update password'))
    await waitFor(() => expect(screen.getByText('Token expired')).toBeInTheDocument())
  })

  it('shows success state after a successful reset', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)
    renderWithToken()
    fillPasswords('NewPassword1!', 'NewPassword1!')
    fireEvent.click(screen.getByText('Update password'))
    await waitFor(() => expect(screen.getByText('Password updated')).toBeInTheDocument())
  })

  it('shows loading state while submitting', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ ok: true, json: async () => ({}) } as Response), 100))
    )
    renderWithToken()
    fillPasswords('NewPassword1!', 'NewPassword1!')
    fireEvent.click(screen.getByText('Update password'))
    expect(screen.getByText('Updating…')).toBeInTheDocument()
  })
})
