/**
 * Story 4.4b TA: use-undo-redo hook — Branch coverage expansion
 * Gaps: G-01 (5 action branches), G-04 (inFlightRef), G-07 (note/source_issue), G-10 (all-stale bulk), G-11 (redo-add ID sync)
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks (MUST be vi.hoisted to avoid TDZ errors in vi.mock factories) ──
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
      setFinding: (id: string, f: unknown) => store.findingsMap.set(id, f),
      removeFinding: (id: string) => store.findingsMap.delete(id),
    }),
  },
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

describe('useUndoRedo', () => {
  const onConflict = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    store.undoStack = []
    store.redoStack = []
    store.findingsMap = new Map()
  })

  // ── TA-U01: P1 — Undo severity override branch ──

  it('should call undoSeverityOverride and update store on success (TA-U01)', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ severity: 'minor', originalSeverity: 'major' }))

    const entry = buildTestEntry({
      action: 'severity_override',
      previousSeverity: { severity: 'major', originalSeverity: null },
      newSeverity: 'minor',
    })
    store.undoStack.push(entry)

    mockUndoSeverityOverride.mockResolvedValueOnce({
      success: true,
      data: { serverUpdatedAt: '2026-03-18T12:00:00Z' },
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockUndoSeverityOverride).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: FINDING_ID, previousSeverity: 'major' }),
    )
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('Undone'))
    expect(store.redoStack).toHaveLength(1)
  })

  // ── TA-U02: P1 — Undo add finding branch ──

  it('should call undoAddFinding and remove from store on success (TA-U02)', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding())
    store.undoStack.push(buildTestEntry({ action: 'add' }))

    mockUndoAddFinding.mockResolvedValueOnce({ success: true, data: {} })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockUndoAddFinding).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: FINDING_ID }),
    )
    expect(store.findingsMap.has(FINDING_ID)).toBe(false)
    expect(store.redoStack).toHaveLength(1)
  })

  // ── TA-U03: P1 — Undo delete finding branch ──

  it('should call undoDeleteFinding and re-insert to store on success (TA-U03)', async () => {
    const snapshot = buildSnapshot()
    store.undoStack.push(buildTestEntry({ action: 'delete', findingSnapshot: snapshot }))

    mockUndoDeleteFinding.mockResolvedValueOnce({ success: true, data: {} })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockUndoDeleteFinding).toHaveBeenCalledWith(expect.objectContaining({ snapshot }))
    expect(store.findingsMap.has(FINDING_ID)).toBe(true)
    expect(store.redoStack).toHaveLength(1)
  })

  // ── TA-U04: P1 — Undo bulk action branch ──

  it('should call undoBulkAction and update store for reverted findings (TA-U04)', async () => {
    const f1 = '00000000-0000-4000-8000-000000000011'
    const f2 = '00000000-0000-4000-8000-000000000012'
    store.findingsMap.set(f1, makeFinding({ id: f1, status: 'accepted' }))
    store.findingsMap.set(f2, makeFinding({ id: f2, status: 'accepted' }))

    store.undoStack.push(
      buildTestEntry({
        type: 'bulk',
        findingId: null,
        batchId: 'batch-1',
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
      data: { reverted: [f1, f2], conflicted: [], serverUpdatedAt: '2026-03-18T12:00:00Z' },
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockUndoBulkAction).toHaveBeenCalled()
    const f1Finding = store.findingsMap.get(f1) as Record<string, unknown> | undefined
    expect(f1Finding?.status).toBe('pending')
    expect(store.redoStack).toHaveLength(1)
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('Undone'))
  })

  // ── TA-U05: P1 — Single undo with stale finding triggers onConflict ──

  it('should call onConflict when stale finding detected on single undo (TA-U05)', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ status: 'rejected' }))
    const entry = buildTestEntry({ staleFindings: new Set([FINDING_ID]) })
    store.undoStack.push(entry)

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(onConflict).toHaveBeenCalledWith(entry, FINDING_ID, 'rejected')
    expect(mockUndoAction).not.toHaveBeenCalled()
  })

  // ── TA-U09: P1 — inFlightRef blocks concurrent undo calls ──

  it('should block second undo while first is in-flight (TA-U09)', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ status: 'accepted' }))
    store.undoStack.push(buildTestEntry())
    store.undoStack.push(buildTestEntry())

    let resolveFirst!: (v: unknown) => void
    mockUndoAction.mockReturnValueOnce(
      new Promise((r) => {
        resolveFirst = r
      }),
    )

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )

    const firstPromise = act(() => result.current.performUndo())
    await act(() => result.current.performUndo())

    resolveFirst({ success: true, data: { serverUpdatedAt: '2026-03-18T12:00:00Z' } })
    await firstPromise

    expect(mockUndoAction).toHaveBeenCalledTimes(1)
  })

  // ── TA-U10: P2 — Undo note action uses default single status revert ──

  it('should undo note action via default single status revert path (TA-U10)', async () => {
    store.findingsMap.set(FINDING_ID, makeFinding({ status: 'noted' }))
    store.undoStack.push(
      buildTestEntry({
        action: 'note',
        previousStates: new Map([[FINDING_ID, 'pending']]),
        newStates: new Map([[FINDING_ID, 'noted']]),
      }),
    )

    mockUndoAction.mockResolvedValueOnce({
      success: true,
      data: { serverUpdatedAt: '2026-03-18T12:00:00Z' },
    })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockUndoAction).toHaveBeenCalledWith(
      expect.objectContaining({ previousState: 'pending', expectedCurrentState: 'noted' }),
    )
    expect(store.redoStack).toHaveLength(1)
  })

  // ── TA-U12: P3 — All-stale bulk shows warning toast, not ConflictDialog ──

  it('should show warning toast when all bulk findings are stale (TA-U12)', async () => {
    const f1 = '00000000-0000-4000-8000-000000000021'
    const f2 = '00000000-0000-4000-8000-000000000022'

    store.undoStack.push(
      buildTestEntry({
        type: 'bulk',
        findingId: null,
        batchId: 'batch-stale',
        previousStates: new Map([
          [f1, 'pending'],
          [f2, 'pending'],
        ]),
        newStates: new Map([
          [f1, 'accepted'],
          [f2, 'accepted'],
        ]),
        staleFindings: new Set([f1, f2]),
      }),
    )

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performUndo())

    expect(mockToast.warning).toHaveBeenCalledWith(
      expect.stringContaining('modified by another user'),
    )
    expect(mockUndoBulkAction).not.toHaveBeenCalled()
    expect(onConflict).not.toHaveBeenCalled()
  })

  // ── TA-U13: P3 — Redo-add updates entry findingId with new server-generated ID ──

  it('should update undo entry with new findingId after redo-add (TA-U13)', async () => {
    const newId = '00000000-0000-4000-8000-000000000099'
    store.redoStack.push(buildTestEntry({ action: 'add', findingSnapshot: buildSnapshot() }))

    mockAddFinding.mockResolvedValueOnce({ success: true, data: { findingId: newId } })

    const { result } = renderHook(() =>
      useUndoRedo({ fileId: FILE_ID, projectId: PROJECT_ID, onConflict }),
    )
    await act(() => result.current.performRedo())

    expect(mockAddFinding).toHaveBeenCalled()
    expect(store.undoStack).toHaveLength(1)
    const pushed = store.undoStack[0] as UndoEntry
    expect(pushed.findingId).toBe(newId)
    expect(store.findingsMap.has(newId)).toBe(true)
    expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining('Redone'))
  })
})
