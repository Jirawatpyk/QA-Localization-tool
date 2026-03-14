/**
 * Epic 3 P1 Tests — Filter State Reset on File Navigation (P1-09, R3-037)
 * Tests: Filter state (severity, layer) resets when navigating to a new file,
 * and empty filtered list shows "No findings" not blank.
 *
 * Guardrails: #11 (Dialog state reset applies conceptually to filter reset on file switch)
 */
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

// ── Helpers ──

function buildMixedFindings(): FindingForDisplay[] {
  return [
    buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95, detectedByLayer: 'L1' }),
    buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80, detectedByLayer: 'L2' }),
    buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70, detectedByLayer: 'L2' }),
    buildFindingForUI({ id: 'n1', severity: 'minor', aiConfidence: 50, detectedByLayer: 'L1' }),
  ]
}

function defaultProps(overrides?: Record<string, unknown>) {
  return {
    findings: buildMixedFindings(),
    expandedIds: new Set<string>(),
    onToggleExpand: vi.fn(),
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    ...overrides,
  }
}

// ── Tests ──

describe('FindingList — filterReset (P1-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReviewStore.getState().resetForFile('test-file-id')
  })

  it('[P1] should reset filter state when navigating to a new file via resetForFile', () => {
    // Arrange: Set a severity filter in store
    useReviewStore.getState().setFilter({ severity: 'critical', status: null, layer: null })

    // Verify filter is set
    expect(useReviewStore.getState().filterState.severity).toBe('critical')

    // Act: resetForFile simulates file navigation — clears all filter state
    useReviewStore.getState().resetForFile('new-file-id')

    // Assert: Filter state is reset (all null = show all)
    const { filterState } = useReviewStore.getState()
    expect(filterState.severity).toBeNull()
    expect(filterState.status).toBeNull()
    expect(filterState.layer).toBeNull()
  })

  it('[P1] should clear layer filter on file switch', () => {
    // Arrange: Set a layer filter
    useReviewStore.getState().setFilter({ severity: null, status: null, layer: 'L2' })

    // Verify filter is set
    expect(useReviewStore.getState().filterState.layer).toBe('L2')

    // Act: resetForFile clears filters (simulates navigating to new file)
    useReviewStore.getState().resetForFile('another-file-id')

    // Assert: Layer filter is cleared
    expect(useReviewStore.getState().filterState.layer).toBeNull()
  })

  it('[P1] should show "No findings" text when findings list is empty after filter, not blank', () => {
    // Render FindingList with empty findings — simulates when filter excludes everything
    render(<FindingList {...defaultProps({ findings: [] })} />)

    // Assert: Empty state message is visible, not a blank area
    expect(screen.getByText(/no findings/i)).toBeInTheDocument()

    // No rowgroups when empty
    expect(screen.queryAllByRole('rowgroup').length).toBe(0)
  })
})
