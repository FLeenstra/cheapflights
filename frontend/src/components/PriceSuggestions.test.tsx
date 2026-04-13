import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import PriceSuggestions, { type Suggestion } from './PriceSuggestions'

function makeSuggestions(selectedOffset = 0, basePrice = 100): Suggestion[] {
  return Array.from({ length: 7 }, (_, i) => {
    const offset = i - 3
    const price = basePrice + offset * 10
    return {
      offset,
      outbound_date: `2025-06-${String(1 + offset).padStart(2, '0')}`,
      inbound_date: `2025-06-${String(8 + offset).padStart(2, '0')}`,
      outbound_cheapest: price / 2,
      inbound_cheapest: price / 2,
      total: price,
      is_selected: offset === selectedOffset,
    }
  })
}

describe('PriceSuggestions', () => {
  it('renders 7 suggestion cards', () => {
    render(
      <PriceSuggestions
        suggestions={makeSuggestions()}
        currency="EUR"
        onSelect={vi.fn()}
      />
    )
    // 7 buttons: -3d, -2d, -1d, Selected, +1d, +2d, +3d
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(7)
  })

  it('shows offset labels', () => {
    render(
      <PriceSuggestions
        suggestions={makeSuggestions()}
        currency="EUR"
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('-3d')).toBeInTheDocument()
    expect(screen.getByText('Selected')).toBeInTheDocument()
    expect(screen.getByText('+3d')).toBeInTheDocument()
  })

  it('shows total prices', () => {
    render(
      <PriceSuggestions
        suggestions={makeSuggestions(0, 100)}
        currency="EUR"
        onSelect={vi.fn()}
      />
    )
    // offset=0 → price 100, offset=+3 → 130
    expect(screen.getByText(/100/)).toBeInTheDocument()
  })

  it('calls onSelect with correct dates when a non-selected card is clicked', () => {
    const onSelect = vi.fn()
    const suggestions = makeSuggestions(0, 100)
    render(
      <PriceSuggestions
        suggestions={suggestions}
        currency="EUR"
        onSelect={onSelect}
      />
    )
    // Find the +1d button (offset 1)
    const plusOneBtn = screen.getByText('+1d').closest('button')!
    fireEvent.click(plusOneBtn)
    expect(onSelect).toHaveBeenCalledOnce()
    const [outDate, inDate] = onSelect.mock.calls[0]
    expect(outDate).toBe('2025-06-02')
    expect(inDate).toBe('2025-06-09')
  })

  it('does not call onSelect when selected card is clicked', () => {
    const onSelect = vi.fn()
    render(
      <PriceSuggestions
        suggestions={makeSuggestions(0)}
        currency="EUR"
        onSelect={onSelect}
      />
    )
    const selectedBtn = screen.getByText('Selected').closest('button')!
    fireEvent.click(selectedBtn)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows "Best price window" badge when selected is cheapest', () => {
    // Make selected (offset 0) the cheapest by giving others higher prices
    const suggestions: Suggestion[] = Array.from({ length: 7 }, (_, i) => {
      const offset = i - 3
      return {
        offset,
        outbound_date: `2025-06-${String(1 + offset).padStart(2, '0')}`,
        inbound_date: `2025-06-${String(8 + offset).padStart(2, '0')}`,
        outbound_cheapest: 50,
        inbound_cheapest: 50,
        total: offset === 0 ? 80 : 120,
        is_selected: offset === 0,
      }
    })
    render(
      <PriceSuggestions suggestions={suggestions} currency="EUR" onSelect={vi.fn()} />
    )
    expect(screen.getByText('Best price window')).toBeInTheDocument()
  })

  it('does not show "Best price window" when a cheaper option exists', () => {
    const suggestions: Suggestion[] = Array.from({ length: 7 }, (_, i) => {
      const offset = i - 3
      return {
        offset,
        outbound_date: `2025-06-${String(1 + offset).padStart(2, '0')}`,
        inbound_date: `2025-06-${String(8 + offset).padStart(2, '0')}`,
        outbound_cheapest: 50,
        inbound_cheapest: 50,
        total: offset === 0 ? 120 : 80, // others are cheaper
        is_selected: offset === 0,
      }
    })
    render(
      <PriceSuggestions suggestions={suggestions} currency="EUR" onSelect={vi.fn()} />
    )
    expect(screen.queryByText('Best price window')).not.toBeInTheDocument()
  })

  it('shows savings for cheaper alternatives', () => {
    const suggestions: Suggestion[] = Array.from({ length: 7 }, (_, i) => {
      const offset = i - 3
      return {
        offset,
        outbound_date: `2025-06-${String(1 + offset).padStart(2, '0')}`,
        inbound_date: `2025-06-${String(8 + offset).padStart(2, '0')}`,
        outbound_cheapest: 60,
        inbound_cheapest: 60,
        total: offset === 0 ? 120 : 100,
        is_selected: offset === 0,
      }
    })
    render(
      <PriceSuggestions suggestions={suggestions} currency="EUR" onSelect={vi.fn()} />
    )
    // Saving = 120 - 100 = 20, shown as −EUR 20
    const savingEls = screen.getAllByText(/−EUR 20/)
    expect(savingEls.length).toBeGreaterThan(0)
  })
})
