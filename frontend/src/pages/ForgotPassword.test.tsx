import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ForgotPassword from './ForgotPassword'

function renderForgotPassword() {
  return render(<MemoryRouter><ForgotPassword /></MemoryRouter>)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ForgotPassword', () => {
  it('renders the forgot-password form', () => {
    renderForgotPassword()
    expect(screen.getByText('Send reset link')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
  })

  it('shows a link back to sign in', () => {
    renderForgotPassword()
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })

  it('shows the success state after a successful submit', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)
    renderForgotPassword()
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'user@test.com' } })
    fireEvent.click(screen.getByText('Send reset link'))
    await waitFor(() => expect(screen.getByText('Check your inbox')).toBeInTheDocument())
  })

  it('shows the submitted email address in the success message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)
    renderForgotPassword()
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'someone@example.com' } })
    fireEvent.click(screen.getByText('Send reset link'))
    await waitFor(() => expect(screen.getByText(/someone@example\.com/)).toBeInTheDocument())
  })

  it('shows an error when the API returns a non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'Rate limit exceeded' }),
    } as Response)
    renderForgotPassword()
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'user@test.com' } })
    fireEvent.click(screen.getByText('Send reset link'))
    await waitFor(() => expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument())
  })

  it('shows loading state while submitting', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ ok: true } as Response), 100))
    )
    renderForgotPassword()
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'user@test.com' } })
    fireEvent.click(screen.getByText('Send reset link'))
    expect(screen.getByText('Sending…')).toBeInTheDocument()
  })

  it('shows a Back to sign in link in the success state', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)
    renderForgotPassword()
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'user@test.com' } })
    fireEvent.click(screen.getByText('Send reset link'))
    await waitFor(() => expect(screen.getByText('Back to sign in')).toBeInTheDocument())
  })
})
