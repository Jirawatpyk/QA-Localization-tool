import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ModeCard } from './ModeCard'

const defaultProps = {
  title: 'Economy',
  layers: 'L1 + L2',
  estimatedTime: '~2 min',
  costPerFile: '$0.02',
  description: 'Rule-based checks plus AI screening. Fast and cost-effective.',
  selected: false,
  onSelect: vi.fn(),
}

describe('ModeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render title, layers, and cost information', () => {
    render(<ModeCard {...defaultProps} />)

    expect(screen.getByText('Economy')).toBeTruthy()
    expect(screen.getByText('L1 + L2')).toBeTruthy()
    expect(screen.getByText('~2 min')).toBeTruthy()
    expect(screen.getByText('$0.02')).toBeTruthy()
    expect(
      screen.getByText('Rule-based checks plus AI screening. Fast and cost-effective.'),
    ).toBeTruthy()
  })

  it('should show badge when badge prop provided', () => {
    render(<ModeCard {...defaultProps} badge="Recommended" />)

    expect(screen.getByText('Recommended')).toBeTruthy()
  })

  it('should not show badge when badge prop is undefined', () => {
    render(<ModeCard {...defaultProps} />)

    expect(screen.queryByText('Recommended')).toBeNull()
  })

  it('should apply selected styling when selected is true', () => {
    const { container } = render(<ModeCard {...defaultProps} selected={true} />)

    // The card element should have the selected/checked state
    const card = screen.getByRole('radio')
    expect(card.getAttribute('aria-checked')).toBe('true')

    // Selected card should have a distinct border or ring style
    // (exact class depends on implementation, but the element should exist)
    const cardElement = container.querySelector('[data-selected="true"]')
    expect(cardElement).toBeTruthy()
  })

  it('should call onSelect when card clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<ModeCard {...defaultProps} onSelect={onSelect} />)

    const card = screen.getByRole('radio')
    await user.click(card)

    expect(onSelect).toHaveBeenCalledOnce()
  })

  // ── M7: Keyboard activation (WCAG) ──

  it('should call onSelect when Enter key is pressed', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<ModeCard {...defaultProps} onSelect={onSelect} />)

    const card = screen.getByRole('radio')
    card.focus()
    await user.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('should call onSelect when Space key is pressed', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<ModeCard {...defaultProps} onSelect={onSelect} />)

    const card = screen.getByRole('radio')
    card.focus()
    await user.keyboard(' ')

    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('should have proper aria attributes for accessibility (aria-checked)', () => {
    const { rerender } = render(<ModeCard {...defaultProps} selected={false} />)

    const card = screen.getByRole('radio')
    expect(card.getAttribute('aria-checked')).toBe('false')
    expect(card.getAttribute('tabindex')).not.toBeNull()

    // Re-render with selected=true
    rerender(<ModeCard {...defaultProps} selected={true} />)
    expect(screen.getByRole('radio').getAttribute('aria-checked')).toBe('true')
  })
})
