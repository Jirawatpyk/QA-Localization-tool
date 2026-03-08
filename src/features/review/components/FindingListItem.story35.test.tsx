/**
 * ATDD Tests — Story 3.5: Score Lifecycle & Confidence Display
 * AC: FindingListItem — confidence tooltip, layer-specific thresholds, fallback co-existence
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { DetectedByLayer } from '@/types/finding'

import { FindingListItem } from './FindingListItem'

// ── Local finding builder (matches FindingForDisplay shape in FindingListItem.tsx) ──

type FindingForDisplay = {
  id: string
  severity: 'critical' | 'major' | 'minor'
  category: string
  description: string
  detectedByLayer: DetectedByLayer
  aiConfidence: number | null
  sourceTextExcerpt: string | null
  targetTextExcerpt: string | null
  suggestedFix: string | null
  aiModel: string | null
}

function buildFindingForDisplay(overrides?: Partial<FindingForDisplay>): FindingForDisplay {
  return {
    id: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
    severity: 'major',
    category: 'accuracy',
    description: 'Translation accuracy issue',
    detectedByLayer: 'L2',
    aiConfidence: 85,
    sourceTextExcerpt: null,
    targetTextExcerpt: null,
    suggestedFix: null,
    aiModel: 'gpt-4o-mini',
    ...overrides,
  }
}

// ── Setup ──

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

// ── Tests ──

describe('FindingListItem — Story 3.5 confidence tooltip & thresholds', () => {
  // 3.5-U-042: Tooltip shows "Threshold: X% | Status: Meets/Below"
  it('[P1] should show tooltip with threshold and Meets/Below status on confidence badge hover', () => {
    // Arrange: L2 finding with confidence below threshold
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L2',
      aiConfidence: 65,
      aiModel: 'gpt-4o-mini',
    })

    // Act
    render(
      <FindingListItem
        finding={finding}
        l2ConfidenceMin={70}
        // Story 3.5: l3ConfidenceMin added for L3 findings
        l3ConfidenceMin={80}
      />,
    )

    // Assert: title attribute on wrapper contains threshold + status info
    const tooltipEl = screen.getByTitle(/Threshold: 70%.*Status:/i)
    expect(tooltipEl).toBeInTheDocument()
    expect(tooltipEl.title).toMatch(/below threshold/i)
  })

  // 3.5-U-043: L1 finding -> no confidence tooltip
  it('[P1] should not render confidence badge or tooltip for L1 finding', () => {
    // Arrange: L1 findings have aiConfidence=null (rule-based, no AI model)
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L1',
      aiConfidence: null,
      aiModel: null,
    })

    // Act
    render(<FindingListItem finding={finding} l2ConfidenceMin={70} l3ConfidenceMin={80} />)

    // Assert: no confidence badge for L1 findings
    expect(screen.queryByTestId('confidence-badge')).toBeNull()
    expect(screen.queryByText(/threshold/i)).toBeNull()
  })

  // 3.5-U-044: L2 finding gets l2ConfidenceMin as its threshold
  it('[P0] should apply l2ConfidenceMin threshold to L2 findings', () => {
    // Arrange: L2 finding with confidence below l2ConfidenceMin
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L2',
      aiConfidence: 65, // below l2ConfidenceMin=70
      aiModel: 'gpt-4o-mini',
    })

    // Act
    render(<FindingListItem finding={finding} l2ConfidenceMin={70} l3ConfidenceMin={80} />)

    // Assert: warning shown for L2 finding below l2ConfidenceMin
    // ConfidenceBadge receives confidenceMin=70 for this L2 finding
    expect(screen.getByTestId('confidence-warning')).toBeInTheDocument()
  })

  // 3.5-U-045: L3 finding gets l3ConfidenceMin as its threshold
  it('[P0] should apply l3ConfidenceMin threshold to L3 findings', () => {
    // Arrange: L3 finding with confidence between l2Min (70) and l3Min (80)
    // L3 threshold is higher — 75 is OK for L2 but below L3
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L3',
      aiConfidence: 75, // below l3ConfidenceMin=80, above l2ConfidenceMin=70
      aiModel: 'claude-sonnet-4-5-20250929',
    })

    // Act
    render(<FindingListItem finding={finding} l2ConfidenceMin={70} l3ConfidenceMin={80} />)

    // Assert: warning shown — L3 uses l3ConfidenceMin=80, and 75 < 80
    expect(screen.getByTestId('confidence-warning')).toBeInTheDocument()
  })

  // 3.5-U-047: null l3ConfidenceMin -> no warning, tooltip "Threshold not configured"
  it('[P1] should show "Threshold not configured" in tooltip when l3ConfidenceMin is null', () => {
    // Arrange: L3 finding but no language pair config for L3 threshold
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L3',
      aiConfidence: 75,
      aiModel: 'claude-sonnet-4-5-20250929',
    })

    // Act
    render(<FindingListItem finding={finding} l2ConfidenceMin={70} l3ConfidenceMin={null} />)

    // No warning when threshold is null (can't compare against unknown threshold)
    expect(screen.queryByTestId('confidence-warning')).toBeNull()

    // Title attribute contains "not configured" for missing threshold
    const tooltipEl = screen.getByTitle(/not configured/i)
    expect(tooltipEl).toBeInTheDocument()
  })

  // 3.5-U-053: Fallback badge + confidence badge co-exist
  it('[P1] should render both fallback badge and confidence badge for a fallback finding', () => {
    // Arrange: L2 finding from fallback model (not primary gpt-4o-mini)
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L2',
      aiConfidence: 78,
      aiModel: 'gpt-4o', // fallback model (not the primary gpt-4o-mini)
    })

    // Act
    render(<FindingListItem finding={finding} l2ConfidenceMin={70} l3ConfidenceMin={80} />)

    // Assert: BOTH badges visible simultaneously
    // Fallback badge (from Story 3.4)
    expect(screen.getByTestId('fallback-badge')).toBeInTheDocument()
    // Confidence badge (from Story 3.2c / 3.5)
    expect(screen.getByTestId('confidence-badge')).toBeInTheDocument()
  })

  // 3.5-U-063: Threshold change 80->90: findings 80-89 gain warning
  it('[P1] should show warning for findings with confidence 80-89 when threshold raised to 90', () => {
    // Arrange: finding with confidence=82, now threshold raised from 80 to 90
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L2',
      aiConfidence: 82, // was OK at threshold=80, now below threshold=90
      aiModel: 'gpt-4o-mini',
    })

    // Act — render with new higher threshold
    render(<FindingListItem finding={finding} l2ConfidenceMin={90} l3ConfidenceMin={90} />)

    // Assert: warning shown because 82 < new threshold 90
    expect(screen.getByTestId('confidence-warning')).toBeInTheDocument()
  })
})

// TA: Coverage Gap Tests (Story 3.5)

describe('FindingListItem — TA: Coverage Gap Tests (Story 3.5)', () => {
  // G3 [P1]: L3 Confirmed marker detection → confirmed badge
  it('[P1] should show "Confirmed by L3" badge when description contains [L3 Confirmed] marker (G3)', () => {
    const finding = buildFindingForDisplay({
      description: '[L3 Confirmed] Good translation quality verified',
      detectedByLayer: 'L2',
      aiConfidence: 85,
      aiModel: 'gpt-4o-mini',
    })

    render(<FindingListItem finding={finding} l2ConfidenceMin={70} l3ConfidenceMin={80} />)

    // Badge with "Confirmed" text visible
    expect(screen.getByTestId('l3-confirm-badge')).toBeInTheDocument()
    expect(screen.getByTestId('l3-confirm-badge')).toHaveTextContent(/confirmed/i)

    // Description text should have the marker stripped
    const desc = screen.getByTestId('finding-description')
    expect(desc.textContent).not.toContain('[L3 Confirmed]')
    expect(desc.textContent).toContain('Good translation quality verified')
  })

  // G4 [P1]: L3 Disagrees marker → disagrees badge
  it('[P1] should show "L3 disagrees" badge when description contains [L3 Disagrees] marker (G4)', () => {
    const finding = buildFindingForDisplay({
      description: '[L3 Disagrees] Translation may have issues with terminology',
      detectedByLayer: 'L2',
      aiConfidence: 75,
      aiModel: 'gpt-4o-mini',
    })

    render(<FindingListItem finding={finding} l2ConfidenceMin={70} l3ConfidenceMin={80} />)

    // Badge with "disagrees" text visible
    expect(screen.getByTestId('l3-disagree-badge')).toBeInTheDocument()
    expect(screen.getByTestId('l3-disagree-badge')).toHaveTextContent(/disagrees/i)

    // Description text should have the marker stripped
    const desc = screen.getByTestId('finding-description')
    expect(desc.textContent).not.toContain('[L3 Disagrees]')
    expect(desc.textContent).toContain('Translation may have issues with terminology')
  })

  // G10 [P2]: description truncation boundary
  it('[P2] should NOT truncate description that is exactly 100 chars (G10)', () => {
    // Build exactly 100-char description
    const exactDescription = 'A'.repeat(100)

    const finding = buildFindingForDisplay({
      description: exactDescription,
      detectedByLayer: 'L2',
      aiConfidence: 80,
      aiModel: 'gpt-4o-mini',
    })

    render(<FindingListItem finding={finding} l2ConfidenceMin={70} l3ConfidenceMin={80} />)

    const desc = screen.getByTestId('finding-description')
    // Exactly 100 chars → NOT truncated (no "...")
    expect(desc.textContent).toBe(exactDescription)
    expect(desc.textContent).not.toContain('...')
  })

  it('[P2] should truncate description that is 101 chars with "..." (G10)', () => {
    // Build 101-char description
    const longDescription = 'B'.repeat(101)

    const finding = buildFindingForDisplay({
      description: longDescription,
      detectedByLayer: 'L2',
      aiConfidence: 80,
      aiModel: 'gpt-4o-mini',
    })

    render(<FindingListItem finding={finding} l2ConfidenceMin={70} l3ConfidenceMin={80} />)

    const desc = screen.getByTestId('finding-description')
    // 101 chars → truncated to 100 + "..."
    expect(desc.textContent).toContain('...')
    expect(desc.textContent?.length).toBe(103) // 100 chars + "..."
  })

  // WI-7 [P2]: NaN confidenceMin guard — should normalize to null (no warning, "not configured" tooltip)
  it('[P2] should treat NaN confidenceMin as null — no warning, tooltip says "not configured" (WI-7)', () => {
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L2',
      aiConfidence: 50,
      aiModel: 'gpt-4o-mini',
    })

    render(<FindingListItem finding={finding} l2ConfidenceMin={NaN} l3ConfidenceMin={80} />)

    // NaN is normalized to null by the guard → treated as "not configured"
    expect(screen.queryByTestId('confidence-warning')).toBeNull()
    expect(screen.getByTitle(/not configured/i)).toBeInTheDocument()
  })

  // SC-1 [P2]: threshold change re-evaluation — finding at confidence 85 with threshold 80 vs 90
  it('[P2] should show warning when threshold raised above finding confidence (SC-1)', () => {
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L2',
      aiConfidence: 85,
      aiModel: 'gpt-4o-mini',
    })

    // First render: threshold=80, confidence=85 → 85 >= 80 → NO warning
    const { rerender } = render(
      <FindingListItem finding={finding} l2ConfidenceMin={80} l3ConfidenceMin={80} />,
    )
    expect(screen.queryByTestId('confidence-warning')).toBeNull()

    // Re-render: threshold=90, confidence=85 → 85 < 90 → warning appears
    rerender(<FindingListItem finding={finding} l2ConfidenceMin={90} l3ConfidenceMin={80} />)
    expect(screen.getByTestId('confidence-warning')).toBeInTheDocument()
  })
})
