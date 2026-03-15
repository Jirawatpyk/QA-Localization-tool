import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { BulkConfirmDialog } from '@/features/review/components/BulkConfirmDialog'
import { buildFinding } from '@/test/factories'
import type { Finding } from '@/types/finding'

function makeFinding(overrides: Partial<Finding>): Finding {
  return buildFinding(overrides)
}

describe('BulkConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    action: 'reject' as const,
    selectedFindings: [
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'major' }),
      makeFinding({ severity: 'major' }),
      makeFinding({ severity: 'major' }),
      makeFinding({ severity: 'minor' }),
    ],
    onConfirm: vi.fn(),
  }

  it('[P0] should render dialog title with count and action', () => {
    render(<BulkConfirmDialog {...defaultProps} />)
    expect(screen.getByRole('heading')).toHaveTextContent('Reject 6 findings?')
  })

  it('[P0] should show severity breakdown', () => {
    render(<BulkConfirmDialog {...defaultProps} />)
    const dialog = screen.getByTestId('bulk-confirm-dialog')
    expect(dialog).toHaveTextContent('Critical')
    expect(dialog).toHaveTextContent('2') // 2 critical
    expect(dialog).toHaveTextContent('Major')
    expect(dialog).toHaveTextContent('3') // 3 major
    expect(dialog).toHaveTextContent('Minor')
    expect(dialog).toHaveTextContent('1') // 1 minor
  })

  it('[P1] should call onConfirm when Confirm clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<BulkConfirmDialog {...defaultProps} onConfirm={onConfirm} />)

    await user.click(screen.getByTestId('bulk-confirm-button'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('[P1] should call onOpenChange(false) when Cancel clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<BulkConfirmDialog {...defaultProps} onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('[P1] should show "Accept" title for accept action', () => {
    render(<BulkConfirmDialog {...defaultProps} action="accept" />)
    expect(screen.getByRole('heading')).toHaveTextContent('Accept 6 findings?')
  })

  it('[P2] should not show severity row when count is 0', () => {
    const findings = [makeFinding({ severity: 'major' })]
    render(<BulkConfirmDialog {...defaultProps} selectedFindings={findings} />)
    const dialog = screen.getByTestId('bulk-confirm-dialog')
    // Only Major should appear, not Critical or Minor
    expect(dialog).not.toHaveTextContent('Critical')
    expect(dialog).not.toHaveTextContent('Minor')
    expect(dialog).toHaveTextContent('Major')
  })
})
