/**
 * Story 4.4a TA: Review Store — Bulk Operations Coverage Gap Tests
 * Tests: selectRange reverse order, selectRange invalid IDs, selectAllFiltered 0 matches,
 *        incrementOverrideCount on nonexistent finding
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useReviewStore } from '@/features/review/stores/review.store'
import { buildFinding } from '@/test/factories'

// ── Helpers ──

/** Populate store with N findings in pending state and set sortedFindingIds */
function seedFindings(count: number, overrides?: Record<string, unknown>) {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const id = `f${(i + 1).toString().padStart(3, '0')}`
    ids.push(id)
    useReviewStore.getState().setFinding(id, buildFinding({ id, status: 'pending', ...overrides }))
  }
  useReviewStore.getState().setSortedFindingIds(ids)
  return ids
}

// ── Tests ──

describe('useReviewStore — Bulk Operations Coverage Gaps (Story 4.4a)', () => {
  beforeEach(() => {
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('test-file-id')
  })

  // ── P1: selectRange reverse order ──

  it('[P1] selectRange should handle reverse order (end before start in sortedFindingIds)', () => {
    const ids = seedFindings(6)
    // ids = ['f001', 'f002', 'f003', 'f004', 'f005', 'f006']

    // Select range from f005 (index 4) to f002 (index 1) — reversed
    useReviewStore.getState().selectRange(ids[4]!, ids[1]!)

    const selected = useReviewStore.getState().selectedIds
    // Should select f002, f003, f004, f005 (Math.min/Math.max normalizes order)
    expect(selected.size).toBe(4)
    expect(selected.has('f002')).toBe(true)
    expect(selected.has('f003')).toBe(true)
    expect(selected.has('f004')).toBe(true)
    expect(selected.has('f005')).toBe(true)
    // Should NOT include f001 and f006
    expect(selected.has('f001')).toBe(false)
    expect(selected.has('f006')).toBe(false)
  })

  // ── P1: selectRange invalid IDs ──

  it('[P1] selectRange should fallback to single-select when anchor not in sorted list (fix #7)', () => {
    const ids = seedFindings(4)

    useReviewStore.getState().addToSelection(ids[0]!)

    // Anchor not in sortedFindingIds → fallback to single-select of toId
    useReviewStore.getState().selectRange('nonexistent-id', ids[1]!)

    const selectedAfter = useReviewStore.getState().selectedIds
    expect(selectedAfter).toEqual(new Set([ids[1]!]))
    expect(useReviewStore.getState().selectionMode).toBe('bulk')
  })

  // ── P1: selectAllFiltered with 0 matches ──

  it('[P1] selectAllFiltered with 0 matches should clear selection and exit bulk', () => {
    // Seed findings with status 'accepted'
    useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1', status: 'accepted' }))
    useReviewStore.getState().setFinding('f2', buildFinding({ id: 'f2', status: 'accepted' }))
    useReviewStore.getState().setSortedFindingIds(['f1', 'f2'])

    // Pre-select and set bulk mode
    useReviewStore.getState().setSelectionMode('bulk')
    useReviewStore.getState().addToSelection('f1')
    expect(useReviewStore.getState().selectedIds.size).toBe(1)
    expect(useReviewStore.getState().selectionMode).toBe('bulk')

    // Filter to 'pending' — no matches among accepted findings
    useReviewStore.getState().setFilter('status', 'pending')

    // selectAllFiltered with 0 matches → clear selection + exit bulk
    useReviewStore.getState().selectAllFiltered()

    const state = useReviewStore.getState()
    expect(state.selectedIds.size).toBe(0)
    expect(state.selectionMode).toBe('single')
  })

  // ── P1: incrementOverrideCount on nonexistent finding ──

  it('[P1] incrementOverrideCount on nonexistent finding should start at 1', () => {
    // No override counts set yet
    expect(useReviewStore.getState().overrideCounts.size).toBe(0)

    // Increment a finding that has no existing count
    useReviewStore.getState().incrementOverrideCount('nonexistent-finding-id')

    const counts = useReviewStore.getState().overrideCounts
    expect(counts.get('nonexistent-finding-id')).toBe(1)

    // Increment again — should be 2
    useReviewStore.getState().incrementOverrideCount('nonexistent-finding-id')
    expect(useReviewStore.getState().overrideCounts.get('nonexistent-finding-id')).toBe(2)
  })
})
