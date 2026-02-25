import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProcessingMode } from '@/types/pipeline'

// Mock server action (imports 'server-only')
const mockStartProcessing = vi.fn(
  async (..._args: unknown[]) =>
    ({ success: true, data: { batchId: 'test-batch-id', fileCount: 3 } }) as const,
)
vi.mock('../actions/startProcessing.action', () => ({
  startProcessing: (...args: unknown[]) => mockStartProcessing(...args),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { ProcessingModeDialog } from './ProcessingModeDialog'

const TEST_FILE_IDS = [
  'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
  'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f',
]
const TEST_PROJECT_ID = 'd4e5f6a1-b2c3-4d4e-bf5a-6b7c8d9e0f1a'

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  fileIds: TEST_FILE_IDS,
  projectId: TEST_PROJECT_ID,
  onStartProcessing: vi.fn(),
}

describe('ProcessingModeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render dialog when open is true', () => {
    render(<ProcessingModeDialog {...defaultProps} />)

    // DialogTitle renders as h2 — avoids strict-mode clash with the "Start Processing" button
    expect(screen.getByRole('heading', { name: 'Start Processing' })).toBeTruthy()
    // Should display file count info
    expect(screen.getByText(/3 files/i)).toBeTruthy()
  })

  it('should not render when open is false', () => {
    const { container } = render(<ProcessingModeDialog {...defaultProps} open={false} />)

    expect(container.textContent).not.toContain('Start Processing')
  })

  it('should render Economy and Thorough mode cards', () => {
    render(<ProcessingModeDialog {...defaultProps} />)

    expect(screen.getByText('Economy')).toBeTruthy()
    expect(screen.getByText('Thorough')).toBeTruthy()
    // Economy: L1 + L2, Thorough: L1 + L2 + L3
    expect(screen.getByText('L1 + L2')).toBeTruthy()
    expect(screen.getByText(/L1 \+ L2 \+ L3/)).toBeTruthy()
  })

  it('should select Economy mode by default (FR14)', () => {
    render(<ProcessingModeDialog {...defaultProps} />)

    // Economy card should have selected/checked state
    const economyCard = screen.getByRole('radio', { name: /Economy/i })
    expect(economyCard.getAttribute('aria-checked')).toBe('true')

    // Thorough card should NOT be selected
    const thoroughCard = screen.getByRole('radio', { name: /Thorough/i })
    expect(thoroughCard.getAttribute('aria-checked')).toBe('false')
  })

  it('should switch to Thorough mode when clicked', async () => {
    const user = userEvent.setup()
    render(<ProcessingModeDialog {...defaultProps} />)

    const thoroughCard = screen.getByRole('radio', { name: /Thorough/i })
    await user.click(thoroughCard)

    expect(thoroughCard.getAttribute('aria-checked')).toBe('true')

    const economyCard = screen.getByRole('radio', { name: /Economy/i })
    expect(economyCard.getAttribute('aria-checked')).toBe('false')
  })

  it('should display cost estimate based on file count and mode', () => {
    render(<ProcessingModeDialog {...defaultProps} />)

    // Cost bar should show estimated cost for Economy mode (default)
    // The exact cost format depends on implementation, but it should be visible
    const costSection = screen.getByTestId('cost-estimate')
    expect(costSection).toBeTruthy()
    expect(costSection.textContent).toBeTruthy()
  })

  it('should update cost when mode changes', async () => {
    const user = userEvent.setup()
    render(<ProcessingModeDialog {...defaultProps} />)

    // Capture economy cost
    const costSection = screen.getByTestId('cost-estimate')
    const economyCost = costSection.textContent

    // Switch to Thorough
    const thoroughCard = screen.getByRole('radio', { name: /Thorough/i })
    await user.click(thoroughCard)

    // Cost should have changed (Thorough is more expensive due to L3)
    await waitFor(() => {
      const updatedCost = screen.getByTestId('cost-estimate').textContent
      expect(updatedCost).not.toBe(economyCost)
    })
  })

  it('should call onOpenChange(false) when Cancel clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<ProcessingModeDialog {...defaultProps} onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('should call startProcessing action and onStartProcessing when Start clicked', async () => {
    const user = userEvent.setup()
    const onStartProcessing = vi.fn()
    render(<ProcessingModeDialog {...defaultProps} onStartProcessing={onStartProcessing} />)

    await user.click(screen.getByRole('button', { name: 'Start Processing' }))

    await waitFor(() => {
      expect(mockStartProcessing).toHaveBeenCalledWith({
        fileIds: TEST_FILE_IDS,
        projectId: TEST_PROJECT_ID,
        mode: 'economy' satisfies ProcessingMode,
      })
      expect(onStartProcessing).toHaveBeenCalledOnce()
    })
  })

  it('should show Recommended badge on Thorough card only (AC#1)', () => {
    render(<ProcessingModeDialog {...defaultProps} />)

    const thoroughCard = screen.getByRole('radio', { name: /Thorough/i })
    expect(within(thoroughCard).getByText('Recommended')).toBeTruthy()

    const economyCard = screen.getByRole('radio', { name: /Economy/i })
    expect(within(economyCard).queryByText('Recommended')).toBeNull()
  })

  it('should disable buttons and show loading state during submission', async () => {
    // startProcessing never resolves — keeps submission in progress
    mockStartProcessing.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    render(<ProcessingModeDialog {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'Start Processing' }))

    await waitFor(() => {
      // Start button should show loading state
      const startBtn = screen.getByRole('button', { name: /Processing/i })
      expect(startBtn.hasAttribute('disabled')).toBe(true)

      // Cancel button should also be disabled during submission
      const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
      expect(cancelBtn.hasAttribute('disabled')).toBe(true)
    })
  })
})
