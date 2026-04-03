/**
 * Branch coverage expansion for use-undo-redo hook.
 * Covers: empty stacks, forceUndo paths, error catch blocks, redo edge cases,
 * missing findingId/states guards, severity override CONFLICT, undo-delete FK_VIOLATION,
 * bulk partial conflicts, redo-bulk conflicts, redo-add without snapshot, redo-delete failure.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ──
const {
  mockUndoAction,
  mockUndoBulkAction,
  mockUndoSeverityOverride,
  mockUndoAddFinding,
  mockUndoDeleteFinding,
  mockRedoAction,
  mockRedoBulkAction,
  mockAddFinding,
  mockDeleteFinding,
  mockOverrideSeverity,
  mockToast,
  mockAnnounce,
  store,
} = vi.hoisted(() => {
  type AnyMap = Map<string, unknown>
  const s = {
    undoStack: [] as unknown[],
    redoStack: [] as unknown[],
    findingsMap: new Map() as AnyMap,
    reinsertedEntries: [] as unknown[],
  }
  return {
    mockUndoAction: vi.fn(),
    mockUndoBulkAction: vi.fn(),
    mockUndoSeverityOverride: vi.fn(),
    mockUndoAddFinding: vi.fn(),
    mockUndoDeleteFinding: vi.fn(),
    mockRedoAction: vi.fn(),
    mockRedoBulkAction: vi.fn(),
    mockAddFinding: vi.fn(),
    mockDeleteFinding: vi.fn(),
    mockOverrideSeverity: vi.fn(),
    mockToast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    mockAnnounce: vi.fn(),
    store: s,
  }
})

vi.mock('sonner', () => ({ toast: mockToast }))
vi.mock('@/features/review/utils/announce', () => ({
  announce: (...a: unknown[]) => mockAnnounce(...a),
}))
vi.mock('@/features/review/stores/review.store', () => ({
  useReviewStore: {
    getState: () => ({
      undoStack: store.undoStack,
      redoStack: store.redoStack,
      findingsMap: store.findingsMap,
      popUndo: () => store.undoStack.pop() ?? undefined,
      popRedo: () => store.redoStack.pop() ?? undefined,
      pushUndo: (e: unknown) => store.undoStack.push(e),
      pushRedo: (e: unknown) => store.redoStack.push(e),
      reinsertUndo: (e: unknown) => {
        store.undoStack.push(e)
        store.reinsertedEntries.push(e)
      },
      setFinding: (id: string, f: unknown) => store.findingsMap.set(id, f),
      removeFinding: (id: string) => store.findingsMap.delete(id),
    }),
  },
  getStoreFileState: (_storeRef: unknown, _fileId: string) => ({
    findingsMap: store.findingsMap,
  }),
}))
vi.mock('@/features/review/actions/undoAction.action', () => ({
  undoAction: (...a: unknown[]) => mockUndoAction(...a),
}))
vi.mock('@/features/review/actions/undoBulkAction.action', () => ({
  undoBulkAction: (...a: unknown[]) => mockUndoBulkAction(...a),
}))
vi.mock('@/features/review/actions/undoSeverityOverride.action', () => ({
  undoSeverityOverride: (...a: unknown[]) => mockUndoSeverityOverride(...a),
}))
vi.mock('@/features/review/actions/undoAddFinding.action', () => ({
  undoAddFinding: (...a: unknown[]) => mockUndoAddFinding(...a),
}))
vi.mock('@/features/review/actions/undoDeleteFinding.action', () => ({
  undoDeleteFinding: (...a: unknown[]) => mockUndoDeleteFinding(...a),
}))
vi.mock('@/features/review/actions/redoAction.action', () => ({
  redoAction: (...a: unknown[]) => mockRedoAction(...a),
}))
vi.mock('@/features/review/actions/redoBulkAction.action', () => ({
  redoBulkAction: (...a: unknown[]) => mockRedoBulkAction(...a),
}))
vi.mock('@/features/review/actions/addFinding.action', () => ({
  addFinding: (...a: unknown[]) => mockAddFinding(...a),
}))
vi.mock('@/features/review/actions/deleteFinding.action', () => ({
  deleteFinding: (...a: unknown[]) => mockDeleteFinding(...a),
}))
vi.mock('@/features/review/actions/overrideSeverity.action', () => ({
  overrideSeverity: (...a: unknown[]) => mockOverrideSeverity(...a),
}))

import { useUndoRedo } from '@/features/review/hooks/use-undo-redo'
import type { UndoEntry, FindingSnapshot } from '@/features/review/stores/review.store'

const FILE_ID = '00000000-0000-4000-8000-000000000001'
const PROJECT_ID = '00000000-0000-4000-8000-000000000002'
const FINDING_ID = '00000000-0000-4000-8000-000000000003'

function makeFinding(overrides?: Record<string, unknown>) {
  return {
    id: FINDING_ID,
    severity: 'major',
    originalSeverity: null,
    status: 'pending',
    category: 'accuracy',
    description: 'Test',
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function buildTestEntry(overrides?: Partial<UndoEntry>): UndoEntry {
  const findingId = overrides?.findingId ?? FINDING_ID
  return {
    id: crypto.randomUUID(),
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

function buildSnapshot(overrides?: Partial<FindingSnapshot>): FindingSnapshot {
  return {
    id: FINDING_ID,
    segmentId: '00000000-0000-4000-8000-000000000010',
    fileId: FILE_ID,
    projectId: PROJECT_ID,
    tenantId: '00000000-0000-4000-8000-000000000099',
    reviewSessionId: null,
    status: 'manual',
    severity: 'major',
    originalSeverity: null,
    category: 'accuracy',
    description: 'Test finding',
    detectedByLayer: 'Manual',
    aiModel: null,
    aiConfidence: null,
    suggestedFix: null,
    sourceTextExcerpt: null,
    targetTextExcerpt: null,
    scope: 'per-file',
    relatedFileIds: null,
    segmentCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('useUndoRedo — branch coverage', () => {
  const onConflict = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    store.undoStack = []
    store.redoStack = []
    store.findingsMap = new Map()
    store.reinsertedEntries = []
  })

  // ── Undo: empty stack ──
  it('should no-op when undo stack is empty', async () => {
    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())
    expect(mockUndoAction).not.toHaveBeenCalled()
    expect(mockToast.error).not.toHaveBeenCalled()
  })

  // ── Redo: empty stack ──
  it('should no-op when redo stack is empty', async () => {
    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())
    expect(mockRedoAction).not.toHaveBeenCalled()
    expect(mockToast.error).not.toHaveBeenCalled()
  })

  // ── Undo severity override: CONFLICT code ──
  it('should call onConflict when severity override returns CONFLICT', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ severity: 'minor' }))
    const entry = buildTestEntry({
      action: 'severity_override',
      previousSeverity: { severity: 'major', originalSeverity: null },
      newSeverity: 'minor',
    })
    store.undoStack.push(entry)

    mockUndoSeverityOverride.mockResolvedValueOnce({
      success: false,
      code: 'CONFLICT',
      error: 'Conflict detected',
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(onConflict).toHaveBeenCalledWith(entry, FINDING_ID, 'minor')
    expect(store.reinsertedEntries).toHaveLength(1)
  })

  // ── Undo severity override: non-CONFLICT error ──
  it('should toast error when severity override fails with non-CONFLICT code', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ severity: 'minor' }))
    store.undoStack.push(
      buildTestEntry({
        action: 'severity_override',
        previousSeverity: { severity: 'major', originalSeverity: null },
        newSeverity: 'minor',
      }),
    )

    mockUndoSeverityOverride.mockResolvedValueOnce({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Server error',
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.error).toHaveBeenCalledWith('Undo failed: Server error')
    expect(onConflict).not.toHaveBeenCalled()
  })

  // ── Undo add finding: failure ──
  it('should reinsert entry and toast error when undoAddFinding fails', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding())
    store.undoStack.push(buildTestEntry({ action: 'add' }))

    mockUndoAddFinding.mockResolvedValueOnce({ success: false, error: 'Not found' })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.error).toHaveBeenCalledWith('Undo failed: Not found')
    expect(store.reinsertedEntries).toHaveLength(1)
  })

  // ── Undo delete: FK_VIOLATION permanent failure ──
  it('should discard entry on FK_VIOLATION without reinserting', async () => {
    const snapshot = buildSnapshot()
    store.undoStack.push(buildTestEntry({ action: 'delete', findingSnapshot: snapshot }))

    mockUndoDeleteFinding.mockResolvedValueOnce({
      success: false,
      code: 'FK_VIOLATION',
      error: 'Segment no longer exists',
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.error).toHaveBeenCalledWith('Segment no longer exists')
    expect(store.reinsertedEntries).toHaveLength(0)
  })

  // ── Undo delete: SEGMENT_DELETED permanent failure ──
  it('should discard entry on SEGMENT_DELETED without reinserting', async () => {
    const snapshot = buildSnapshot()
    store.undoStack.push(buildTestEntry({ action: 'delete', findingSnapshot: snapshot }))

    mockUndoDeleteFinding.mockResolvedValueOnce({
      success: false,
      code: 'SEGMENT_DELETED',
      error: 'Segment deleted',
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.error).toHaveBeenCalledWith('Segment deleted')
    expect(store.reinsertedEntries).toHaveLength(0)
  })

  // ── Undo delete: generic failure reinserts ──
  it('should reinsert entry when undoDeleteFinding fails with generic error', async () => {
    const snapshot = buildSnapshot()
    store.undoStack.push(buildTestEntry({ action: 'delete', findingSnapshot: snapshot }))

    mockUndoDeleteFinding.mockResolvedValueOnce({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'DB error',
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.error).toHaveBeenCalledWith('Undo failed: DB error')
    expect(store.reinsertedEntries).toHaveLength(1)
  })

  // ── Undo bulk: partial conflicts ──
  it('should show partial undo warning when bulk has some conflicts', async () => {
    const f1 = '00000000-0000-4000-8000-000000000011'
    const f2 = '00000000-0000-4000-8000-000000000012'
    store.findingsMap.set(f1, makeFinding({ id: f1, status: 'accepted' }))
    store.findingsMap.set(f2, makeFinding({ id: f2, status: 'accepted' }))

    store.undoStack.push(
      buildTestEntry({
        type: 'bulk',
        findingId: null,
        batchId: 'batch-partial',
        previousStates: new Map([
          [f1, 'pending'],
          [f2, 'pending'],
        ]),
        newStates: new Map([
          [f1, 'accepted'],
          [f2, 'accepted'],
        ]),
      }),
    )

    mockUndoBulkAction.mockResolvedValueOnce({
      success: true,
      data: { reverted: [f1], conflicted: [f2] },
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.warning).toHaveBeenCalledWith(expect.stringContaining('1/2'))
    // Redo entry should only contain reverted findings
    expect(store.redoStack).toHaveLength(1)
    const redoEntry = store.redoStack[0] as UndoEntry
    expect(redoEntry.previousStates.has(f1)).toBe(true)
    expect(redoEntry.previousStates.has(f2)).toBe(false)
  })

  // ── Undo bulk: ALL conflicts (server-side) ──
  it('should show cancelled warning when bulk server returns all conflicted', async () => {
    const f1 = '00000000-0000-4000-8000-000000000011'
    store.findingsMap.set(f1, makeFinding({ id: f1, status: 'accepted' }))

    store.undoStack.push(
      buildTestEntry({
        type: 'bulk',
        findingId: null,
        batchId: 'batch-allconf',
        previousStates: new Map([[f1, 'pending']]),
        newStates: new Map([[f1, 'accepted']]),
      }),
    )

    mockUndoBulkAction.mockResolvedValueOnce({
      success: true,
      data: { reverted: [], conflicted: [f1] },
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.warning).toHaveBeenCalledWith(expect.stringContaining('modified'))
    // Should NOT push empty redo entry
    expect(store.redoStack).toHaveLength(0)
  })

  // ── Undo bulk: failure reinserts ──
  it('should reinsert entry when undoBulkAction fails', async () => {
    const f1 = '00000000-0000-4000-8000-000000000011'
    store.findingsMap.set(f1, makeFinding({ id: f1, status: 'accepted' }))

    store.undoStack.push(
      buildTestEntry({
        type: 'bulk',
        findingId: null,
        batchId: 'batch-fail',
        previousStates: new Map([[f1, 'pending']]),
        newStates: new Map([[f1, 'accepted']]),
      }),
    )

    mockUndoBulkAction.mockResolvedValueOnce({ success: false, error: 'Server error' })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.error).toHaveBeenCalledWith('Undo failed: Server error')
    expect(store.reinsertedEntries).toHaveLength(1)
  })

  // ── Undo: default single — missing findingId reinserts ──
  it('should reinsert entry when default single undo has no findingId', async () => {
    store.undoStack.push(
      buildTestEntry({
        action: 'accept',
        findingId: null,
        previousStates: new Map(),
        newStates: new Map(),
      }),
    )

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockUndoAction).not.toHaveBeenCalled()
    expect(store.reinsertedEntries).toHaveLength(1)
  })

  // ── Undo: default single — missing prevState/expectedState reinserts ──
  it('should reinsert entry when previousStates or newStates are missing for findingId', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding())
    store.undoStack.push(
      buildTestEntry({
        action: 'accept',
        previousStates: new Map(),
        newStates: new Map(),
      }),
    )

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockUndoAction).not.toHaveBeenCalled()
    expect(store.reinsertedEntries).toHaveLength(1)
  })

  // ── Undo: default single — CONFLICT error path ──
  it('should call onConflict when single undo returns CONFLICT', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ status: 'accepted' }))
    const entry = buildTestEntry()
    store.undoStack.push(entry)

    mockUndoAction.mockResolvedValueOnce({
      success: false,
      code: 'CONFLICT',
      error: 'Conflict',
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(onConflict).toHaveBeenCalledWith(entry, FINDING_ID, 'accepted')
  })

  // ── Undo: default single — non-CONFLICT error reinserts ──
  it('should reinsert and toast error when single undo fails with non-CONFLICT', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ status: 'accepted' }))
    store.undoStack.push(buildTestEntry())

    mockUndoAction.mockResolvedValueOnce({
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Internal error',
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.error).toHaveBeenCalledWith('Undo failed: Internal error')
    expect(store.reinsertedEntries).toHaveLength(1)
  })

  // ── Undo: default single — finding not in store (no optimistic rollback) ──
  it('should proceed without optimistic update when finding not in store', async () => {
    // Finding NOT in store
    store.undoStack.push(buildTestEntry())

    mockUndoAction.mockResolvedValueOnce({
      success: true,
      data: { serverUpdatedAt: '2026-03-18T12:00:00Z' },
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('Undone'))
    expect(store.redoStack).toHaveLength(1)
  })

  // ── Undo: catch block (unexpected throw) ──
  it('should toast error and reinsert on unexpected throw during undo', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ status: 'accepted' }))
    store.undoStack.push(buildTestEntry())

    mockUndoAction.mockRejectedValueOnce(new Error('Network failure'))

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.error).toHaveBeenCalledWith('Undo failed unexpectedly')
    expect(store.reinsertedEntries).toHaveLength(1)
  })

  // ── Redo: severity override success ──
  it('should redo severity override and update store', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ severity: 'major', originalSeverity: null }))
    store.redoStack.push(
      buildTestEntry({
        action: 'severity_override',
        previousSeverity: { severity: 'major', originalSeverity: null },
        newSeverity: 'minor',
      }),
    )

    mockOverrideSeverity.mockResolvedValueOnce({
      success: true,
      data: { serverUpdatedAt: '2026-03-18T12:00:00Z' },
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockOverrideSeverity).toHaveBeenCalled()
    expect(store.undoStack).toHaveLength(1)
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('Redone'))
  })

  // ── Redo: severity override failure ──
  it('should push back to redo stack when severity override redo fails', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding())
    store.redoStack.push(
      buildTestEntry({
        action: 'severity_override',
        previousSeverity: { severity: 'major', originalSeverity: null },
        newSeverity: 'minor',
      }),
    )

    mockOverrideSeverity.mockResolvedValueOnce({ success: false, error: 'Failed' })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockToast.error).toHaveBeenCalledWith('Redo failed: Failed')
    expect(store.redoStack).toHaveLength(1)
  })

  // ── Redo: add without snapshot ──
  it('should toast error and push back when redo-add has no snapshot', async () => {
    store.redoStack.push(buildTestEntry({ action: 'add', findingSnapshot: null }))

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockToast.error).toHaveBeenCalledWith('Redo failed: missing finding data')
    expect(store.redoStack).toHaveLength(1)
  })

  // ── Redo: add failure ──
  it('should push back to redo stack when addFinding fails', async () => {
    store.redoStack.push(buildTestEntry({ action: 'add', findingSnapshot: buildSnapshot() }))

    mockAddFinding.mockResolvedValueOnce({ success: false, error: 'Segment gone' })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockToast.error).toHaveBeenCalledWith('Redo failed: Segment gone')
    expect(store.redoStack).toHaveLength(1)
  })

  // ── Redo: delete success ──
  it('should redo delete finding and remove from store', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding())
    store.redoStack.push(buildTestEntry({ action: 'delete', findingSnapshot: buildSnapshot() }))

    mockDeleteFinding.mockResolvedValueOnce({ success: true, data: {} })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(store.findingsMap.has(FINDING_ID)).toBe(false)
    expect(store.undoStack).toHaveLength(1)
  })

  // ── Redo: delete failure ──
  it('should push back to redo stack when deleteFinding fails', async () => {
    store.redoStack.push(buildTestEntry({ action: 'delete' }))

    mockDeleteFinding.mockResolvedValueOnce({ success: false, error: 'Not found' })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockToast.error).toHaveBeenCalledWith('Redo failed: Not found')
    expect(store.redoStack).toHaveLength(1)
  })

  // ── Redo: bulk with partial conflicts ──
  it('should show partial redo warning when bulk redo has conflicts', async () => {
    const f1 = '00000000-0000-4000-8000-000000000011'
    const f2 = '00000000-0000-4000-8000-000000000012'
    store.findingsMap.set(f1, makeFinding({ id: f1, status: 'pending' }))
    store.findingsMap.set(f2, makeFinding({ id: f2, status: 'pending' }))

    store.redoStack.push(
      buildTestEntry({
        type: 'bulk',
        findingId: null,
        batchId: 'batch-redo-partial',
        previousStates: new Map([
          [f1, 'pending'],
          [f2, 'pending'],
        ]),
        newStates: new Map([
          [f1, 'accepted'],
          [f2, 'accepted'],
        ]),
      }),
    )

    mockRedoBulkAction.mockResolvedValueOnce({
      success: true,
      data: { reverted: [f1], conflicted: [f2] },
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockToast.warning).toHaveBeenCalledWith(expect.stringContaining('1/2'))
    // Undo entry should only contain reverted
    expect(store.undoStack).toHaveLength(1)
    const undoEntry = store.undoStack[0] as UndoEntry
    expect(undoEntry.previousStates.has(f1)).toBe(true)
    expect(undoEntry.previousStates.has(f2)).toBe(false)
  })

  // ── Redo: bulk ALL conflicts ──
  it('should show cancelled warning when bulk redo has all conflicts', async () => {
    const f1 = '00000000-0000-4000-8000-000000000011'
    store.findingsMap.set(f1, makeFinding({ id: f1, status: 'pending' }))

    store.redoStack.push(
      buildTestEntry({
        type: 'bulk',
        findingId: null,
        batchId: 'batch-redo-allconf',
        previousStates: new Map([[f1, 'pending']]),
        newStates: new Map([[f1, 'accepted']]),
      }),
    )

    mockRedoBulkAction.mockResolvedValueOnce({
      success: true,
      data: { reverted: [], conflicted: [f1] },
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockToast.warning).toHaveBeenCalledWith(expect.stringContaining('modified'))
    expect(store.undoStack).toHaveLength(0)
  })

  // ── Redo: bulk failure ──
  it('should push back to redo stack when redoBulkAction fails', async () => {
    const f1 = '00000000-0000-4000-8000-000000000011'
    store.redoStack.push(
      buildTestEntry({
        type: 'bulk',
        findingId: null,
        batchId: 'batch-redo-fail',
        previousStates: new Map([[f1, 'pending']]),
        newStates: new Map([[f1, 'accepted']]),
      }),
    )

    mockRedoBulkAction.mockResolvedValueOnce({ success: false, error: 'Server error' })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockToast.error).toHaveBeenCalledWith('Redo failed: Server error')
    expect(store.redoStack).toHaveLength(1)
  })

  // ── Redo: default single — missing findingId ──
  it('should push back to redo when default single redo has no findingId', async () => {
    store.redoStack.push(
      buildTestEntry({
        action: 'accept',
        findingId: null,
        previousStates: new Map(),
        newStates: new Map(),
      }),
    )

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockRedoAction).not.toHaveBeenCalled()
    expect(store.redoStack).toHaveLength(1)
  })

  // ── Redo: default single — missing states ──
  it('should push back to redo when default single redo has missing states', async () => {
    store.redoStack.push(
      buildTestEntry({
        action: 'accept',
        previousStates: new Map(),
        newStates: new Map(),
      }),
    )

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockRedoAction).not.toHaveBeenCalled()
    expect(store.redoStack).toHaveLength(1)
  })

  // ── Redo: default single failure ──
  it('should push back to redo and toast error on single redo failure', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ status: 'pending' }))
    store.redoStack.push(buildTestEntry())

    mockRedoAction.mockResolvedValueOnce({ success: false, error: 'DB error' })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockToast.error).toHaveBeenCalledWith('Redo failed: DB error')
    expect(store.redoStack).toHaveLength(1)
  })

  // ── Redo: catch block ──
  it('should toast error and push back on unexpected throw during redo', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding())
    store.redoStack.push(buildTestEntry())

    mockRedoAction.mockRejectedValueOnce(new Error('Network failure'))

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockToast.error).toHaveBeenCalledWith('Redo failed unexpectedly')
    expect(store.redoStack).toHaveLength(1)
  })

  // ── forceUndo: success ──
  it('should force undo with force=true and push to redo on success', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ status: 'accepted' }))
    const entry = buildTestEntry()

    mockUndoAction.mockResolvedValueOnce({
      success: true,
      data: { serverUpdatedAt: '2026-03-18T12:00:00Z' },
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.forceUndo(entry))

    expect(mockUndoAction).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
    expect(store.redoStack).toHaveLength(1)
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('forced'))
  })

  // ── forceUndo: failure ──
  it('should toast error and reinsert on force undo failure', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding())
    const entry = buildTestEntry()

    mockUndoAction.mockResolvedValueOnce({ success: false, error: 'Force failed' })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.forceUndo(entry))

    expect(mockToast.error).toHaveBeenCalledWith('Force undo failed: Force failed')
    expect(store.reinsertedEntries).toHaveLength(1)
  })

  // ── forceUndo: no findingId ──
  it('should no-op when forceUndo entry has no findingId', async () => {
    const entry = buildTestEntry({
      findingId: null,
      previousStates: new Map(),
      newStates: new Map(),
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.forceUndo(entry))

    expect(mockUndoAction).not.toHaveBeenCalled()
  })

  // ── forceUndo: missing states ──
  it('should no-op when forceUndo entry has no previousStates/newStates', async () => {
    const entry = buildTestEntry({ previousStates: new Map(), newStates: new Map() })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.forceUndo(entry))

    expect(mockUndoAction).not.toHaveBeenCalled()
  })

  // ── Undo: single undo with serverUpdatedAt=null (no timestamp branch) ──
  it('should skip timestamp sync when serverUpdatedAt is null', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ status: 'accepted' }))
    store.undoStack.push(buildTestEntry())

    mockUndoAction.mockResolvedValueOnce({
      success: true,
      data: { serverUpdatedAt: null },
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('Undone'))
    expect(store.redoStack).toHaveLength(1)
  })

  // ── Redo: inFlightRef blocks concurrent redo calls ──
  it('should block second redo while first is in-flight', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ status: 'pending' }))
    store.redoStack.push(buildTestEntry())
    store.redoStack.push(buildTestEntry())

    let resolveFirst!: (v: unknown) => void
    mockRedoAction.mockReturnValueOnce(
      new Promise((r) => {
        resolveFirst = r
      }),
    )

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )

    const firstPromise = act(() => result.current.performRedo())
    await act(() => result.current.performRedo())

    resolveFirst({ success: true, data: { serverUpdatedAt: '2026-03-18T12:00:00Z' } })
    await firstPromise

    expect(mockRedoAction).toHaveBeenCalledTimes(1)
  })

  // ── Bulk undo: partial stale (some stale, some non-stale) ──
  it('should exclude stale findings from bulk undo inputs', async () => {
    const f1 = '00000000-0000-4000-8000-000000000011'
    const f2 = '00000000-0000-4000-8000-000000000012'
    store.findingsMap.set(f1, makeFinding({ id: f1, status: 'accepted' }))
    store.findingsMap.set(f2, makeFinding({ id: f2, status: 'accepted' }))

    store.undoStack.push(
      buildTestEntry({
        type: 'bulk',
        findingId: null,
        batchId: 'batch-mixed-stale',
        previousStates: new Map([
          [f1, 'pending'],
          [f2, 'pending'],
        ]),
        newStates: new Map([
          [f1, 'accepted'],
          [f2, 'accepted'],
        ]),
        staleFindings: new Set([f2]), // f2 is stale
      }),
    )

    mockUndoBulkAction.mockResolvedValueOnce({
      success: true,
      data: { reverted: [f1], conflicted: [] },
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    // Should only send f1 to the server
    expect(mockUndoBulkAction).toHaveBeenCalledWith(
      expect.objectContaining({
        findings: expect.arrayContaining([expect.objectContaining({ findingId: f1 })]),
      }),
    )
    const callArgs = mockUndoBulkAction.mock.calls[0]![0] as {
      findings: Array<{ findingId: string }>
    }
    expect(callArgs.findings).toHaveLength(1)
  })
})
