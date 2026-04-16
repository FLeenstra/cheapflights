import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
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
    expect(screen.getByText('FR1234')).toBeInTheDocument()
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

  it('links each flight card to the Ryanair booking page', () => {
    render(<FlightList {...baseProps} flights={[FLIGHT]} error={null} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', expect.stringContaining('ryanair.com'))
    expect(link).toHaveAttribute('href', expect.stringContaining('DUB'))
    expect(link).toHaveAttribute('href', expect.stringContaining('BCN'))
    expect(link).toHaveAttribute('href', expect.stringContaining('2025-06-01'))
    expect(link).toHaveAttribute('target', '_blank')
  })
})
