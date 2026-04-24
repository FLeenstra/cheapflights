import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AirportInput from './AirportInput'

const baseProps = {
  label: 'From',
  placeholder: 'e.g. Dublin',
  value: null,
  onChange: vi.fn(),
}

describe('AirportInput', () => {
  it('renders label and input', () => {
    render(<AirportInput {...baseProps} />)
    expect(screen.getByText('From')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. Dublin')).toBeInTheDocument()
  })

  it('shows dropdown when user types a matching city', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Dub' } })
    // Multiple airports share city name "Dublin" — verify by unique IATA badge
    expect(screen.getByText('DUB')).toBeInTheDocument()
    expect(screen.getAllByText('Dublin').length).toBeGreaterThan(0)
  })

  it('shows no-results message for unknown query', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Zzzzzz' } })
    expect(screen.getByText(/no airports found/i)).toBeInTheDocument()
  })

  it('calls onChange when an airport is selected by click', () => {
    const onChange = vi.fn()
    render(<AirportInput {...baseProps} onChange={onChange} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'DUB' } })
    const option = screen.getByText('DUB')
    fireEvent.mouseDown(option)
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0][0]).toMatchObject({ iata: 'DUB' })
  })

  it('selects highlighted option on Enter key', () => {
    const onChange = vi.fn()
    render(<AirportInput {...baseProps} onChange={onChange} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Dub' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('navigates options with ArrowDown/ArrowUp', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'a' } })
    // Should not throw
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
  })

  it('closes dropdown on Escape key', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'DUB' } })
    expect(screen.getByText('DUB')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('DUB')).not.toBeInTheDocument()
  })

  it('displays selected airport value when closed', () => {
    const selected = { iata: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'Ireland', countryCode: 'IE' }
    render(<AirportInput {...baseProps} value={selected} />)
    const input = screen.getByDisplayValue('Dublin Airport (DUB)')
    expect(input).toBeInTheDocument()
  })

  it('filters results to allowedIata when provided', () => {
    render(<AirportInput {...baseProps} allowedIata={new Set(['BCN'])} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'a' } })
    expect(screen.queryByText('Dublin')).not.toBeInTheDocument()
    expect(screen.getByText('Barcelona')).toBeInTheDocument()
  })

  it('shows no results when query matches airport not in allowedIata', () => {
    render(<AirportInput {...baseProps} allowedIata={new Set(['BCN'])} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Dublin' } })
    expect(screen.queryByText('Dublin')).not.toBeInTheDocument()
  })

  it('shows loading spinner when loading prop is true', () => {
    const { container } = render(<AirportInput {...baseProps} loading={true} />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('shows full airport name in input when an airport is selected', () => {
    const selected = { iata: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'Ireland', countryCode: 'IE' }
    render(<AirportInput {...baseProps} value={selected} />)
    expect(screen.getByDisplayValue('Dublin Airport (DUB)')).toBeInTheDocument()
  })

  it('falls back to city name in input when airport has no name', () => {
    const selected = { iata: 'DUB', name: '', city: 'Dublin', country: 'Ireland', countryCode: 'IE' }
    render(<AirportInput {...baseProps} value={selected} />)
    expect(screen.getByDisplayValue('Dublin (DUB)')).toBeInTheDocument()
  })

  it('shows airport name below city in dropdown results', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'DUB' } })
    expect(screen.getByText('Dublin Airport')).toBeInTheDocument()
  })

  it('matches airports by their name as well as city', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Schiphol' } })
    expect(screen.getByText('AMS')).toBeInTheDocument()
    expect(screen.getByText('Amsterdam Airport Schiphol')).toBeInTheDocument()
  })

  it('shows localised country name when countryCode is present', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'AMS' } })
    // In English locale Intl.DisplayNames returns 'Netherlands' for 'NL'
    expect(screen.getByText('Netherlands')).toBeInTheDocument()
  })

  it('pre-fills query with city name when a value is already selected and the input is focused', () => {
    const selected = { iata: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'Ireland', countryCode: 'IE' }
    render(<AirportInput {...baseProps} value={selected} />)
    const input = screen.getByDisplayValue('Dublin Airport (DUB)')
    fireEvent.focus(input)
    expect((input as HTMLInputElement).value).toBe('Dublin')
  })

  it('shows matching dropdown results when focusing a pre-filled input', () => {
    const selected = { iata: 'DUB', name: 'Dublin Airport', city: 'Dublin', country: 'Ireland', countryCode: 'IE' }
    render(<AirportInput {...baseProps} value={selected} />)
    const input = screen.getByDisplayValue('Dublin Airport (DUB)')
    fireEvent.focus(input)
    // Multiple airports share city "Dublin" — verify by unique IATA badge
    expect(screen.getByText('DUB')).toBeInTheDocument()
    expect(screen.getAllByText('Dublin').length).toBeGreaterThan(0)
  })

  it('leaves query empty when focusing an input with no value', () => {
    render(<AirportInput {...baseProps} value={null} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    expect((input as HTMLInputElement).value).toBe('')
  })
})

describe('AirportInput — country-prefix filtering', () => {
  it('shows a country suggestion with arrow indicator when query matches a country name', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Nether' } })
    // Arrow → only appears on country suggestion items, not airport items
    expect(screen.getAllByText('→').length).toBeGreaterThan(0)
    expect(screen.getAllByText('🇳🇱').length).toBeGreaterThan(0)
  })

  it('clicking a country suggestion sets the query to "Country: "', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Netherlands' } })
    // The first option in the list is the Netherlands country suggestion
    fireEvent.mouseDown(screen.getAllByRole('option')[0])
    expect((input as HTMLInputElement).value).toBe('Netherlands: ')
  })

  it('Enter on a highlighted country suggestion sets the query to "Country: "', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Nether' } })
    // highlighted=0, which is the Netherlands country suggestion
    fireEvent.keyDown(input, { key: 'Enter' })
    expect((input as HTMLInputElement).value).toBe('Netherlands: ')
  })

  it('shows airports in the country after a colon with no airport query', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Netherlands: ' } })
    expect(screen.getByText('AMS')).toBeInTheDocument()
  })

  it('further filters airports within the country when typing after the colon', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Netherlands: AMS' } })
    expect(screen.getByText('AMS')).toBeInTheDocument()
    expect(screen.queryByText('DUB')).not.toBeInTheDocument()
  })

  it('shows no-results message when no airports match within the country', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Netherlands: Zzzzzz' } })
    expect(screen.getByText(/no airports found/i)).toBeInTheDocument()
  })

  it('selecting an airport in country-filter mode calls onChange', () => {
    const onChange = vi.fn()
    render(<AirportInput {...baseProps} onChange={onChange} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Netherlands: AMS' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ iata: 'AMS' }))
  })

  it('clicking the country flag on an airport item switches to country-filter mode', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'DUB' } })
    // DUB is in Ireland (IE) — flag 🇮🇪 appears on the airport item
    const flag = screen.getByText('🇮🇪')
    fireEvent.mouseDown(flag)
    expect((input as HTMLInputElement).value).toBe('Ireland: ')
  })

  it('matches country with unaccented input when the localized name has diacritics', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    // "Côte d'Ivoire" in English locale — typing without the accent should still match
    fireEvent.change(input, { target: { value: 'Cote' } })
    expect(screen.getByText('🇨🇮')).toBeInTheDocument()
  })

  it('still allows direct airport search without a country prefix', () => {
    render(<AirportInput {...baseProps} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Amsterdam' } })
    expect(screen.getByText('AMS')).toBeInTheDocument()
  })
})
