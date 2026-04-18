import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SavedSearches from './SavedSearches'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const baseRoute = {
  id: 'route-1',
  origin: 'DUB',
  destination: 'BCN',
  date_from: '2025-08-01',
  date_to: '2025-08-08',
  passengers: 1,
  adults_count: 1,
  children_ages: [],
  alert_price: null,
  notify_available: false,
  is_active: true,
  created_at: '2025-07-01T10:00:00Z',
  goal_reached_at: null,
}

function mockFetchRoutes(routes = [baseRoute]) {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => routes,
  } as Response)
}

function renderSavedSearches() {
  return render(<MemoryRouter><SavedSearches /></MemoryRouter>)
}

beforeEach(() => {
  vi.restoreAllMocks()
  mockNavigate.mockReset()
})

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe('SavedSearches — rendering', () => {
  it('shows route origin and destination', async () => {
    mockFetchRoutes()
    renderSavedSearches()
    await waitFor(() => expect(screen.getByText('DUB')).toBeInTheDocument())
    expect(screen.getByText('BCN')).toBeInTheDocument()
  })

  it('shows date range', async () => {
    mockFetchRoutes()
    renderSavedSearches()
    await waitFor(() => expect(screen.getByText(/2025-08-01/)).toBeInTheDocument())
  })

  it('shows empty state when no routes', async () => {
    mockFetchRoutes([])
    renderSavedSearches()
    await waitFor(() => expect(screen.getByText('No saved searches yet.')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Passenger summary
// ---------------------------------------------------------------------------

describe('SavedSearches — passenger summary', () => {
  it('hides passenger info for 1 adult with no children', async () => {
    mockFetchRoutes([{ ...baseRoute, adults_count: 1, children_ages: [], passengers: 1 }])
    renderSavedSearches()
    await waitFor(() => expect(screen.getByText('DUB')).toBeInTheDocument())
    expect(screen.queryByText(/adult/)).not.toBeInTheDocument()
  })

  it('shows "2 adults" for 2 adults with no children', async () => {
    mockFetchRoutes([{ ...baseRoute, adults_count: 2, children_ages: [], passengers: 2 }])
    renderSavedSearches()
    await waitFor(() => expect(screen.getByText(/2 adults/)).toBeInTheDocument())
  })

  it('shows child age in passenger summary', async () => {
    mockFetchRoutes([{ ...baseRoute, adults_count: 2, children_ages: [7], passengers: 3 }])
    renderSavedSearches()
    await waitFor(() => expect(screen.getByText(/1 child \(age 7\)/)).toBeInTheDocument())
  })

  it('shows infant label for child under 2', async () => {
    mockFetchRoutes([{ ...baseRoute, adults_count: 1, children_ages: [1], passengers: 2 }])
    renderSavedSearches()
    await waitFor(() => expect(screen.getByText(/1 infant \(age 1\)/)).toBeInTheDocument())
  })

  it('shows multiple children summary', async () => {
    mockFetchRoutes([{ ...baseRoute, adults_count: 2, children_ages: [3, 8], passengers: 4 }])
    renderSavedSearches()
    await waitFor(() => expect(screen.getByText(/2 children \(ages 3, 8\)/)).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Navigation — runSearch passes adultsCount and childrenAges
// ---------------------------------------------------------------------------

describe('SavedSearches — runSearch navigation', () => {
  it('passes adultsCount and childrenAges to runSearch state', async () => {
    mockFetchRoutes([{ ...baseRoute, adults_count: 2, children_ages: [5], passengers: 3 }])
    renderSavedSearches()
    await waitFor(() => expect(screen.getByText('DUB')).toBeInTheDocument())
    fireEvent.click(screen.getByText('DUB').closest('button')!)
    expect(mockNavigate).toHaveBeenCalledWith('/search', expect.objectContaining({
      state: expect.objectContaining({
        runSearch: expect.objectContaining({ adultsCount: 2, childrenAges: [5] }),
      }),
    }))
  })

  it('passes adultsCount and childrenAges to editRoute state', async () => {
    mockFetchRoutes([{ ...baseRoute, adults_count: 2, children_ages: [7], passengers: 3 }])
    renderSavedSearches()
    await waitFor(() => expect(screen.getByText('DUB')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/search', expect.objectContaining({
      state: expect.objectContaining({
        editRoute: expect.objectContaining({ adultsCount: 2, childrenAges: [7] }),
      }),
    }))
  })
})

// ---------------------------------------------------------------------------
// Alert badges
// ---------------------------------------------------------------------------

describe('SavedSearches — alert badges', () => {
  it('shows Max price badge when alert_price is set', async () => {
    mockFetchRoutes([{ ...baseRoute, alert_price: 99 }])
    renderSavedSearches()
    await waitFor(() => expect(screen.getByText('Max €99')).toBeInTheDocument())
  })

  it('shows Availability badge when notify_available is true', async () => {
    mockFetchRoutes([{ ...baseRoute, notify_available: true }])
    renderSavedSearches()
    // filter bar + route card badge both contain "Availability"
    await waitFor(() => expect(screen.getAllByText('Availability').length).toBeGreaterThanOrEqual(2))
  })

  it('shows No alert badge when neither alert is set', async () => {
    mockFetchRoutes()
    renderSavedSearches()
    // filter bar + route card badge both contain "No alert"
    await waitFor(() => expect(screen.getAllByText('No alert').length).toBeGreaterThanOrEqual(2))
  })
})

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe('SavedSearches — delete', () => {
  it('removes route from the list after delete', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [baseRoute] } as Response)
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) } as Response)
    renderSavedSearches()
    await waitFor(() => expect(screen.getByText('DUB')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(screen.queryByText('DUB')).not.toBeInTheDocument())
  })
})
