import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import CheapestTotal from './CheapestTotal'

describe('CheapestTotal', () => {
  it('renders nothing when both prices are null', () => {
    const { container } = render(
      <CheapestTotal outboundPrice={null} inboundPrice={null} currency="EUR" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows outbound and return prices with currency', () => {
    render(<CheapestTotal outboundPrice={29.99} inboundPrice={34.99} currency="EUR" />)
    expect(screen.getByText(/EUR 29.99/)).toBeInTheDocument()
    expect(screen.getByText(/EUR 34.99/)).toBeInTheDocument()
  })

  it('computes and displays the correct total', () => {
    render(<CheapestTotal outboundPrice={29.99} inboundPrice={34.99} currency="EUR" />)
    expect(screen.getByText('EUR 64.98')).toBeInTheDocument()
  })

  it('shows "Cheapest total" label', () => {
    render(<CheapestTotal outboundPrice={10} inboundPrice={20} currency="EUR" />)
    expect(screen.getByText(/cheapest total/i)).toBeInTheDocument()
  })

  it('renders with only outbound price', () => {
    render(<CheapestTotal outboundPrice={49.00} inboundPrice={null} currency="GBP" />)
    expect(screen.getByText(/Outbound:/)).toBeInTheDocument()
    expect(screen.queryByText(/Return:/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/GBP 49.00/)).toHaveLength(2) // breakdown + total
  })

  it('renders with only inbound price', () => {
    render(<CheapestTotal outboundPrice={null} inboundPrice={55.50} currency="EUR" />)
    expect(screen.queryByText(/Outbound:/)).not.toBeInTheDocument()
    expect(screen.getByText(/Return:/)).toBeInTheDocument()
    expect(screen.getAllByText(/EUR 55.50/)).toHaveLength(2) // breakdown + total
  })

  it('formats prices to two decimal places', () => {
    render(<CheapestTotal outboundPrice={10} inboundPrice={20} currency="EUR" />)
    expect(screen.getByText('EUR 30.00')).toBeInTheDocument()
  })

  it('shows "Cheapest total" label by default', () => {
    render(<CheapestTotal outboundPrice={10} inboundPrice={20} currency="EUR" />)
    expect(screen.getByText(/cheapest total/i)).toBeInTheDocument()
  })

  it('shows "Selected total" label when isCustomSelection is true', () => {
    render(<CheapestTotal outboundPrice={10} inboundPrice={20} currency="EUR" isCustomSelection />)
    expect(screen.getByText(/selected total/i)).toBeInTheDocument()
    expect(screen.queryByText(/cheapest total/i)).not.toBeInTheDocument()
  })

  it('multiplies total by passenger count for group total', () => {
    render(<CheapestTotal outboundPrice={50} inboundPrice={50} currency="EUR" passengers={3} />)
    expect(screen.getByText('EUR 300.00')).toBeInTheDocument()
  })

  it('shows "for N passengers" label when passengers > 1', () => {
    render(<CheapestTotal outboundPrice={50} inboundPrice={50} currency="EUR" passengers={2} />)
    expect(screen.getByText(/for 2 passengers/i)).toBeInTheDocument()
  })

  it('shows per-person subtotal when passengers > 1', () => {
    render(<CheapestTotal outboundPrice={50} inboundPrice={50} currency="EUR" passengers={2} />)
    expect(screen.getByText(/EUR 100.00 per person/)).toBeInTheDocument()
  })

  it('shows "per person" label (not for N passengers) when passengers is 1', () => {
    render(<CheapestTotal outboundPrice={50} inboundPrice={50} currency="EUR" passengers={1} />)
    expect(screen.getAllByText(/per person/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/for 1 passenger/i)).not.toBeInTheDocument()
  })
})
