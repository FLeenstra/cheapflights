import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Search from './Search'

const defaultProfile = {
  default_origin: null,
  travel_adults: 1,
  travel_children_birthdates: [],
  theme_preference: 'system',
}

function mockFetch(profileOverride = defaultProfile) {
  vi.spyOn(global, 'fetch').mockImplementation((url) => {
    const path = url.toString()
    if (path.includes('/profile/')) return Promise.resolve({ ok: true, json: async () => profileOverride } as Response)
    if (path.includes('/auth/me'))  return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
  })
}

function renderSearch() {
  return render(<MemoryRouter><Search /></MemoryRouter>)
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockFetch()
})

// ---------------------------------------------------------------------------
// Adults counter
// ---------------------------------------------------------------------------

describe('Search — adults counter', () => {
  it('shows the Adults label and defaults to 1', async () => {
    renderSearch()
    await waitFor(() => expect(screen.getByText('Adults')).toBeInTheDocument())
    // The adults row contains the count "1"
    const adultsRow = screen.getByText('Adults').closest('div')!
    expect(within(adultsRow).getByText('1')).toBeInTheDocument()
  })

  it('− button is disabled when adults = 1', async () => {
    renderSearch()
    await waitFor(() => expect(screen.getByText('Adults')).toBeInTheDocument())
    const adultsRow = screen.getByText('Adults').closest('div')!
    const minusBtn = within(adultsRow).getByText('−')
    expect(minusBtn).toBeDisabled()
  })

  it('increments adults when + is clicked', async () => {
    renderSearch()
    await waitFor(() => expect(screen.getByText('Adults')).toBeInTheDocument())
    const adultsRow = screen.getByText('Adults').closest('div')!
    fireEvent.click(within(adultsRow).getByText('+'))
    expect(within(adultsRow).getByText('2')).toBeInTheDocument()
  })

  it('decrements adults when − is clicked', async () => {
    renderSearch()
    await waitFor(() => expect(screen.getByText('Adults')).toBeInTheDocument())
    const adultsRow = screen.getByText('Adults').closest('div')!
    fireEvent.click(within(adultsRow).getByText('+'))
    fireEvent.click(within(adultsRow).getByText('−'))
    expect(within(adultsRow).getByText('1')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

describe('Search — children', () => {
  it('shows the "Add child" button', async () => {
    renderSearch()
    await waitFor(() => expect(screen.getByText('Add child')).toBeInTheDocument())
  })

  it('adds a child row with default age 5 and a Child badge', async () => {
    renderSearch()
    await waitFor(() => expect(screen.getByText('Add child')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Add child'))
    expect(screen.getByText('Child 1')).toBeInTheDocument()
    expect(screen.getByText('Child')).toBeInTheDocument()
    const childRow = screen.getByText('Child 1').parentElement!
    expect(within(childRow).getByText('5')).toBeInTheDocument()
  })

  it('removes a child row when × is clicked', async () => {
    renderSearch()
    await waitFor(() => expect(screen.getByText('Add child')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Add child'))
    expect(screen.getByText('Child 1')).toBeInTheDocument()

    const childRow = screen.getByText('Child 1').parentElement!
    const buttons = within(childRow).getAllByRole('button')
    fireEvent.click(buttons.at(-1)!) // × is the last button in the row
    expect(screen.queryByText('Child 1')).not.toBeInTheDocument()
  })

  it('increments child age when + is clicked', async () => {
    renderSearch()
    await waitFor(() => expect(screen.getByText('Add child')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Add child'))
    const childRow = screen.getByText('Child 1').parentElement!
    fireEvent.click(within(childRow).getByText('+'))
    expect(within(childRow).getByText('6')).toBeInTheDocument()
  })

  it('decrements child age when − is clicked', async () => {
    renderSearch()
    await waitFor(() => expect(screen.getByText('Add child')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Add child'))
    const childRow = screen.getByText('Child 1').parentElement!
    fireEvent.click(within(childRow).getByText('−'))
    expect(within(childRow).getByText('4')).toBeInTheDocument()
  })

  it('child age + is disabled at maximum age 15', async () => {
    renderSearch()
    await waitFor(() => expect(screen.getByText('Add child')).toBeInTheDocument())
    // Profile child born 15 years ago → age 15
    const fifteenYearsAgo = new Date()
    fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15)
    mockFetch({
      ...defaultProfile,
      travel_children_birthdates: [fifteenYearsAgo.toISOString().split('T')[0]],
    })
    // Re-render with a 15-year-old pre-filled from profile
    const { unmount } = renderSearch()
    await waitFor(() => expect(screen.getByText('Child 1')).toBeInTheDocument())
    const childRow = screen.getByText('Child 1').parentElement!
    const plusBtn = within(childRow).getByText('+')
    expect(plusBtn).toBeDisabled()
    unmount()
  })

  it('shows Infant badge for a child aged under 2', async () => {
    // Use a profile child < 2 years old
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    mockFetch({
      ...defaultProfile,
      travel_children_birthdates: [oneYearAgo.toISOString().split('T')[0]],
    })
    renderSearch()
    await waitFor(() => expect(screen.getByText('Child 1')).toBeInTheDocument())
    expect(screen.getByText('Infant')).toBeInTheDocument()
  })

  it('hides Add child button when total passengers reach 9', async () => {
    renderSearch()
    await waitFor(() => expect(screen.getByText('Add child')).toBeInTheDocument())

    const adultsRow = screen.getByText('Adults').closest('div')!
    // Increment adults to 9
    for (let i = 0; i < 8; i++) {
      fireEvent.click(within(adultsRow).getByText('+'))
    }
    expect(screen.queryByText('Add child')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Profile pre-fill
// ---------------------------------------------------------------------------

describe('Search — profile pre-fill', () => {
  it('pre-fills adults count from profile', async () => {
    mockFetch({ ...defaultProfile, travel_adults: 3 })
    renderSearch()
    await waitFor(() => expect(screen.getByText('Adults')).toBeInTheDocument())
    const adultsRow = screen.getByText('Adults').closest('div')!
    expect(within(adultsRow).getByText('3')).toBeInTheDocument()
  })

  it('converts profile child birthdates to ages', async () => {
    const sevenYearsAgo = new Date()
    sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7)
    mockFetch({
      ...defaultProfile,
      travel_adults: 2,
      travel_children_birthdates: [sevenYearsAgo.toISOString().split('T')[0]],
    })
    renderSearch()
    await waitFor(() => expect(screen.getByText('Child 1')).toBeInTheDocument())
    expect(screen.getByText('Child')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })
})
