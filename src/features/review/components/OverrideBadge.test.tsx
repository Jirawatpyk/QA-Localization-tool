import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { OverrideBadge } from '@/features/review/components/OverrideBadge'

describe('OverrideBadge', () => {
  it('[P0] should render when overrideCount > 0', () => {
    render(<OverrideBadge overrideCount={1} onClick={vi.fn()} />)
    expect(screen.getByTestId('decision-override-badge')).toBeInTheDocument()
    expect(screen.getByText('Override')).toBeInTheDocument()
  })

  it('[P0] should NOT render when overrideCount <= 0', () => {
    const { container } = render(<OverrideBadge overrideCount={0} onClick={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('[P1] should show count when overrideCount > 1', () => {
    render(<OverrideBadge overrideCount={3} onClick={vi.fn()} />)
    expect(screen.getByText('Override ×3')).toBeInTheDocument()
  })

  it('[P1] should have correct aria-label', () => {
    render(<OverrideBadge overrideCount={2} onClick={vi.fn()} />)
    expect(screen.getByTestId('decision-override-badge')).toHaveAttribute(
      'aria-label',
      'Decision overridden 2 times, click to view history',
    )
  })

  it('[P1] should call onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<OverrideBadge overrideCount={1} onClick={onClick} />)

    await user.click(screen.getByTestId('decision-override-badge'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('[P2] should use singular "time" for count=1', () => {
    render(<OverrideBadge overrideCount={1} onClick={vi.fn()} />)
    expect(screen.getByTestId('decision-override-badge')).toHaveAttribute(
      'aria-label',
      'Decision overridden 1 time, click to view history',
    )
  })
})
