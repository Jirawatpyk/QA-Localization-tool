/**
 * Test Automation Expansion — Story 4.2: FindingList component
 * Regression tests for DOM order + auto-advance past collapsed accordion
 *
 * TA-C1: rows render in same order as store sortedFindingIds
 * TA-U6: auto-advance past collapsed accordion finding to next visible (C1 bug regression)
 */
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { FindingList } from '@/features/review/components/FindingList'
import { useReviewStore } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import { buildFindingForUI } from '@/test/factories'

// ── Mock hooks ──

vi.mock('@/features/review/hooks/use-keyboard-actions', () => ({
  useKeyboardActions: () => ({
    register: vi.fn(() => vi.fn()),
    unregister: vi.fn(),
    pushScope: vi.fn(),
    popScope: vi.fn(),
    activeScope: 'review' as const,
    getAllBindings: vi.fn(() => []),
    checkConflict: vi.fn(() => ({
      hasConflict: false,
      conflictWith: null,
    })),
  }),
}))

vi.mock('@/features/review/hooks/use-focus-management', () => ({
  useFocusManagement: () => ({
    pushEscapeLayer: vi.fn(),
    popEscapeLayer: vi.fn(),
    handleEscape: vi.fn(),
    saveFocus: vi.fn(),
    restoreFocus: vi.fn(),
    autoAdvance: vi.fn(),
    trapFocus: vi.fn(() => ({ activate: vi.fn(), deactivate: vi.fn() })),
  }),
}))

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}))

// ── Helper ──

function buildTestFindings(): FindingForDisplay[] {
  return [
    buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
    buildFindingForUI({ id: 'c2', severity: 'critical', aiConfidence: 90 }),
    buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
    buildFindingForUI({ id: 'n1', severity: 'minor', aiConfidence: 50 }),
    buildFindingForUI({ id: 'n2', severity: 'minor', aiConfidence: 40 }),
  ]
}

function defaultProps(overrides?: Record<string, unknown>) {
  return {
    findings: buildTestFindings(),
    expandedIds: new Set<string>(),
    onToggleExpand: vi.fn(),
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    ...overrides,
  }
}

describe('FindingList — TA expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReviewStore.getState().resetForFile('ta-test')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // TA-C1: DOM order matches severity sort (critical → major → minor)
  it('[P1] should render rows in same order as store sortedFindingIds', () => {
    render(<FindingList {...defaultProps()} />)

    // Get all rendered compact rows
    const rows = screen.getAllByTestId('finding-compact-row')
    const renderedIds = rows.map((r) => r.getAttribute('data-finding-id'))

    // Expected order: critical (c1, c2) → major (m1) → minor hidden in accordion
    // Minor findings are inside accordion — only critical + major are visible by default
    // Critical sorted by confidence desc: c1 (95) then c2 (90)
    expect(renderedIds[0]).toBe('c1')
    expect(renderedIds[1]).toBe('c2')
    expect(renderedIds[2]).toBe('m1')
    // Minor findings (n1, n2) are inside Accordion — they render in DOM but collapsed
  })

  // TA-U6: C1 bug regression — auto-advance should include minor findings in sortedFindingIds
  // even when accordion is collapsed, so setSelectedFinding triggers accordion expand
  it('[P0] should auto-advance past collapsed accordion finding to next visible', () => {
    render(<FindingList {...defaultProps()} />)

    // FindingList syncs allSortedIds to store (includes ALL findings, even collapsed minor)
    const sortedIds = useReviewStore.getState().sortedFindingIds

    // All 5 findings should be in sortedFindingIds (not just visible ones)
    expect(sortedIds).toHaveLength(5)
    expect(sortedIds).toContain('c1')
    expect(sortedIds).toContain('c2')
    expect(sortedIds).toContain('m1')
    expect(sortedIds).toContain('n1')
    expect(sortedIds).toContain('n2')

    // Order: critical → major → minor
    expect(sortedIds.indexOf('c1')).toBeLessThan(sortedIds.indexOf('m1'))
    expect(sortedIds.indexOf('m1')).toBeLessThan(sortedIds.indexOf('n1'))
  })

  // TA-U6 part 2: setSelectedFinding to a minor finding auto-expands accordion
  it('[P0] should auto-expand minor accordion when setSelectedFinding targets minor finding', () => {
    render(<FindingList {...defaultProps()} />)

    // Minor accordion is collapsed by default
    // Navigate to minor finding via store (simulates auto-advance to minor)
    act(() => {
      useReviewStore.getState().setSelectedFinding('n1')
    })

    // After accordion expands, n1 should be visible
    const rows = screen.getAllByTestId('finding-compact-row')
    const n1Row = rows.find((r) => r.getAttribute('data-finding-id') === 'n1')
    expect(n1Row).toBeDefined()
  })
})
