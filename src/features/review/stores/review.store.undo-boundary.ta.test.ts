/**
 * Story 4.4b TA: UndoRedoSlice boundary value tests
 * Gaps: G-02 (at-boundary 19→20→21 explicit tests)
 * CLAUDE.md mandate: "Every AC with numeric thresholds MUST have explicit boundary tests"
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useReviewStore, selectCanUndo } from '@/features/review/stores/review.store'
import type { UndoEntry } from '@/features/review/stores/review.store'

function buildUndoEntry(overrides?: Partial<UndoEntry>): UndoEntry {
  const id = overrides?.id ?? crypto.randomUUID()
  const findingId = overrides?.findingId ?? crypto.randomUUID()
  return {
    id,
    type: 'single',
    action: 'accept',
    findingId,
    batchId: null,
    previousStates: new Map([[findingId, 'pending']]),
    newStates: new Map([[findingId, 'accepted']]),
    previousSeverity: null,
    newSeverity: null,
    findingSnapshot: null,
    description: 'Accept Finding',
    timestamp: Date.now(),
    staleFindings: new Set(),
    ...overrides,
  }
}

describe('UndoRedoSlice — Boundary Value Tests (AC6: max 20)', () => {
  beforeEach(() => {
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('test-file-boundary')
  })

  // ── TA-U06: P1 — At exactly 20 entries (boundary: max capacity) ──

  it('should hold exactly 20 entries without dropping any (TA-U06)', () => {
    for (let i = 0; i < 20; i++) {
      useReviewStore.getState().pushUndo(buildUndoEntry({ id: `e-${i}` }))
    }

    const stack = useReviewStore.getState().undoStack
    expect(stack).toHaveLength(20)
    // First pushed is still there (no drop)
    expect(stack[0]!.id).toBe('e-0')
    // Last pushed is at end
    expect(stack[19]!.id).toBe('e-19')
    expect(selectCanUndo(useReviewStore.getState())).toBe(true)
  })

  // ── TA-U07: P1 — At 19 entries, push 1 more = 20 (below boundary, no drop) ──

  it('should accept 20th entry without dropping when at 19 (TA-U07)', () => {
    for (let i = 0; i < 19; i++) {
      useReviewStore.getState().pushUndo(buildUndoEntry({ id: `e-${i}` }))
    }
    expect(useReviewStore.getState().undoStack).toHaveLength(19)

    // Push the 20th entry
    useReviewStore.getState().pushUndo(buildUndoEntry({ id: 'e-19' }))
    const stack = useReviewStore.getState().undoStack
    expect(stack).toHaveLength(20)
    // e-0 still present (not dropped)
    expect(stack[0]!.id).toBe('e-0')
    expect(stack[19]!.id).toBe('e-19')
  })

  // ── Existing U-02 extended: At 20 entries, push 1 more = drop oldest ──

  it('should drop oldest when pushing 21st entry (at+1 boundary)', () => {
    for (let i = 0; i < 20; i++) {
      useReviewStore.getState().pushUndo(buildUndoEntry({ id: `e-${i}` }))
    }
    expect(useReviewStore.getState().undoStack).toHaveLength(20)

    // Push 21st
    useReviewStore.getState().pushUndo(buildUndoEntry({ id: 'e-20' }))
    const stack = useReviewStore.getState().undoStack
    expect(stack).toHaveLength(20)
    // e-0 dropped, e-1 is now oldest
    expect(stack[0]!.id).toBe('e-1')
    expect(stack[19]!.id).toBe('e-20')
  })

  // ── Boundary: pop from stack at exactly 1 entry leaves stack empty ──

  it('should transition from canUndo=true to canUndo=false when last entry popped', () => {
    useReviewStore.getState().pushUndo(buildUndoEntry({ id: 'only' }))
    expect(selectCanUndo(useReviewStore.getState())).toBe(true)

    const popped = useReviewStore.getState().popUndo()
    expect(popped).toBeDefined()
    expect(popped?.id).toBe('only')
    expect(selectCanUndo(useReviewStore.getState())).toBe(false)
    expect(useReviewStore.getState().undoStack).toHaveLength(0)
  })

  // ── Boundary: undoFindingIndex consistency at max capacity ──

  it('should maintain undoFindingIndex consistency when dropping oldest at max capacity', () => {
    const droppedFindingId = '00000000-0000-4000-8000-000000dropped'
    // Push entry with known findingId as the first (will be dropped)
    useReviewStore.getState().pushUndo(buildUndoEntry({ id: 'e-0', findingId: droppedFindingId }))

    // Fill up to 20 with other entries
    for (let i = 1; i < 20; i++) {
      useReviewStore.getState().pushUndo(buildUndoEntry({ id: `e-${i}` }))
    }
    expect(useReviewStore.getState().undoStack).toHaveLength(20)

    // Push 21st — e-0 (with droppedFindingId) should be evicted
    useReviewStore.getState().pushUndo(buildUndoEntry({ id: 'e-20' }))

    const stack = useReviewStore.getState().undoStack
    expect(stack).toHaveLength(20)
    // Verify dropped entry's findingId is no longer in the index
    const index = useReviewStore.getState().undoFindingIndex
    const entryIdsForDropped = index.get(droppedFindingId)
    // Should either not exist or be empty (no entry references this findingId)
    expect(entryIdsForDropped === undefined || entryIdsForDropped.size === 0).toBe(true)
  })
})
