import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FlightList, { type Flight } from './FlightList'

const FLIGHT: Flight = {
  flight_number: 'FR1234',
  price: 79.99,
  currency: 'EUR',
  origin: 'DUB',
  origin_full: 'Dublin, Ireland',
  destination: 'BCN',
  destination_full: 'Barcelona, Spain',
  departure_time: '2025-06-01T10:00:00',
  airline: 'Ryanair',
  airline_iata: 'FR',
}

const baseProps = {
  label: 'Outbound',
  from: 'Dublin',
  to: 'Barcelona',
  date: '2025-06-01',
}

describe('FlightList', () => {
  it('renders error state', () => {
    render(<FlightList {...baseProps} flights={[]} error="Network error" />)
    expect(screen.getByText(/could not load outbound flights/i)).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('renders empty state when no flights and no error', () => {
    render(<FlightList {...baseProps} flights={[]} error={null} />)
    expect(screen.getByText(/no outbound flights on this date/i)).toBeInTheDocument()
  })

  it('renders flight cards', () => {
    render(<FlightList {...baseProps} flights={[FLIGHT]} error={null} />)
    expect(screen.getByText(/FR1234/)).toBeInTheDocument()
    expect(screen.getAllByText(/79/).length).toBeGreaterThan(0)
  })

  it('shows "Best price" badge on cheapest flight', () => {
    const second: Flight = { ...FLIGHT, flight_number: 'FR5678', price: 120 }
    render(<FlightList {...baseProps} flights={[FLIGHT, second]} error={null} />)
    expect(screen.getByText('Best price')).toBeInTheDocument()
  })

  it('shows cheapest price in header', () => {
    render(<FlightList {...baseProps} flights={[FLIGHT]} error={null} />)
    expect(screen.getAllByText(/79.99/).length).toBeGreaterThan(0)
  })

  it('shows flight count in header', () => {
    const second: Flight = { ...FLIGHT, flight_number: 'FR5678', price: 120 }
    render(<FlightList {...baseProps} flights={[FLIGHT, second]} error={null} />)
    expect(screen.getByText(/2 flights/i)).toBeInTheDocument()
  })

  it('shows route in header', () => {
    render(<FlightList {...baseProps} flights={[]} error={null} />)
    expect(screen.getByText('Dublin')).toBeInTheDocument()
    expect(screen.getByText('Barcelona')).toBeInTheDocument()
  })

  it('shows label in header', () => {
    render(<FlightList {...baseProps} flights={[]} error={null} />)
    expect(screen.getByText('Outbound')).toBeInTheDocument()
  })

  it('shows airline logo image for each flight card', () => {
    const second: Flight = { ...FLIGHT, flight_number: 'FR5678', price: 120 }
    render(<FlightList {...baseProps} flights={[FLIGHT, second]} error={null} />)
    const logos = screen.getAllByRole('img', { name: 'Ryanair' })
    expect(logos).toHaveLength(2)
    logos.forEach(logo =>
      expect(logo).toHaveAttribute('src', 'https://www.gstatic.com/flights/airline_logos/70px/FR.png')
    )
  })

  it('shows a One-way booking button per flight', () => {
    render(<FlightList {...baseProps} flights={[FLIGHT]} error={null} />)
    const link = screen.getByRole('link', { name: /one-way/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('google.com/flights'))
    expect(link).toHaveAttribute('href', expect.stringContaining('DUB.BCN'))
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('shows a Return booking button when outboundDate and inboundDate are provided', () => {
    render(
      <FlightList
        {...baseProps}
        flights={[FLIGHT]}
        error={null}
        outboundDate="2025-06-01"
        inboundDate="2025-06-08"
      />
    )
    const link = screen.getByRole('link', { name: /return/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('google.com/flights'))
    expect(link).toHaveAttribute('href', expect.stringContaining('DUB.BCN.2025-06-01'))
    expect(link).toHaveAttribute('href', expect.stringContaining('BCN.DUB.2025-06-08'))
  })

  it('does not show a Return button when no paired dates are given', () => {
    render(<FlightList {...baseProps} flights={[FLIGHT]} error={null} />)
    expect(screen.queryByRole('link', { name: /return/i })).not.toBeInTheDocument()
  })

  it('calls onSelect when a flight card is clicked', async () => {
    const onSelect = vi.fn()
    render(<FlightList {...baseProps} flights={[FLIGHT]} error={null} onSelect={onSelect} />)
    screen.getByText(/FR1234/).click()
    expect(onSelect).toHaveBeenCalledWith(FLIGHT)
  })

  it('highlights the selected flight card', () => {
    const { container } = render(
      <FlightList {...baseProps} flights={[FLIGHT]} error={null} selectedFlight={FLIGHT} />
    )
    expect(container.firstChild).toBeDefined()
    expect(screen.getByText(/FR1234/).closest('div[class*="ring-2"]')).toBeTruthy()
  })
})
