/**
 * Story 4.4a: Keyboard-related store behavior tests
 * Tests Ctrl+A (selectAllFiltered) and Escape (clearSelection + setSelectionMode)
 */
import { describe, expect, it, beforeEach } from 'vitest'

import { useReviewStore } from '@/features/review/stores/review.store'
import { buildFinding } from '@/test/factories'

function seedFindings(statuses: string[]) {
  const ids: string[] = []
  for (let i = 0; i < statuses.length; i++) {
    const id = `kbd-${i}`
    ids.push(id)
    useReviewStore
      .getState()
      .setFinding(
        id,
        buildFinding({ id, status: statuses[i] as 'pending' | 'accepted' | 'rejected' }),
      )
  }
  useReviewStore.getState().setSortedFindingIds(ids)
  return ids
}

describe('useReviewStore — Keyboard Bulk Operations (Story 4.4a)', () => {
  beforeEach(() => {
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('kbd-test')
  })

  // ── Ctrl+A: selectAllFiltered ──

  it('[P0] Ctrl+A should select all findings when no filter active', () => {
    seedFindings(['pending', 'accepted', 'rejected'])
    // Clear default status=pending filter (Story 4.5: default is now status='pending')
    useReviewStore.getState().setFilter('status', null)

    useReviewStore.getState().selectAllFiltered()

    const { selectedIds, selectionMode } = useReviewStore.getState()
    expect(selectedIds.size).toBe(3)
    expect(selectionMode).toBe('bulk')
  })

  it('[P0] Ctrl+A should select only filtered findings when status filter active', () => {
    seedFindings(['pending', 'accepted', 'pending', 'rejected'])
    useReviewStore.getState().setFilter('status', 'pending')

    useReviewStore.getState().selectAllFiltered()

    const { selectedIds } = useReviewStore.getState()
    expect(selectedIds.size).toBe(2)
    expect(selectedIds.has('kbd-0')).toBe(true)
    expect(selectedIds.has('kbd-2')).toBe(true)
    expect(selectedIds.has('kbd-1')).toBe(false) // accepted
  })

  // ── Escape: clear selection ──

  it('[P0] Escape should clear selection and return to single mode', () => {
    seedFindings(['pending', 'pending', 'pending'])
    // Enter bulk mode with selections
    useReviewStore.getState().setSelectionMode('bulk')
    useReviewStore.getState().addToSelection('kbd-0')
    useReviewStore.getState().addToSelection('kbd-1')
    expect(useReviewStore.getState().selectedIds.size).toBe(2)

    // Simulate Escape handler
    const state = useReviewStore.getState()
    state.clearSelection()
    state.setSelectionMode('single')

    const after = useReviewStore.getState()
    expect(after.selectedIds.size).toBe(0)
    expect(after.selectionMode).toBe('single')
  })

  it('[P1] Escape should no-op when not in bulk mode', () => {
    seedFindings(['pending'])
    // single mode, no selection
    const state = useReviewStore.getState()
    expect(state.selectionMode).toBe('single')
    expect(state.selectedIds.size).toBe(0)

    // clearSelection + setSelectionMode should be safe no-op
    state.clearSelection()
    state.setSelectionMode('single')

    expect(useReviewStore.getState().selectionMode).toBe('single')
    expect(useReviewStore.getState().selectedIds.size).toBe(0)
  })
})
