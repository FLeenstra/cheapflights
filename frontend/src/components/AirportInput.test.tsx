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
    expect(screen.getByText('Dublin')).toBeInTheDocument()
    expect(screen.getByText('DUB')).toBeInTheDocument()
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
    fireEvent.change(input, { target: { value: 'Dub' } })
    const option = screen.getByText('Dublin')
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
    fireEvent.change(input, { target: { value: 'Dub' } })
    expect(screen.getByText('Dublin')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('Dublin')).not.toBeInTheDocument()
  })

  it('displays selected airport value when closed', () => {
    const selected = { iata: 'DUB', city: 'Dublin', country: 'Ireland' }
    render(<AirportInput {...baseProps} value={selected} />)
    const input = screen.getByDisplayValue('Dublin (DUB)')
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

  it('pre-fills query with city name when a value is already selected and the input is focused', () => {
    const selected = { iata: 'DUB', city: 'Dublin', country: 'Ireland' }
    render(<AirportInput {...baseProps} value={selected} />)
    const input = screen.getByDisplayValue('Dublin (DUB)')
    fireEvent.focus(input)
    expect((input as HTMLInputElement).value).toBe('Dublin')
  })

  it('shows matching dropdown results when focusing a pre-filled input', () => {
    const selected = { iata: 'DUB', city: 'Dublin', country: 'Ireland' }
    render(<AirportInput {...baseProps} value={selected} />)
    const input = screen.getByDisplayValue('Dublin (DUB)')
    fireEvent.focus(input)
    expect(screen.getByText('Dublin')).toBeInTheDocument()
    expect(screen.getByText('DUB')).toBeInTheDocument()
  })

  it('leaves query empty when focusing an input with no value', () => {
    render(<AirportInput {...baseProps} value={null} />)
    const input = screen.getByPlaceholderText('e.g. Dublin')
    fireEvent.focus(input)
    expect((input as HTMLInputElement).value).toBe('')
  })
})
