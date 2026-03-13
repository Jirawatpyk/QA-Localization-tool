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
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { FindingDetailContent } from '@/features/review/components/FindingDetailContent'
import { buildFindingForUI } from '@/test/factories'

// Mock useReducedMotion to avoid matchMedia issues in jsdom
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}))

// Mock useSegmentContext to isolate from server action
vi.mock('@/features/review/hooks/use-segment-context', () => ({
  useSegmentContext: () => ({
    data: null,
    isLoading: false,
    error: null,
    retry: vi.fn(),
  }),
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
})
