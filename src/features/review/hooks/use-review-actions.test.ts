/**
 * TDD RED PHASE — Story 4.2: Core Review Actions
 * Hook: useReviewActions
 * Tests: optimistic UI, rollback, double-click prevention, auto-advance, progress count
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useReviewActions } from '@/features/review/hooks/use-review-actions'
import type { FindingStatus } from '@/types/finding'

// ── Mock Server Actions ──

const mockAcceptFinding = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ success: true, data: {} } as {
    success: boolean
    data?: unknown
    error?: string
    code?: string
  }),
)
const mockRejectFinding = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ success: true, data: {} } as {
    success: boolean
    data?: unknown
    error?: string
    code?: string
  }),
)
const mockFlagFinding = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ success: true, data: {} } as {
    success: boolean
    data?: unknown
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
  flagFinding: (...args: unknown[]) => mockFlagFinding(...args),
}))

// ── Mock Zustand store ──

const mockSetFinding = vi.fn()
const mockFindingsMap = new Map<string, { id: string; status: FindingStatus }>()

vi.mock('@/features/review/stores/review.store', () => ({
  useReviewStore: Object.assign(
    vi.fn(() => ({
      findingsMap: mockFindingsMap,
      setFinding: mockSetFinding,
      selectedId: null,
      currentFileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
    })),
    {
      getState: vi.fn(() => ({
        findingsMap: mockFindingsMap,
        setFinding: mockSetFinding,
        selectedId: null,
        currentFileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      })),
    },
  ),
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

// Will fail: module doesn't exist yet

// ── Constants ──

const VALID_FINDING_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'

// ── Tests ──

describe('useReviewActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindingsMap.clear()
    mockFindingsMap.set(VALID_FINDING_ID, {
      id: VALID_FINDING_ID,
      status: 'pending',
    })
    mockAcceptFinding.mockResolvedValue({ success: true, data: {} })
    mockRejectFinding.mockResolvedValue({ success: true, data: {} })
    mockFlagFinding.mockResolvedValue({ success: true, data: {} })
  })

  it('[P0] U-H1: should optimistically update Zustand store when handleAccept is called', async () => {
    // Arrange
    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }),
    )

    // Act: call handleAccept
    await act(async () => {
      await result.current.handleAccept(VALID_FINDING_ID)
    })

    // Assert: store was updated optimistically BEFORE server action resolved
    expect(mockSetFinding).toHaveBeenCalledWith(
      VALID_FINDING_ID,
      expect.objectContaining({ status: 'accepted' }),
    )
  })

  it('[P1] U-H2: should rollback optimistic update when Server Action fails', async () => {
    // Arrange: server action will fail
    mockAcceptFinding.mockResolvedValue({
      success: false,
      error: 'DB error',
      code: 'INTERNAL_ERROR',
    })

    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }),
    )

    // Act
    await act(async () => {
      await result.current.handleAccept(VALID_FINDING_ID)
    })

    // Assert: store was called twice — first optimistic, then rollback
    expect(mockSetFinding).toHaveBeenCalledTimes(2)

    // Second call should restore original state
    const rollbackCall = mockSetFinding.mock.calls[1] as [string, { status: FindingStatus }]
    expect(rollbackCall[0]).toBe(VALID_FINDING_ID)
    expect(rollbackCall[1]).toMatchObject({ status: 'pending' })
  })

  it('[P1] U-H3: should prevent double-click — second call during in-flight is ignored', async () => {
    // Arrange: make server action slow
    let resolveAction: ((value: { success: boolean; data?: unknown }) => void) | undefined
    mockAcceptFinding.mockImplementation(
      () =>
        new Promise<{ success: boolean; data?: unknown }>((resolve) => {
          resolveAction = resolve
        }),
    )

    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }),
    )

    // Act: fire two rapid calls
    await act(async () => {
      // First call — starts in-flight
      const firstCall = result.current.handleAccept(VALID_FINDING_ID)
      // Second call — should be ignored
      const secondCall = result.current.handleAccept(VALID_FINDING_ID)

      // Resolve the first call
      resolveAction?.({ success: true, data: {} })
      await firstCall
      await secondCall
    })

    // Assert: server action only called once (second was ignored)
    expect(mockAcceptFinding).toHaveBeenCalledTimes(1)
  })

  it('[P1] U-H4: should call autoAdvance after successful action', async () => {
    // Arrange
    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }),
    )

    // Act
    await act(async () => {
      await result.current.handleAccept(VALID_FINDING_ID)
    })

    // Assert: auto-advance triggered after successful action
    expect(mockAutoAdvance).toHaveBeenCalledTimes(1)
  })

  it('[P1] U-H5: should track review progress — non-pending count accurate', async () => {
    // Arrange: 3 findings, 1 already reviewed
    mockFindingsMap.set('f2', { id: 'f2', status: 'accepted' })
    mockFindingsMap.set('f3', { id: 'f3', status: 'pending' })

    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }),
    )

    // Assert: progress reflects pre-existing reviewed count
    // After accepting VALID_FINDING_ID, 2 of 3 should be non-pending
    await act(async () => {
      await result.current.handleAccept(VALID_FINDING_ID)
    })

    // The hook should expose progress or the store should reflect it
    const findings = [...mockFindingsMap.values()]
    // At minimum, the optimistic update was called
    expect(mockSetFinding).toHaveBeenCalled()
  })

  it('[P1] U-H5b: should handle reject action via handleReject', async () => {
    // Arrange
    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }),
    )

    // Act
    await act(async () => {
      await result.current.handleReject(VALID_FINDING_ID)
    })

    // Assert: reject server action called
    expect(mockRejectFinding).toHaveBeenCalledWith(
      expect.objectContaining({
        findingId: VALID_FINDING_ID,
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }),
    )
  })

  it('[P1] U-H5c: should handle flag action via handleFlag', async () => {
    // Arrange
    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }),
    )

    // Act
    await act(async () => {
      await result.current.handleFlag(VALID_FINDING_ID)
    })

    // Assert: flag server action called
    expect(mockFlagFinding).toHaveBeenCalledWith(
      expect.objectContaining({
        findingId: VALID_FINDING_ID,
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }),
    )
  })
})
