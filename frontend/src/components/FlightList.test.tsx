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

  it('shows Ryanair logo on each flight card', () => {
    const second: Flight = { ...FLIGHT, flight_number: 'FR5678', price: 120 }
    render(<FlightList {...baseProps} flights={[FLIGHT, second]} error={null} />)
    const logos = screen.getAllByAltText('Ryanair')
    expect(logos).toHaveLength(2)
    logos.forEach(logo => expect(logo).toHaveAttribute('src', '/ryanair.png'))
  })

  it('shows a Single booking button per flight', () => {
    render(<FlightList {...baseProps} flights={[FLIGHT]} error={null} />)
    const link = screen.getByRole('link', { name: 'Single' })
    expect(link).toHaveAttribute('href', expect.stringContaining('ryanair.com'))
    expect(link).toHaveAttribute('href', expect.stringContaining('isReturn=false'))
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
    const link = screen.getByRole('link', { name: 'Return' })
    expect(link).toHaveAttribute('href', expect.stringContaining('isReturn=true'))
    expect(link).toHaveAttribute('href', expect.stringContaining('dateOut=2025-06-01'))
    expect(link).toHaveAttribute('href', expect.stringContaining('dateIn=2025-06-08'))
  })

  it('does not show a Return button when no paired dates are given', () => {
    render(<FlightList {...baseProps} flights={[FLIGHT]} error={null} />)
    expect(screen.queryByRole('link', { name: 'Return' })).not.toBeInTheDocument()
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

  it('sets adults param to passenger count in Single deeplink', () => {
    render(<FlightList {...baseProps} flights={[FLIGHT]} error={null} passengers={3} />)
    const link = screen.getByRole('link', { name: 'Single' })
    expect(link).toHaveAttribute('href', expect.stringContaining('adults=3'))
  })

  it('sets adults param to passenger count in Return deeplink', () => {
    render(
      <FlightList
        {...baseProps}
        flights={[FLIGHT]}
        error={null}
        outboundDate="2025-06-01"
        inboundDate="2025-06-08"
        passengers={2}
      />
    )
    const link = screen.getByRole('link', { name: 'Return' })
    expect(link).toHaveAttribute('href', expect.stringContaining('adults=2'))
  })

  it('defaults to adults=1 when passengers is not provided', () => {
    render(<FlightList {...baseProps} flights={[FLIGHT]} error={null} />)
    const link = screen.getByRole('link', { name: 'Single' })
    expect(link).toHaveAttribute('href', expect.stringContaining('adults=1'))
  })
})
