import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProcessingMode } from '@/types/pipeline'

// Mock server action (imports 'server-only')
type MockStartProcessingResult =
  | { success: true; data: { batchId: string; fileCount: number } }
  | { success: false; code: string; error?: string }

const mockStartProcessing = vi.fn<(..._args: unknown[]) => Promise<MockStartProcessingResult>>(
  async () => ({ success: true, data: { batchId: 'test-batch-id', fileCount: 3 } }),
)
vi.mock('../actions/startProcessing.action', () => ({
  startProcessing: (...args: unknown[]) => mockStartProcessing(...args),
}))

// ── Story 3.1: Mock getFilesWordCount action ──
type MockWordCountResult =
  | { success: true; data: { totalWords: number } }
  | { success: false; code: string; error: string }

const mockGetFilesWordCount = vi.fn<(..._args: unknown[]) => Promise<MockWordCountResult>>(
  async () => ({ success: true, data: { totalWords: 50_000 } }),
)
vi.mock('../actions/getFilesWordCount.action', () => ({
  getFilesWordCount: (...args: unknown[]) => mockGetFilesWordCount(...args),
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

  it('should display cost estimate based on file count and mode', async () => {
    mockGetFilesWordCount.mockResolvedValue({ success: true, data: { totalWords: 50_000 } })
    render(<ProcessingModeDialog {...defaultProps} />)

    // AC#1: Cost bar shows Economy estimate: (50000/100K) × $0.40 = $0.20
    await waitFor(() => {
      const costSection = screen.getByTestId('cost-estimate')
      expect(costSection).toBeTruthy()
      expect(costSection.textContent).toContain('0.20')
      // AC#1: Economy time estimate
      expect(costSection.textContent).toContain('~30s')
    })
  })

  it('should display Thorough cost estimate when mode switched', async () => {
    mockGetFilesWordCount.mockResolvedValue({ success: true, data: { totalWords: 50_000 } })
    const user = userEvent.setup()
    render(<ProcessingModeDialog {...defaultProps} />)

    await user.click(screen.getByRole('radio', { name: /Thorough/i }))

    // AC#1: Thorough estimate: (50000/100K) × $2.40 = $1.20
    await waitFor(() => {
      const costSection = screen.getByTestId('cost-estimate')
      expect(costSection.textContent).toContain('1.20')
      expect(costSection.textContent).toContain('~2 min')
    })
  })

  it('should update cost when mode changes', async () => {
    mockGetFilesWordCount.mockResolvedValue({ success: true, data: { totalWords: 50_000 } })
    const user = userEvent.setup()
    render(<ProcessingModeDialog {...defaultProps} />)

    // Wait for word count to load, capture economy cost
    await waitFor(() => {
      expect(screen.getByTestId('cost-estimate').textContent).toContain('0.20')
    })
    const economyCost = screen.getByTestId('cost-estimate').textContent

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

  // ── M8: Error toast content & fallback ──

  it('should show error toast with action error message when startProcessing fails', async () => {
    mockStartProcessing.mockResolvedValue({
      success: false,
      code: 'CONFLICT',
      error: 'Files are already being processed',
    })
    const user = userEvent.setup()
    render(<ProcessingModeDialog {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'Start Processing' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Files are already being processed')
    })
  })

  it('should show fallback error toast when action fails without an error message', async () => {
    mockStartProcessing.mockResolvedValue({ success: false, code: 'INTERNAL_ERROR' })
    const user = userEvent.setup()
    render(<ProcessingModeDialog {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'Start Processing' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to start processing')
    })
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

  // ── Story 3.1: Word-count-based cost estimation (EXTEND) ──

  it('should fetch word count via getFilesWordCount action on mount', async () => {
    // Arrange: mock returns 50,000 words
    mockGetFilesWordCount.mockResolvedValue({ success: true, data: { totalWords: 50_000 } })

    render(<ProcessingModeDialog {...defaultProps} />)

    await waitFor(() => {
      expect(mockGetFilesWordCount).toHaveBeenCalledWith({
        fileIds: TEST_FILE_IDS,
        projectId: TEST_PROJECT_ID,
      })
    })
    // RED: getFilesWordCount not yet called in ProcessingModeDialog
  })

  it('should display economy cost estimate using formula: (words/100k)*0.40', async () => {
    // 50,000 words × $0.40/100K = $0.20
    mockGetFilesWordCount.mockResolvedValue({ success: true, data: { totalWords: 50_000 } })

    render(<ProcessingModeDialog {...defaultProps} />)

    await waitFor(() => {
      const costSection = screen.getByTestId('cost-estimate')
      expect(costSection.textContent).toContain('0.20')
    })
    // RED: word-count-based formula not yet implemented (currently per-file hardcoded)
  })

  it('should display thorough cost estimate using formula: (words/100k)*2.40', async () => {
    // 50,000 words × $2.40/100K = $1.20
    mockGetFilesWordCount.mockResolvedValue({ success: true, data: { totalWords: 50_000 } })
    const user = userEvent.setup()

    render(<ProcessingModeDialog {...defaultProps} />)

    await user.click(screen.getByRole('radio', { name: /Thorough/i }))

    await waitFor(() => {
      const costSection = screen.getByTestId('cost-estimate')
      expect(costSection.textContent).toContain('1.20')
    })
    // RED: thorough rate ($2.40/100K) not yet applied
  })

  it('should show loading skeleton while word count is fetching', async () => {
    // Word count never resolves — stays in loading state
    mockGetFilesWordCount.mockImplementation(() => new Promise(() => {}))

    render(<ProcessingModeDialog {...defaultProps} />)

    expect(screen.getByTestId('cost-estimate-loading')).toBeTruthy()
    // RED: loading skeleton not yet implemented
  })

  it("should display comparison note 'vs. manual QA: ~$150-300 per 100K words'", async () => {
    mockGetFilesWordCount.mockResolvedValue({ success: true, data: { totalWords: 50_000 } })

    render(<ProcessingModeDialog {...defaultProps} />)

    await waitFor(() => {
      const comparisonNote = screen.getByTestId('cost-comparison-note')
      expect(comparisonNote.textContent).toContain('$150')
      expect(comparisonNote.textContent).toContain('$300')
      expect(comparisonNote.textContent).toContain('manual QA')
    })
    // RED: comparison note not yet added (AC1 requirement)
  })

  // ── Story 3.1: Boundary value tests (Epic 2 retro A2) ──

  it('should display $0.00 cost estimate when totalWords is 0', async () => {
    // Boundary: 0 words → (0/100000)*0.40 = $0.00
    mockGetFilesWordCount.mockResolvedValue({ success: true, data: { totalWords: 0 } })

    render(<ProcessingModeDialog {...defaultProps} />)

    await waitFor(() => {
      const costSection = screen.getByTestId('cost-estimate')
      expect(costSection.textContent).toContain('0.00')
    })
    // RED: zero words edge case
  })

  it('should display exact rate cost when totalWords is exactly 100,000', async () => {
    // Boundary: 100K words → economy = $0.40 exactly, thorough = $2.40 exactly
    mockGetFilesWordCount.mockResolvedValue({ success: true, data: { totalWords: 100_000 } })

    render(<ProcessingModeDialog {...defaultProps} />)

    await waitFor(() => {
      // Economy mode (default): $0.40 exactly
      const costSection = screen.getByTestId('cost-estimate')
      expect(costSection.textContent).toContain('0.40')
    })
    // RED: exact rate match at 100K words
  })
})
