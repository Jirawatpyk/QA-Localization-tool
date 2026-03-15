import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BulkActionBar } from '@/features/review/components/BulkActionBar'

// Mock useReducedMotion
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}))

describe('BulkActionBar', () => {
  const defaultProps = {
    selectedCount: 3,
    onBulkAccept: vi.fn(),
    onBulkReject: vi.fn(),
    onClearSelection: vi.fn(),
    isBulkInFlight: false,
  }

  it('[P0] should render selection count and action buttons', () => {
    render(<BulkActionBar {...defaultProps} />)

    expect(screen.getByText('3 findings selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /bulk accept/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /bulk reject/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument()
  })

  it('[P0] should have role="toolbar" and aria-label', () => {
    render(<BulkActionBar {...defaultProps} />)

    const toolbar = screen.getByRole('toolbar')
    expect(toolbar).toHaveAttribute('aria-label', 'Bulk actions')
  })

  it('[P1] should disable buttons when isBulkInFlight', () => {
    render(<BulkActionBar {...defaultProps} isBulkInFlight={true} />)

    expect(screen.getByRole('button', { name: /bulk accept/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /bulk reject/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeDisabled()
  })

  it('[P1] should call onBulkAccept when Accept clicked', async () => {
    const user = userEvent.setup()
    const onBulkAccept = vi.fn()
    render(<BulkActionBar {...defaultProps} onBulkAccept={onBulkAccept} />)

    await user.click(screen.getByRole('button', { name: /bulk accept/i }))
    expect(onBulkAccept).toHaveBeenCalledTimes(1)
  })

  it('[P1] should call onBulkReject when Reject clicked', async () => {
    const user = userEvent.setup()
    const onBulkReject = vi.fn()
    render(<BulkActionBar {...defaultProps} onBulkReject={onBulkReject} />)

    await user.click(screen.getByRole('button', { name: /bulk reject/i }))
    expect(onBulkReject).toHaveBeenCalledTimes(1)
  })

  it('[P1] should show singular "finding" for count=1', () => {
    render(<BulkActionBar {...defaultProps} selectedCount={1} />)
    expect(screen.getByText('1 finding selected')).toBeInTheDocument()
  })

  it('[P2] should show spinner on active accept button during flight', () => {
    render(<BulkActionBar {...defaultProps} isBulkInFlight={true} activeAction="accept" />)
    // Spinner is a Loader2 icon inside the accept button
    const acceptBtn = screen.getByRole('button', { name: /bulk accept/i })
    expect(acceptBtn.querySelector('.animate-spin')).toBeInTheDocument()
  })
})
