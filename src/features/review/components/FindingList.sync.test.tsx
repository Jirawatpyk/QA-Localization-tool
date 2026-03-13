/**
 * ATDD GREEN PHASE — Story 4.1c: Detail Panel & Segment Context
 * Integration: FindingList ↔ Review Store sync
 *
 * Tests that FindingList syncs activeFindingId from the review store's selectedId.
 * This is needed for click-to-navigate from SegmentContextList back to FindingList.
 *
 * Guardrails referenced: #29 (roving tabindex), #31 (Esc hierarchy)
 */
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { FindingList } from '@/features/review/components/FindingList'
import { useReviewStore } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import { buildFindingForUI } from '@/test/factories'

// ── Mock useKeyboardActions — FindingList depends on it ──

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

// ── Helper: build findings ──

function buildTestFindings(): FindingForDisplay[] {
  return [
    buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
    buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
    buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
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

describe('FindingList sync (Story 4.1c)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReviewStore.getState().resetForFile('test-file-id')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC5: Context Segment Click-to-Navigate — Store Sync
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-I.1][P1] should sync activeFindingId when selectedId changes in store', () => {
    render(<FindingList {...defaultProps()} />)

    // Simulate context segment click → store update
    act(() => {
      useReviewStore.getState().setSelectedFinding('m2')
    })

    // FindingList should sync: m2 row should become active (tabindex=0)
    const rows = screen.getAllByTestId('finding-compact-row')
    const m2Row = rows.find((r) => r.getAttribute('data-finding-id') === 'm2')
    expect(m2Row).toBeDefined()
    expect(m2Row).toHaveAttribute('tabindex', '0')
  })

  it('[T-I.2][P1] should not trigger redundant update when selectedId matches activeFindingId', () => {
    const onToggleExpand = vi.fn()
    render(<FindingList {...defaultProps({ onToggleExpand })} />)

    // First row (c1) is already active by default (first in sorted order)
    act(() => {
      useReviewStore.getState().setSelectedFinding('c1')
    })

    // No state update triggered — onToggleExpand was not called
    expect(onToggleExpand).not.toHaveBeenCalled()
  })

  it('[T-I.3][P1] should not crash when selectedId points to a filtered-out finding', () => {
    // Render with only critical findings visible (simulate filter)
    const criticalOnly = [buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 })]
    render(<FindingList {...defaultProps({ findings: criticalOnly })} />)

    // Try to navigate to a major finding that's not in the list
    act(() => {
      useReviewStore.getState().setSelectedFinding('m1') // not in criticalOnly
    })

    // Should not crash — activeFindingId should remain on c1
    const c1Row = screen.getByTestId('finding-compact-row')
    expect(c1Row.getAttribute('data-finding-id')).toBe('c1')
    expect(c1Row).toHaveAttribute('tabindex', '0')
  })

  it('[T-I.4][P1] should auto-expand minor accordion when navigating to minor finding', () => {
    render(<FindingList {...defaultProps()} />)

    // Minor accordion starts collapsed by default
    // Navigate to minor finding via store
    act(() => {
      useReviewStore.getState().setSelectedFinding('n1')
    })

    // Minor accordion should auto-expand — n1 should now be visible
    const rows = screen.getAllByTestId('finding-compact-row')
    const n1Row = rows.find((r) => r.getAttribute('data-finding-id') === 'n1')
    expect(n1Row).toBeDefined()
  })
})
