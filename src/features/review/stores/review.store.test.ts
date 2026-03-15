/**
 * ATDD Tests — Story 3.0: Score & Review Infrastructure
 * AC1: Zustand Review Store (`useReviewStore`)
 * + Story 4.4b: UndoRedoSlice
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { useReviewStore, selectCanUndo, selectCanRedo } from '@/features/review/stores/review.store'
import type { UndoEntry } from '@/features/review/stores/review.store'
import { buildFinding } from '@/test/factories'

/** Helper: create a minimal UndoEntry for testing */
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

describe('useReviewStore', () => {
  beforeEach(() => {
    useReviewStore.getState().resetForFile('test-file-id')
  })

  // ── P0: Findings Slice ──

  it('should initialize with empty findingsMap', () => {
    const state = useReviewStore.getState()
    expect(state.findingsMap).toBeInstanceOf(Map)
    expect(state.findingsMap.size).toBe(0)
  })

  it('should add finding to findingsMap via setFinding', () => {
    const finding = buildFinding({ id: 'f1' })
    useReviewStore.getState().setFinding('f1', finding)
    expect(useReviewStore.getState().findingsMap.get('f1')).toEqual(finding)
  })

  it('should remove finding from findingsMap via removeFinding', () => {
    useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1' }))
    useReviewStore.getState().removeFinding('f1')
    expect(useReviewStore.getState().findingsMap.has('f1')).toBe(false)
  })

  it('should update filterState via setFilter', () => {
    useReviewStore.getState().setFilter({ severity: 'major', status: null, layer: 'L1' })
    expect(useReviewStore.getState().filterState.severity).toBe('major')
    expect(useReviewStore.getState().filterState.layer).toBe('L1')
  })

  // ── P0: Score Slice ──

  it('should update score and status via updateScore', () => {
    useReviewStore.getState().updateScore(85, 'calculated')
    const state = useReviewStore.getState()
    expect(state.currentScore).toBe(85)
    expect(state.scoreStatus).toBe('calculated')
    expect(state.isRecalculating).toBe(false)
  })

  it('should set isRecalculating=true and scoreStatus=calculating via setRecalculating', () => {
    useReviewStore.getState().setRecalculating()
    const state = useReviewStore.getState()
    expect(state.isRecalculating).toBe(true)
    expect(state.scoreStatus).toBe('calculating')
  })

  // ── P0: Selection Slice ──

  it('should add id to selectedIds via toggleSelection', () => {
    useReviewStore.getState().toggleSelection('f1')
    expect(useReviewStore.getState().selectedIds.has('f1')).toBe(true)
  })

  it('should remove id from selectedIds when already selected', () => {
    useReviewStore.getState().toggleSelection('f1')
    useReviewStore.getState().toggleSelection('f1')
    expect(useReviewStore.getState().selectedIds.has('f1')).toBe(false)
  })

  // ── P0: File Reset ──

  it('should clear ALL state on resetForFile', () => {
    // Populate state first
    useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1' }))
    useReviewStore.getState().updateScore(85, 'calculated')
    useReviewStore.getState().toggleSelection('f1')
    useReviewStore.getState().setSelectionMode('bulk')

    useReviewStore.getState().resetForFile('new-file-id')

    const state = useReviewStore.getState()
    expect(state.findingsMap.size).toBe(0)
    expect(state.currentScore).toBeNull()
    expect(state.scoreStatus).toBe('na')
    expect(state.isRecalculating).toBe(false)
    expect(state.selectedIds.size).toBe(0)
    expect(state.selectedId).toBeNull()
    expect(state.selectionMode).toBe('single')
    expect(state.currentFileId).toBe('new-file-id')
  })

  // ── P1: Extended State ──

  it('should update selectedId via setSelectedFinding', () => {
    useReviewStore.getState().setSelectedFinding('f1')
    expect(useReviewStore.getState().selectedId).toBe('f1')
  })

  it('should toggle selectionMode between single and bulk', () => {
    expect(useReviewStore.getState().selectionMode).toBe('single')
    useReviewStore.getState().setSelectionMode('bulk')
    expect(useReviewStore.getState().selectionMode).toBe('bulk')
  })

  it('should clear selectedIds when switching from bulk to single mode', () => {
    useReviewStore.getState().setSelectionMode('bulk')
    useReviewStore.getState().toggleSelection('f1')
    useReviewStore.getState().toggleSelection('f2')
    useReviewStore.getState().setSelectionMode('single')
    expect(useReviewStore.getState().selectedIds.size).toBe(0)
  })

  // ── P1-BV: Boundary Values ──

  it('should reset findingsMap with exactly 1 finding to empty', () => {
    useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1' }))
    expect(useReviewStore.getState().findingsMap.size).toBe(1)

    useReviewStore.getState().resetForFile('new-file')
    expect(useReviewStore.getState().findingsMap.size).toBe(0)
  })

  it('should reset non-null score back to null', () => {
    useReviewStore.getState().updateScore(92, 'calculated')
    expect(useReviewStore.getState().currentScore).toBe(92)

    useReviewStore.getState().resetForFile('new-file')
    expect(useReviewStore.getState().currentScore).toBeNull()
  })

  it('should handle updateScore with score=100 (0 contributing findings)', () => {
    useReviewStore.getState().updateScore(100, 'calculated')
    expect(useReviewStore.getState().currentScore).toBe(100)
  })

  // ── P1: Batch Setters ──

  it('should replace entire findingsMap via setFindings (batch)', () => {
    // Pre-populate with a finding
    useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1' }))

    // Batch replace
    const batchMap = new Map<string, ReturnType<typeof buildFinding>>()
    batchMap.set('f2', buildFinding({ id: 'f2' }))
    batchMap.set('f3', buildFinding({ id: 'f3' }))
    useReviewStore.getState().setFindings(batchMap)

    const state = useReviewStore.getState()
    expect(state.findingsMap.size).toBe(2)
    expect(state.findingsMap.has('f1')).toBe(false)
    expect(state.findingsMap.has('f2')).toBe(true)
    expect(state.findingsMap.has('f3')).toBe(true)
  })

  it('should replace entire selectedIds via setSelections (batch)', () => {
    useReviewStore.getState().toggleSelection('f1')

    const batchSet = new Set(['f2', 'f3', 'f4'])
    useReviewStore.getState().setSelections(batchSet)

    const state = useReviewStore.getState()
    expect(state.selectedIds.size).toBe(3)
    expect(state.selectedIds.has('f1')).toBe(false)
    expect(state.selectedIds.has('f2')).toBe(true)
  })

  // ── P1: currentFileId ──

  it('should store currentFileId on resetForFile', () => {
    useReviewStore.getState().resetForFile('new-file-id')
    expect(useReviewStore.getState().currentFileId).toBe('new-file-id')
  })

  it('should track currentFileId across multiple resetForFile calls', () => {
    // beforeEach sets currentFileId to 'test-file-id'
    expect(useReviewStore.getState().currentFileId).toBe('test-file-id')

    useReviewStore.getState().resetForFile('second-file')
    expect(useReviewStore.getState().currentFileId).toBe('second-file')

    useReviewStore.getState().resetForFile('third-file')
    expect(useReviewStore.getState().currentFileId).toBe('third-file')
  })

  // ── TA: Coverage Gap Tests ──

  // F4 [P1]: explicit null clears layerCompleted (vs undefined which preserves)
  it('[P1] should clear layerCompleted when updateScore called with explicit null', () => {
    useReviewStore.getState().updateScore(85, 'calculated', 'L1L2')
    expect(useReviewStore.getState().layerCompleted).toBe('L1L2')

    useReviewStore.getState().updateScore(90, 'calculated', null)
    expect(useReviewStore.getState().layerCompleted).toBeNull()
  })

  // F1 [P2]: setFinding overwrites existing finding with same key
  it('[P2] should overwrite existing finding when setFinding called with same key', () => {
    const original = buildFinding({ id: 'f1', severity: 'minor' })
    const updated = buildFinding({ id: 'f1', severity: 'critical' })
    useReviewStore.getState().setFinding('f1', original)
    useReviewStore.getState().setFinding('f1', updated)

    expect(useReviewStore.getState().findingsMap.size).toBe(1)
    expect(useReviewStore.getState().findingsMap.get('f1')).toEqual(updated)
  })

  // F2 [P2]: removeFinding on non-existent ID is safe no-op
  it('[P2] should be a safe no-op when removeFinding called with non-existent ID', () => {
    useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1' }))
    useReviewStore.getState().removeFinding('non-existent')

    expect(useReviewStore.getState().findingsMap.size).toBe(1)
    expect(useReviewStore.getState().findingsMap.has('f1')).toBe(true)
  })

  // F3 [P2]: clearSelection empties selectedIds
  it('[P2] should empty selectedIds via clearSelection', () => {
    useReviewStore.getState().toggleSelection('f1')
    useReviewStore.getState().toggleSelection('f2')
    expect(useReviewStore.getState().selectedIds.size).toBe(2)

    useReviewStore.getState().clearSelection()
    expect(useReviewStore.getState().selectedIds.size).toBe(0)
  })

  // F5 [P2]: single→single doesn't clear selectedIds
  it('[P2] should not clear selectedIds when setSelectionMode single to single', () => {
    useReviewStore.getState().toggleSelection('f1')
    useReviewStore.getState().setSelectionMode('single')

    expect(useReviewStore.getState().selectedIds.has('f1')).toBe(true)
  })

  it('[P2] should preserve existing layerCompleted when updateScore called without layerCompleted arg', () => {
    // Set layerCompleted via 3-arg call
    useReviewStore.getState().updateScore(85, 'calculated', 'L1L2')
    expect(useReviewStore.getState().layerCompleted).toBe('L1L2')

    // Update score without layerCompleted (2-arg call) — should NOT clear existing
    useReviewStore.getState().updateScore(90, 'calculated')
    expect(useReviewStore.getState().currentScore).toBe(90)
    expect(useReviewStore.getState().layerCompleted).toBe('L1L2')
  })

  // B10 [P2]: setFindings with empty Map clears all findings
  it('[P2] should clear all findings when setFindings called with empty Map', () => {
    useReviewStore.getState().setFinding('f1', buildFinding({ id: 'f1' }))
    useReviewStore.getState().setFinding('f2', buildFinding({ id: 'f2' }))
    expect(useReviewStore.getState().findingsMap.size).toBe(2)

    useReviewStore.getState().setFindings(new Map())
    expect(useReviewStore.getState().findingsMap.size).toBe(0)
  })

  // ── Story 3.2c AC6: layerCompleted tracking ──

  it('[P0] should update layerCompleted field via updateScore(score, status, layerCompleted)', () => {
    useReviewStore.getState().updateScore(85, 'calculated', 'L1L2')
    const state = useReviewStore.getState()
    expect(state.currentScore).toBe(85)
    expect(state.scoreStatus).toBe('calculated')
    expect(state.layerCompleted).toBe('L1L2')
  })

  it('[P0] should have layerCompleted field that defaults to null', () => {
    const state = useReviewStore.getState()
    expect(state.layerCompleted).toBeNull()
  })

  it('[P1] should reset layerCompleted to null via resetForFile()', () => {
    // Set layerCompleted first
    useReviewStore.getState().updateScore(90, 'calculated', 'L1L2L3')
    expect(useReviewStore.getState().layerCompleted).toBe('L1L2L3')

    // Reset should clear it
    useReviewStore.getState().resetForFile('new-file')
    expect(useReviewStore.getState().layerCompleted).toBeNull()
  })

  // ══════════════════════════════════════════════════════════════
  // Story 4.4b ATDD: UndoRedoSlice
  // ══════════════════════════════════════════════════════════════

  // ── P0: AC6 — Push/Pop LIFO (U-01) ──

  it('should push undo entry and maintain LIFO order (U-01)', () => {
    const e1 = buildUndoEntry({ id: 'e1', description: 'first' })
    const e2 = buildUndoEntry({ id: 'e2', description: 'second' })
    const e3 = buildUndoEntry({ id: 'e3', description: 'third' })
    useReviewStore.getState().pushUndo(e1)
    useReviewStore.getState().pushUndo(e2)
    useReviewStore.getState().pushUndo(e3)
    expect(useReviewStore.getState().undoStack).toHaveLength(3)
    const popped = useReviewStore.getState().popUndo()
    expect(popped?.id).toBe('e3')
    const popped2 = useReviewStore.getState().popUndo()
    expect(popped2?.id).toBe('e2')
  })

  // ── P0: AC6 — Boundary: max 20 (U-02) ──

  it('should drop oldest entry when stack exceeds 20 (U-02)', () => {
    for (let i = 0; i < 21; i++) {
      useReviewStore.getState().pushUndo(buildUndoEntry({ id: `e-${i}` }))
    }
    const stack = useReviewStore.getState().undoStack
    expect(stack).toHaveLength(20)
    // Oldest (e-0) should be dropped
    expect(stack[0]!.id).toBe('e-1')
    expect(stack[19]!.id).toBe('e-20')
  })

  // ── P0: AC6 — Boundary: empty stack (U-03) ──

  it('should return undefined when popping empty undo stack (U-03)', () => {
    const result = useReviewStore.getState().popUndo()
    expect(result).toBeUndefined()
  })

  // ── P1: AC6 — Boundary: single entry (U-04) ──

  it('should pop single entry leaving empty stack (U-04)', () => {
    const entry = buildUndoEntry({ id: 'only' })
    useReviewStore.getState().pushUndo(entry)
    const popped = useReviewStore.getState().popUndo()
    expect(popped?.id).toBe('only')
    expect(useReviewStore.getState().undoStack).toHaveLength(0)
    expect(selectCanUndo(useReviewStore.getState())).toBe(false)
  })

  // ── P0: AC6 — Clear on file switch (U-05) ──

  it('should clear undo and redo stacks on resetForFile (U-05)', () => {
    useReviewStore.getState().pushUndo(buildUndoEntry())
    useReviewStore.getState().pushRedo(buildUndoEntry())
    expect(useReviewStore.getState().undoStack).toHaveLength(1)
    expect(useReviewStore.getState().redoStack).toHaveLength(1)
    useReviewStore.getState().resetForFile('new-file')
    expect(useReviewStore.getState().undoStack).toHaveLength(0)
    expect(useReviewStore.getState().redoStack).toHaveLength(0)
    expect(useReviewStore.getState().undoFindingIndex.size).toBe(0)
  })

  // ── P0: AC6 — Redo clears on new action (U-06) ──

  it('should clear redo stack when pushUndo is called (U-06)', () => {
    useReviewStore.getState().pushRedo(buildUndoEntry())
    useReviewStore.getState().pushRedo(buildUndoEntry())
    expect(useReviewStore.getState().redoStack).toHaveLength(2)
    useReviewStore.getState().pushUndo(buildUndoEntry())
    expect(useReviewStore.getState().redoStack).toHaveLength(0)
  })

  // ── P0: AC7 — Mark stale single (U-07) ──

  it('should mark entry stale per-finding for single entry (U-07)', () => {
    const fId = 'finding-1'
    const entry = buildUndoEntry({ findingId: fId })
    useReviewStore.getState().pushUndo(entry)
    useReviewStore.getState().markEntryStale(fId)
    const stack = useReviewStore.getState().undoStack
    expect(stack[0]!.staleFindings.has(fId)).toBe(true)
  })

  // ── P1: AC7 — Mark stale bulk partial (U-08) ──

  it('should mark stale per-finding in bulk entry without marking entire batch (U-08)', () => {
    const f1 = 'finding-a'
    const f2 = 'finding-b'
    const f3 = 'finding-c'
    const entry = buildUndoEntry({
      type: 'bulk',
      findingId: null,
      batchId: 'batch-1',
      previousStates: new Map([
        [f1, 'pending'],
        [f2, 'pending'],
        [f3, 'pending'],
      ]),
      newStates: new Map([
        [f1, 'accepted'],
        [f2, 'accepted'],
        [f3, 'accepted'],
      ]),
    })
    useReviewStore.getState().pushUndo(entry)
    useReviewStore.getState().markEntryStale(f2)
    const stack = useReviewStore.getState().undoStack
    expect(stack[0]!.staleFindings.has(f2)).toBe(true)
    expect(stack[0]!.staleFindings.has(f1)).toBe(false)
    expect(stack[0]!.staleFindings.has(f3)).toBe(false)
  })

  // ── P1: AC7 — Remove entries for deleted finding (U-09) ──

  it('should remove entries for finding from both undo and redo stacks (U-09)', () => {
    const targetId = 'finding-to-remove'
    const keepId = 'finding-to-keep'
    // Single entry referencing target → should be removed
    useReviewStore.getState().pushUndo(buildUndoEntry({ id: 'e1', findingId: targetId }))
    // Single entry referencing other → should stay
    useReviewStore.getState().pushUndo(buildUndoEntry({ id: 'e2', findingId: keepId }))
    // Also add to redo stack
    useReviewStore.getState().pushRedo(buildUndoEntry({ id: 'r1', findingId: targetId }))
    useReviewStore.getState().pushRedo(buildUndoEntry({ id: 'r2', findingId: keepId }))

    useReviewStore.getState().removeEntriesForFinding(targetId)

    expect(useReviewStore.getState().undoStack).toHaveLength(1)
    expect(useReviewStore.getState().undoStack[0]!.id).toBe('e2')
    expect(useReviewStore.getState().redoStack).toHaveLength(1)
    expect(useReviewStore.getState().redoStack[0]!.id).toBe('r2')
  })

  // ── P1: AC6 — Selectors (U-10) ──

  it('should return correct canUndo/canRedo via selector functions (U-10)', () => {
    expect(selectCanUndo(useReviewStore.getState())).toBe(false)
    expect(selectCanRedo(useReviewStore.getState())).toBe(false)
    useReviewStore.getState().pushUndo(buildUndoEntry())
    expect(selectCanUndo(useReviewStore.getState())).toBe(true)
    expect(selectCanRedo(useReviewStore.getState())).toBe(false)
    useReviewStore.getState().pushRedo(buildUndoEntry())
    expect(selectCanRedo(useReviewStore.getState())).toBe(true)
  })
})
