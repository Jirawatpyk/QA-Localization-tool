/**
 * Story 4.4a ATDD: Review Store — Bulk Operations Extensions (AC1)
 * Tests: selectRange, selectAllFiltered, isBulkInFlight, overrideCounts, resetForFile
 *
 * TDD RED phase — all tests use it() pending implementation.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useReviewStore, getStoreFileState } from '@/features/review/stores/review.store'
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

describe('useReviewStore — Bulk Operations (Story 4.4a AC1)', () => {
  beforeEach(() => {
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('test-file-id')
  })

  // ── P0: Range Selection ──

  it('[P0] should select range between two finding IDs in sort order', () => {
    const ids = seedFindings(6)
    // ids = ['f001', 'f002', 'f003', 'f004', 'f005', 'f006']

    // Select range from f002 to f005 → should select f002, f003, f004, f005
    useReviewStore.getState().selectRange(ids[1]!, ids[4]!)

    const selected = getStoreFileState().selectedIds
    expect(selected.size).toBe(4)
    expect(selected.has('f002')).toBe(true)
    expect(selected.has('f003')).toBe(true)
    expect(selected.has('f004')).toBe(true)
    expect(selected.has('f005')).toBe(true)
    // Should NOT include f001 and f006
    expect(selected.has('f001')).toBe(false)
    expect(selected.has('f006')).toBe(false)
  })

  // ── P0: Select All Filtered ──

  it('[P0] should select all filtered findings on selectAllFiltered', () => {
    // Seed 4 findings: 2 pending, 1 accepted, 1 rejected
    useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1', status: 'pending' }))
    useReviewStore.getState().setFinding('f2', buildFinding({ id: 'f2', status: 'accepted' }))
    useReviewStore.getState().setFinding('f3', buildFinding({ id: 'f3', status: 'pending' }))
    useReviewStore.getState().setFinding('f4', buildFinding({ id: 'f4', status: 'rejected' }))
    useReviewStore.getState().setSortedFindingIds(['f1', 'f2', 'f3', 'f4'])

    // Set filter to pending only
    useReviewStore.getState().setFilter('status', 'pending')

    // Select all filtered — should select only pending findings
    useReviewStore.getState().selectAllFiltered()

    const selected = getStoreFileState().selectedIds
    expect(selected.size).toBe(2)
    expect(selected.has('f1')).toBe(true)
    expect(selected.has('f3')).toBe(true)
    expect(selected.has('f2')).toBe(false)
    expect(selected.has('f4')).toBe(false)
  })

  // ── P1: isBulkInFlight tracking ──

  it('[P1] should track isBulkInFlight state', () => {
    // Initially false
    expect(getStoreFileState().isBulkInFlight).toBe(false)

    // Set to true when bulk operation starts
    useReviewStore.getState().setBulkInFlight(true)
    expect(getStoreFileState().isBulkInFlight).toBe(true)

    // Set back to false when operation completes
    useReviewStore.getState().setBulkInFlight(false)
    expect(getStoreFileState().isBulkInFlight).toBe(false)
  })

  // ── P1: Override Counts ──

  it('[P1] should track overrideCounts per finding', () => {
    seedFindings(2)

    // Initially no override counts
    expect(getStoreFileState().overrideCounts.size).toBe(0)

    // Set override count for a finding
    useReviewStore.getState().setOverrideCount('f001', 2)
    useReviewStore.getState().setOverrideCount('f002', 1)

    const counts = getStoreFileState().overrideCounts
    expect(counts.get('f001')).toBe(2)
    expect(counts.get('f002')).toBe(1)
  })

  // ── P1: Reset clears bulk state ──

  it('[P1] should reset bulk state and overrideCounts on resetForFile', () => {
    seedFindings(3)

    // Populate bulk-related state
    useReviewStore.getState().setSelectionMode('bulk')
    useReviewStore.getState().toggleSelection('f001')
    useReviewStore.getState().toggleSelection('f002')
    useReviewStore.getState().setBulkInFlight(true)
    useReviewStore.getState().setOverrideCount('f001', 3)

    // Reset for new file
    useReviewStore.getState().resetForFile('new-file-id')

    const fs = getStoreFileState()
    expect(fs.selectedIds.size).toBe(0)
    expect(fs.selectionMode).toBe('single')
    expect(fs.isBulkInFlight).toBe(false)
    expect(fs.overrideCounts.size).toBe(0)
    expect(useReviewStore.getState().currentFileId).toBe('new-file-id')
  })
})
