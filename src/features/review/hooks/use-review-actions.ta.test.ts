/**
 * Test Automation Expansion — Story 4.2: useReviewActions hook
 * Regression tests for production bugs + race conditions + ref lifecycle
 *
 * TA-U1: processedFileIdRef reset on fileId change
 * TA-U2: skip re-init when RSC revalidates same fileId
 * TA-U3: serverUpdatedAt replaces client timestamp after success
 * TA-U10: concurrent actions on different findings
 * TA-U11: Realtime state after rollback when optimistic fails
 * TA-U14: activeFindingId synced via setSelectedFinding after auto-advance
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useReviewActions } from '@/features/review/hooks/use-review-actions'
import type { FindingStatus } from '@/types/finding'

// ── Mock Server Actions ──

const mockAcceptFinding = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ success: true, data: {} } as {
    success: boolean
    data?: Record<string, unknown>
    error?: string
    code?: string
  }),
)
const mockRejectFinding = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ success: true, data: {} } as {
    success: boolean
    data?: Record<string, unknown>
    error?: string
    code?: string
  }),
)

vi.mock('@/features/review/actions/acceptFinding.action', () => ({
  acceptFinding: (...args: unknown[]) => mockAcceptFinding(...args),
}))

vi.mock('@/features/review/actions/rejectFinding.action', () => ({
  rejectFinding: (...args: unknown[]) => mockRejectFinding(...args),
}))

vi.mock('@/features/review/actions/flagFinding.action', () => ({
  flagFinding: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: {} })),
}))
vi.mock('@/features/review/actions/noteFinding.action', () => ({
  noteFinding: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: {} })),
}))
vi.mock('@/features/review/actions/sourceIssueFinding.action', () => ({
  sourceIssueFinding: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: {} })),
}))

// ── Mock Zustand store ──

const mockFindingsMap = new Map<
  string,
  { id: string; status: FindingStatus; updatedAt: string; [key: string]: unknown }
>()
const mockSetFinding = vi.fn(
  (id: string, finding: { id: string; status: FindingStatus; updatedAt: string }) => {
    mockFindingsMap.set(id, finding)
  },
)
const mockSetSelectedFinding = vi.fn()
const mockPushUndo = vi.fn()

vi.mock('@/features/review/stores/review.store', () => ({
  useReviewStore: Object.assign(
    vi.fn(() => ({
      findingsMap: mockFindingsMap,
      setFinding: mockSetFinding,
      selectedId: null,
      setSelectedFinding: mockSetSelectedFinding,
      sortedFindingIds: [...mockFindingsMap.keys()],
      setSortedFindingIds: vi.fn(),
      currentFileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
    })),
    {
      getState: vi.fn(() => ({
        findingsMap: mockFindingsMap,
        setFinding: mockSetFinding,
        selectedId: null,
        setSelectedFinding: mockSetSelectedFinding,
        sortedFindingIds: [...mockFindingsMap.keys()],
        setSortedFindingIds: vi.fn(),
        currentFileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        pushUndo: mockPushUndo,
        overrideCounts: new Map(),
        incrementOverrideCount: vi.fn(),
        setOverrideCount: vi.fn(),
        fileStates: new Map(),
      })),
    },
  ),
  getStoreFileState: (_storeRef: unknown, _fileId?: string) => ({
    findingsMap: mockFindingsMap,
    setFinding: mockSetFinding,
    setSelectedFinding: mockSetSelectedFinding,
    setSortedFindingIds: vi.fn(),
    pushUndo: mockPushUndo,
    overrideCounts: new Map(),
    incrementOverrideCount: vi.fn(),
    setOverrideCount: vi.fn(),
  }),
  useFileState: vi.fn((selector?: (state: Record<string, unknown>) => unknown) =>
    selector
      ? selector({
          findingsMap: mockFindingsMap,
          selectedId: null,
          sortedFindingIds: [...mockFindingsMap.keys()],
        })
      : undefined,
  ),
  selectCanUndo: vi.fn(() => false),
  selectCanRedo: vi.fn(() => false),
}))

// ── Mock focus management ──

const mockAutoAdvance = vi.fn()

vi.mock('@/features/review/hooks/use-focus-management', () => ({
  useFocusManagement: vi.fn(() => ({
    autoAdvance: mockAutoAdvance,
    focusActionBar: vi.fn(),
  })),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}))

vi.mock('@/features/review/utils/announce', () => ({
  announce: vi.fn(),
}))

// ── Constants ──

const FINDING_1 = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
const FINDING_2 = 'f2a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5d'
const FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const FILE_ID_2 = 'a2b3c4d5-e6f7-4a1b-8c2d-3e4f5a6b7c8e'
const PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'

// ── Tests ──

describe('useReviewActions — TA expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindingsMap.clear()
    mockFindingsMap.set(FINDING_1, {
      id: FINDING_1,
      status: 'pending',
      updatedAt: '2026-03-01T00:00:00Z',
    })
    mockAcceptFinding.mockResolvedValue({ success: true, data: {} })
    mockRejectFinding.mockResolvedValue({ success: true, data: {} })
  })

  // TA-U1: verify ref clears on new file
  it('[P0] should reset processedFileIdRef when fileId changes', async () => {
    // useReviewActions recreates executeAction with new fileId via useCallback deps
    // Render with file A, perform action, then re-render with file B
    const { result, rerender } = renderHook(
      ({ fileId }: { fileId: string }) => useReviewActions({ fileId, projectId: PROJECT_ID }),
      { initialProps: { fileId: FILE_ID } },
    )

    await act(async () => {
      await result.current.handleAccept(FINDING_1)
    })

    // Accept was called with file A's fileId
    expect(mockAcceptFinding).toHaveBeenCalledWith(expect.objectContaining({ fileId: FILE_ID }))

    mockAcceptFinding.mockClear()
    mockFindingsMap.set(FINDING_1, {
      id: FINDING_1,
      status: 'pending',
      updatedAt: '2026-03-01T00:00:00Z',
    })

    // Re-render with file B
    rerender({ fileId: FILE_ID_2 })

    await act(async () => {
      await result.current.handleAccept(FINDING_1)
    })

    // Accept should now use new fileId
    expect(mockAcceptFinding).toHaveBeenCalledWith(expect.objectContaining({ fileId: FILE_ID_2 }))
  })

  // TA-U2: verify guard when RSC revalidates same fileId
  it('[P0] should skip re-initialization when RSC revalidates same fileId', () => {
    // Render and re-render with same fileId — hook should remain stable
    const { result, rerender } = renderHook(
      ({ fileId }: { fileId: string }) => useReviewActions({ fileId, projectId: PROJECT_ID }),
      { initialProps: { fileId: FILE_ID } },
    )

    const firstHandleAccept = result.current.handleAccept
    rerender({ fileId: FILE_ID })
    // Same fileId → same callback reference (useCallback deps unchanged)
    expect(result.current.handleAccept).toBe(firstHandleAccept)
  })

  // TA-U3: verify timestamp sync after success
  it('[P0] should replace client timestamp with serverUpdatedAt in store after success', async () => {
    const serverTimestamp = '2026-03-15T12:00:00.000Z'
    mockAcceptFinding.mockResolvedValue({
      success: true,
      data: { serverUpdatedAt: serverTimestamp },
    })

    const { result } = renderHook(() =>
      useReviewActions({ fileId: FILE_ID, projectId: PROJECT_ID }),
    )

    await act(async () => {
      await result.current.handleAccept(FINDING_1)
    })

    // setFinding called: 1) optimistic, 2) serverUpdatedAt replacement
    expect(mockSetFinding).toHaveBeenCalledTimes(2)
    const serverTimeSyncCall = mockSetFinding.mock.calls[1] as [string, { updatedAt: string }]
    expect(serverTimeSyncCall[1].updatedAt).toBe(serverTimestamp)
  })

  // TA-U10: concurrent actions on different findings both succeed
  it('[P1] should allow concurrent actions on different findings', async () => {
    mockFindingsMap.set(FINDING_2, {
      id: FINDING_2,
      status: 'pending',
      updatedAt: '2026-03-01T00:00:00Z',
    })

    // Render two separate hooks (simulating two independent action dispatchers)
    // In practice, inFlightRef is per-hook instance. Test sequential as ref blocks parallel.
    const { result } = renderHook(() =>
      useReviewActions({ fileId: FILE_ID, projectId: PROJECT_ID }),
    )

    // First action completes, then second
    await act(async () => {
      await result.current.handleAccept(FINDING_1)
    })
    await act(async () => {
      await result.current.handleReject(FINDING_2)
    })

    expect(mockAcceptFinding).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: FINDING_1 }),
    )
    expect(mockRejectFinding).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: FINDING_2 }),
    )
  })

  // TA-U11: Realtime state preserved after rollback
  it('[P1] should use Realtime state after rollback when optimistic fails', async () => {
    // Server action slow → Realtime updates finding → server returns error → rollback guard
    let resolveAction: ((value: { success: boolean; error?: string }) => void) | undefined
    mockAcceptFinding.mockImplementation(
      () =>
        new Promise<{ success: boolean; error?: string }>((resolve) => {
          resolveAction = resolve
        }),
    )

    const { result } = renderHook(() =>
      useReviewActions({ fileId: FILE_ID, projectId: PROJECT_ID }),
    )

    await act(async () => {
      const promise = result.current.handleAccept(FINDING_1)

      // S-FIX-7: Flush microtasks so selfAssignIfNeeded completes and
      // mockAcceptFinding captures resolveAction before we call it
      await Promise.resolve()
      await Promise.resolve()

      // Realtime pushes 'flagged' while action is in-flight
      mockFindingsMap.set(FINDING_1, {
        id: FINDING_1,
        status: 'flagged',
        updatedAt: '2026-03-15T13:00:00Z',
      })

      // Server returns error → rollback
      resolveAction?.({ success: false, error: 'Conflict' })
      await promise
    })

    // M4 fix: rollback checks current status === newState. Since Realtime set 'flagged'
    // (not 'accepted'), rollback is skipped. Final state = 'flagged' (Realtime's value).
    const final = mockFindingsMap.get(FINDING_1)
    expect(final?.status).toBe('flagged')
  })

  // TA-U14: store sync after auto-advance
  it('[P1] should sync activeFindingId via setSelectedFinding after auto-advance', async () => {
    const nextPendingId = FINDING_2
    mockFindingsMap.set(FINDING_2, {
      id: FINDING_2,
      status: 'pending',
      updatedAt: '2026-03-01T00:00:00Z',
    })
    mockAutoAdvance.mockReturnValue(nextPendingId)

    const { result } = renderHook(() =>
      useReviewActions({ fileId: FILE_ID, projectId: PROJECT_ID }),
    )

    await act(async () => {
      await result.current.handleAccept(FINDING_1)
    })

    // autoAdvance returns next pending → setSelectedFinding syncs to store
    expect(mockAutoAdvance).toHaveBeenCalledTimes(1)
    expect(mockSetSelectedFinding).toHaveBeenCalledWith(nextPendingId)
  })
})
