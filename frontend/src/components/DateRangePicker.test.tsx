import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DateRangePicker from './DateRangePicker'

const baseProps = {
  from: undefined,
  to: undefined,
  onChange: vi.fn(),
}

describe('DateRangePicker', () => {
  it('renders the trigger button with placeholder text', () => {
    render(<DateRangePicker {...baseProps} />)
    expect(screen.getByText('Departure date')).toBeInTheDocument()
    expect(screen.getByText('Return date')).toBeInTheDocument()
  })

  it('renders the "Travel dates" label', () => {
    render(<DateRangePicker {...baseProps} />)
    expect(screen.getByText('Travel dates')).toBeInTheDocument()
  })

  it('opens the calendar when trigger is clicked', () => {
    render(<DateRangePicker {...baseProps} />)
    const trigger = screen.getByRole('button')
    fireEvent.click(trigger)
    // DayPicker renders a grid with role="grid"
    expect(screen.getByRole('grid')).toBeInTheDocument()
  })

  it('toggles calendar closed on second click', () => {
    render(<DateRangePicker {...baseProps} />)
    const trigger = screen.getByRole('button')
    fireEvent.click(trigger)
    expect(screen.getByRole('grid')).toBeInTheDocument()
    fireEvent.click(trigger)
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
  })

  it('shows formatted dates when range is selected', () => {
    const from = new Date('2025-06-01T12:00:00')
    const to = new Date('2025-06-08T12:00:00')
    render(<DateRangePicker from={from} to={to} onChange={vi.fn()} />)
    // Both dates should appear somewhere in the trigger area
    expect(screen.getByText(/1 Jun 2025/)).toBeInTheDocument()
    expect(screen.getByText(/8 Jun 2025/)).toBeInTheDocument()
  })

  it('shows duration badge when range is selected', () => {
    const from = new Date('2025-06-01T12:00:00')
    const to = new Date('2025-06-08T12:00:00')
    render(<DateRangePicker from={from} to={to} onChange={vi.fn()} />)
    expect(screen.getByText('7d')).toBeInTheDocument()
  })

  it('calls onChange with empty range when Clear is clicked', () => {
    const onChange = vi.fn()
    const from = new Date('2025-06-01T12:00:00')
    const to = new Date('2025-06-08T12:00:00')
    render(<DateRangePicker from={from} to={to} onChange={onChange} />)
    // Open calendar to expose Clear button
    const trigger = screen.getByRole('button', { name: /jun/i })
    fireEvent.click(trigger)
    const clearBtn = screen.getByRole('button', { name: /clear/i })
    fireEvent.click(clearBtn)
    expect(onChange).toHaveBeenCalledWith({ from: undefined, to: undefined })
  })
})
