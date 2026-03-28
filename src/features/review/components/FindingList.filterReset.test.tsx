/**
 * Epic 3 P1 Tests — Filter State on File Navigation (P1-09, R3-037)
 * Story 4.5 Update: filter state PERSISTS per file (AC3), not resets.
 * Default for never-visited file = status: 'pending'.
 *
 * Guardrails: #11, #35 (undo stacks still clear on file switch)
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { FindingList } from '@/features/review/components/FindingList'
import { useReviewStore, getStoreFileState } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import { saveFilterCache } from '@/features/review/utils/filter-cache'
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

describe('FindingList — filter persistence (P1-09, Story 4.5 AC3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('test-file-id')
  })

  it('[P1] should persist filter state when switching files and returning', () => {
    // Arrange: Set a severity filter on file-A
    useReviewStore.getState().setFilter('severity', 'critical')
    expect(getStoreFileState().filterState.severity).toBe('critical')

    // Act: Simulate component cleanup (saves cache) + switch to file-B, then return
    // Save A's filter to cache (mirrors ReviewPageClient cleanup effect)
    const fsA = getStoreFileState()
    saveFilterCache('test-file-id', {
      filterState: { ...fsA.filterState },
      searchQuery: fsA.searchQuery,
      aiSuggestionsEnabled: fsA.aiSuggestionsEnabled,
    })

    useReviewStore.getState().resetForFile('file-b')

    // Save B's filter, then return to A
    const fsB = getStoreFileState()
    saveFilterCache('file-b', {
      filterState: { ...fsB.filterState },
      searchQuery: fsB.searchQuery,
      aiSuggestionsEnabled: fsB.aiSuggestionsEnabled,
    })

    useReviewStore.getState().resetForFile('test-file-id')

    // Assert: Filter state is restored from cache
    expect(getStoreFileState().filterState.severity).toBe('critical')
  })

  it('[P1] should set default status=pending for never-visited file', () => {
    // Act: resetForFile for a brand new file
    useReviewStore.getState().resetForFile('brand-new-file')

    // Assert: Default filter has status=pending (AC1 default)
    const { filterState } = getStoreFileState()
    expect(filterState.status).toBe('pending')
    expect(filterState.severity).toBeNull()
    expect(filterState.layer).toBeNull()
    expect(filterState.category).toBeNull()
    expect(filterState.confidence).toBeNull()
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
