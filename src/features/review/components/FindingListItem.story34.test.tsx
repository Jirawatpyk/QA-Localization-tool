/** Story 3.4 ATDD — FindingListItem fallback badge — RED PHASE */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { DetectedByLayer } from '@/types/finding'

import { FindingListItem } from './FindingListItem'

// ── Finding builder helper ──

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
  aiModel: string | null // Story 3.4: new field
}

function buildFindingForDisplay(overrides?: Partial<FindingForDisplay>): FindingForDisplay {
  return {
    id: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
    severity: 'major',
    category: 'accuracy',
    description: 'Translation issue detected',
    detectedByLayer: 'L2',
    aiConfidence: 0.85,
    sourceTextExcerpt: null,
    targetTextExcerpt: null,
    suggestedFix: null,
    aiModel: null,
    ...overrides,
  }
}

// L2 primary model (from LAYER_DEFAULTS in providers.ts)
const L2_PRIMARY_MODEL = 'gpt-4o-mini'
// L3 primary model
const L3_PRIMARY_MODEL = 'claude-sonnet-4-5-20250929'

beforeEach(() => {
  vi.clearAllMocks()
  // Mock matchMedia for useReducedMotion hook
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

describe('FindingListItem — fallback badge (Story 3.4)', () => {
  // T13
  it('[P0] should NOT show fallback badge for L1 finding (aiModel=null)', () => {
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L1',
      aiModel: null, // L1 findings never have aiModel
      aiConfidence: null,
    })

    render(<FindingListItem finding={finding} />)

    // No fallback badge should appear for L1 rule-based findings
    expect(screen.queryByTestId('fallback-badge')).toBeNull()
    expect(screen.queryByText(/Fallback/i)).toBeNull()
  })

  // T14
  it('[P0] should NOT show fallback badge when aiModel matches L2 primary', () => {
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L2',
      aiModel: L2_PRIMARY_MODEL, // same as primary — not a fallback
    })

    render(<FindingListItem finding={finding} />)

    expect(screen.queryByTestId('fallback-badge')).toBeNull()
    expect(screen.queryByText(/Fallback/i)).toBeNull()
  })

  // T15
  it('[P0] should show "Fallback" badge when aiModel differs from L2 primary', () => {
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L2',
      aiModel: 'gemini-2.0-flash', // fallback model used instead of gpt-4o-mini
    })

    render(<FindingListItem finding={finding} />)

    // Fallback badge must appear
    const fallbackBadge = screen.getByTestId('fallback-badge')
    expect(fallbackBadge).toBeTruthy()
    expect(fallbackBadge.textContent).toMatch(/Fallback/i)
  })

  // T16
  it('[P0] should NOT show fallback badge when aiModel matches L3 primary', () => {
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L3',
      aiModel: L3_PRIMARY_MODEL, // claude-sonnet — L3 primary, not a fallback
    })

    render(<FindingListItem finding={finding} />)

    expect(screen.queryByTestId('fallback-badge')).toBeNull()
    expect(screen.queryByText(/Fallback/i)).toBeNull()
  })

  // T17
  it('[P0] should show "Fallback" badge with tooltip for L3 fallback model', () => {
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L3',
      aiModel: 'gpt-4o', // gpt-4o used as L3 fallback (claude-sonnet was unavailable)
    })

    render(<FindingListItem finding={finding} />)

    const fallbackBadge = screen.getByTestId('fallback-badge')
    expect(fallbackBadge).toBeTruthy()
    expect(fallbackBadge.textContent).toMatch(/Fallback/i)

    // Badge should have a tooltip indicating which fallback model was used
    const hasTooltipAttr =
      fallbackBadge.hasAttribute('title') ||
      fallbackBadge.hasAttribute('aria-label') ||
      fallbackBadge.hasAttribute('data-tooltip')
    expect(hasTooltipAttr).toBe(true)

    const tooltipText =
      fallbackBadge.getAttribute('title') ??
      fallbackBadge.getAttribute('aria-label') ??
      fallbackBadge.getAttribute('data-tooltip') ??
      ''
    expect(tooltipText).toContain('gpt-4o')
  })

  // T18
  it('[P1] should treat L2 default model on L3 finding as fallback', () => {
    // gpt-4o-mini is the L2 primary — if it appears on an L3 finding, it means
    // L3's primary (claude-sonnet) failed and L2's model was used as emergency fallback
    const finding = buildFindingForDisplay({
      detectedByLayer: 'L3',
      aiModel: 'gpt-4o-mini', // L2 model used for L3 layer = definitely a fallback
    })

    render(<FindingListItem finding={finding} />)

    const fallbackBadge = screen.getByTestId('fallback-badge')
    expect(fallbackBadge).toBeTruthy()
    expect(fallbackBadge.textContent).toMatch(/Fallback/i)
  })

  // T19
  it('[P0] should receive aiModel field via FindingForDisplay type', () => {
    // This test validates that FindingForDisplay type has been extended with aiModel
    // It will fail at runtime if the prop is not passed through to the component

    const finding = buildFindingForDisplay({
      detectedByLayer: 'L2',
      aiModel: 'gemini-2.0-flash',
    })

    // If FindingForDisplay doesn't include aiModel, this render will use a stale type
    // and the fallback badge won't render (type mismatch causes prop to be stripped)
    render(<FindingListItem finding={finding} />)

    // Fallback badge must appear — confirming aiModel prop was received
    expect(screen.getByTestId('fallback-badge')).toBeTruthy()
  })
})
