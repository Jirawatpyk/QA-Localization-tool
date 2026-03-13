/**
 * RED PHASE: Will pass after Story 4.1d implementation
 *
 * Tests — Story 4.1d: FindingDetailContent (shared content extracted from FindingDetailSheet)
 * Test IDs: T4.5, PM-3, PM-12
 *
 * This component renders the inner content of the detail panel, shared between:
 * - Desktop: static <aside> panel
 * - Laptop/Mobile: Sheet drawer
 *
 * Guardrails referenced: #36 (severity icons), #38 (ARIA landmarks), #39 (lang attribute)
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { FindingDetailContent } from '@/features/review/components/FindingDetailContent'
import type { FindingForDisplay } from '@/features/review/types'
import { buildFindingForUI } from '@/test/factories'

// Mock useReducedMotion to avoid matchMedia issues in jsdom
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}))

// Mock useSegmentContext — vi.fn() allows per-test overrides
const mockUseSegmentContext = vi.fn((..._args: unknown[]) => ({
  data: null as unknown,
  isLoading: false,
  error: null as string | null,
  retry: vi.fn(),
}))

vi.mock('@/features/review/hooks/use-segment-context', () => ({
  useSegmentContext: (...args: unknown[]) => mockUseSegmentContext(...args),
}))

// ── Factory-built finding data ──

const mockFinding = buildFindingForUI({
  id: 'f-001',
  segmentId: 'seg-001',
  severity: 'major',
  category: 'accuracy',
  description: 'Incorrect translation of term',
  status: 'pending',
  detectedByLayer: 'L2',
  aiConfidence: 85,
  sourceTextExcerpt: 'Hello world',
  targetTextExcerpt: 'สวัสดีโลก',
  suggestedFix: 'Use สวัสดีชาวโลก instead',
  aiModel: 'gpt-4o-mini',
})

// ── Default props ──

function defaultProps(overrides?: Record<string, unknown>) {
  return {
    finding: mockFinding,
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    fileId: 'b2c3d4e5-f6a1-4b1c-9d2e-4f5a6b7c8d9e',
    contextRange: undefined as number | undefined,
    onNavigateToFinding: vi.fn(),
    ...overrides,
  }
}

describe('FindingDetailContent', () => {
  beforeEach(() => {
    mockUseSegmentContext.mockClear()
    mockUseSegmentContext.mockImplementation((..._args: unknown[]) => ({
      data: null,
      isLoading: false,
      error: null,
      retry: vi.fn(),
    }))
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Core rendering
  // ═══════════════════════════════════════════════════════════════════════

  it('[P0] should render finding metadata when finding provided', () => {
    // Arrange & Act
    render(<FindingDetailContent {...defaultProps()} />)

    // Assert: severity, category, layer, status, description all visible
    expect(screen.getByText(/Major/i)).toBeInTheDocument()
    expect(screen.getByText(/accuracy/i)).toBeInTheDocument()
    expect(screen.getByText(/AI/)).toBeInTheDocument() // L2 = "AI"
    expect(screen.getByText(/Pending/i)).toBeInTheDocument()
    expect(screen.getByText('Incorrect translation of term')).toBeInTheDocument()

    // AI confidence + model
    expect(screen.getByText(/85%/)).toBeInTheDocument()
    expect(screen.getByText(/gpt-4o-mini/)).toBeInTheDocument()

    // Suggested fix
    expect(screen.getByText(/Use สวัสดีชาวโลก instead/)).toBeInTheDocument()
  })

  it('[P0] should render segment context section', () => {
    // Arrange & Act
    render(<FindingDetailContent {...defaultProps()} />)

    // Assert: segment context section is present (even if loading/empty)
    // The SegmentContextList component is mocked to return null data / not loading
    // but the section container should exist
    expect(screen.getByText(/Segment Context/i)).toBeInTheDocument()
  })

  it('[P0] should render identical content regardless of wrapper (aside vs sheet) — same props = same output', () => {
    // Arrange: render twice with identical props, different wrappers
    const props = defaultProps()

    const { container: container1 } = render(
      <aside>
        <FindingDetailContent {...props} />
      </aside>,
    )

    const { container: container2 } = render(
      <div data-testid="sheet-wrapper">
        <FindingDetailContent {...props} />
      </div>,
    )

    // Assert: both renders produce FindingDetailContent with same data-testid + content
    const content1 = container1.querySelector('[data-testid="finding-detail-content"]')
    const content2 = container2.querySelector('[data-testid="finding-detail-content"]')

    expect(content1).not.toBeNull()
    expect(content2).not.toBeNull()
    // Both should have same text content (ignoring wrapper)
    expect(content1!.textContent).toBe(content2!.textContent)
  })

  it('[P1] should render empty state placeholder when finding is null', () => {
    // Arrange & Act
    render(<FindingDetailContent {...defaultProps({ finding: null })} />)

    // Assert: empty state message visible
    expect(screen.getByText(/Select a finding to view details/i)).toBeInTheDocument()
  })

  it('[P1] should have data-testid="finding-detail-content"', () => {
    // Arrange & Act
    render(<FindingDetailContent {...defaultProps()} />)

    // Assert
    expect(screen.getByTestId('finding-detail-content')).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Coverage gaps: Story 4.1c G8, G9, G3
  // ═══════════════════════════════════════════════════════════════════════

  it('[TA-G8][P1] should render cross-file fallback when finding.segmentId is null', () => {
    // Build finding manually — buildFindingForUI uses `??` on segmentId which coalesces null to UUID
    const crossFileFinding: FindingForDisplay = {
      id: 'f-cross',
      segmentId: null,
      severity: 'minor',
      category: 'fluency',
      description: 'Cross-file issue',
      status: 'pending',
      detectedByLayer: 'L1',
      aiConfidence: null,
      sourceTextExcerpt: null,
      targetTextExcerpt: null,
      suggestedFix: null,
      aiModel: null,
    }

    render(<FindingDetailContent {...defaultProps({ finding: crossFileFinding })} />)

    // Cross-file fallback message should appear
    expect(screen.getByTestId('cross-file-message')).toBeInTheDocument()
    expect(screen.getByText(/Cross-file finding/)).toBeInTheDocument()
    // Context range selector should NOT appear (cross-file has no context)
    expect(screen.queryByTestId('context-range-selector')).not.toBeInTheDocument()
  })

  it('[TA-G9][P2] should format multi-word status correctly (source_issue → "Source Issue")', () => {
    const sourceIssueFinding = buildFindingForUI({
      id: 'f-si',
      status: 'source_issue',
      severity: 'minor',
      category: 'style',
      description: 'Source issue test',
      detectedByLayer: 'L1',
    })

    render(<FindingDetailContent {...defaultProps({ finding: sourceIssueFinding })} />)

    expect(screen.getByText('Source Issue')).toBeInTheDocument()
  })

  it('[TA-G3][P1] should update context range when selector changes', () => {
    render(<FindingDetailContent {...defaultProps()} />)

    // Default: context range selector shows ±2 (defaultProps has contextRange=undefined → defaults to 2)
    const selector = screen.getByTestId('context-range-selector')
    expect(selector).toHaveValue('2')

    // Change to ±1
    fireEvent.change(selector, { target: { value: '1' } })
    expect(selector).toHaveValue('1')

    // Change to ±3
    fireEvent.change(selector, { target: { value: '3' } })
    expect(selector).toHaveValue('3')
  })

  // ═══ TA Coverage: Story 4.1d gaps ═══

  it('[TA-G3][P1] should render loading indicator when segment context is loading', () => {
    // Arrange: override mock to return loading state
    mockUseSegmentContext.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: vi.fn(),
    })

    // Act
    render(<FindingDetailContent {...defaultProps()} />)

    // Assert: skeleton loading indicator renders
    expect(screen.getByTestId('segment-context-skeleton')).toBeInTheDocument()
    // Should NOT show error or loaded content
    expect(screen.queryByTestId('segment-context-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('segment-context-loaded')).not.toBeInTheDocument()
  })

  it('[TA-G4][P1] should render error message and retry button when segment context fails', () => {
    // Arrange: override mock to return error state
    const mockRetry = vi.fn()
    mockUseSegmentContext.mockReturnValue({
      data: null,
      isLoading: false,
      error: 'Network error',
      retry: mockRetry,
    })

    // Act
    render(<FindingDetailContent {...defaultProps()} />)

    // Assert: error container renders with message
    expect(screen.getByTestId('segment-context-error')).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()

    // Assert: retry button is present and clickable
    const retryButton = screen.getByRole('button', { name: /retry/i })
    expect(retryButton).toBeInTheDocument()
    fireEvent.click(retryButton)
    expect(mockRetry).toHaveBeenCalledOnce()

    // Should NOT show skeleton or loaded content
    expect(screen.queryByTestId('segment-context-skeleton')).not.toBeInTheDocument()
    expect(screen.queryByTestId('segment-context-loaded')).not.toBeInTheDocument()
  })

  it('[TA-G9][P2] should sync contextRange selector when contextRange prop changes via rerender', () => {
    // Arrange: render with contextRange=3
    const { rerender } = render(<FindingDetailContent {...defaultProps({ contextRange: 3 })} />)

    const selector = screen.getByTestId('context-range-selector')
    expect(selector).toHaveValue('3')

    // Act: rerender with contextRange=1
    rerender(<FindingDetailContent {...defaultProps({ contextRange: 1 })} />)

    // Assert: selector updated to reflect new prop
    expect(selector).toHaveValue('1')
  })

  it('[TA-G12][P2] should preserve contextRange=0 via nullish coalescing (0 is not nullish)', () => {
    // Arrange & Act: render with contextRange=0
    // useState(contextRangeProp ?? 2) — 0 ?? 2 === 0 (NOT 2)
    render(<FindingDetailContent {...defaultProps({ contextRange: 0 })} />)

    // Assert: useSegmentContext was called with contextRange=0, NOT 2
    // (The <select> has no <option value="0">, so DOM falls back to first option.
    //  We verify the internal state via the hook call argument instead.)
    const lastCall = mockUseSegmentContext.mock.calls[mockUseSegmentContext.mock.calls.length - 1]!
    const hookArgs = lastCall[0] as { contextRange: number }
    expect(hookArgs.contextRange).toBe(0)
    // Must NOT be the default value 2 (would happen if || was used instead of ??)
    expect(hookArgs.contextRange).not.toBe(2)
  })
})
