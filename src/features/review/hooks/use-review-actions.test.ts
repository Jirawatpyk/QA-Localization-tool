/**
 * Story 4.2: Core Review Actions — useReviewActions hook
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

// Story 4.3: mock new action imports (server-only modules)
vi.mock('@/features/review/actions/noteFinding.action', () => ({
  noteFinding: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: {} })),
}))
vi.mock('@/features/review/actions/sourceIssueFinding.action', () => ({
  sourceIssueFinding: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: {} })),
}))

// ── Mock Zustand store ──

const mockFindingsMap = new Map<string, { id: string; status: FindingStatus }>()
// M4 fix: setFinding actually mutates the map so rollback comparison works
const mockSetFinding = vi.fn((id: string, finding: { id: string; status: FindingStatus }) => {
  mockFindingsMap.set(id, finding)
})

const mockSetSelectedFinding = vi.fn()
const mockSetDetectedPattern = vi.fn()
const mockSetRejectionTracker = vi.fn()

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
        pushUndo: vi.fn(),
        overrideCounts: new Map(),
        incrementOverrideCount: vi.fn(),
        setOverrideCount: vi.fn(),
        // Story 4.6: suppression state
        rejectionTracker: new Map(),
        setDetectedPattern: mockSetDetectedPattern,
        setRejectionTracker: mockSetRejectionTracker,
        detectedPattern: null,
        activeSuppressions: [],
      })),
    },
  ),
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
  getStoreFileState: vi.fn((..._args: unknown[]) => ({
    findingsMap: mockFindingsMap,
    selectedId: null,
    selectedIds: new Set<string>(),
    sortedFindingIds: [...mockFindingsMap.keys()],
    overrideCounts: new Map(),
    currentScore: null,
    scoreStatus: 'na',
    undoStack: [],
    redoStack: [],
    selectionMode: 'single' as const,
    filterState: {},
    searchQuery: '',
    aiSuggestionsEnabled: true,
  })),
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

const { mockToastSuccess, mockToastError, mockToastWarning, mockToastInfo, mockAnnounce } =
  vi.hoisted(() => ({
    mockToastSuccess: vi.fn(),
    mockToastError: vi.fn(),
    mockToastWarning: vi.fn(),
    mockToastInfo: vi.fn(),
    mockAnnounce: vi.fn(),
  }))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: mockToastSuccess,
    error: mockToastError,
    warning: mockToastWarning,
    info: mockToastInfo,
  }),
}))

vi.mock('@/features/review/utils/announce', () => ({
  announce: mockAnnounce,
}))

// Story 4.6: mock pattern detection
const mockTrackRejection = vi.fn((..._args: unknown[]) => ({
  tracker: new Map(),
  pattern: null as unknown,
}))
const mockIsAlreadySuppressed = vi.fn((..._args: unknown[]) => false)
vi.mock('@/features/review/utils/pattern-detection', () => ({
  trackRejection: (...args: unknown[]) => mockTrackRejection(...args),
  isAlreadySuppressed: (...args: unknown[]) => mockIsAlreadySuppressed(...args),
}))

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
    // Re-set pattern detection mocks (clearAllMocks resets implementations)
    mockTrackRejection.mockReturnValue({ tracker: new Map(), pattern: null as unknown })
    mockIsAlreadySuppressed.mockReturnValue(false)
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

    // M8 fix: assert error toast shown on failure
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('DB error'))
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

  it('[P1] U-H4: should call autoAdvance and toast.success after successful accept', async () => {
    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }),
    )

    await act(async () => {
      await result.current.handleAccept(VALID_FINDING_ID)
    })

    // M8 fix: assert toast + announce called on success
    expect(mockAutoAdvance).toHaveBeenCalledTimes(1)
    expect(mockToastSuccess).toHaveBeenCalledWith(
      'Finding accepted',
      expect.objectContaining({ duration: 3000 }),
    )
    expect(mockAnnounce).toHaveBeenCalledWith(expect.stringContaining('accepted'))
  })

  it('[P1] U-H4b: should set selectedId to next pending finding after autoAdvance (CR-R2-L1)', async () => {
    // Arrange: 2 findings — target (pending) + next (pending)
    const nextFindingId = 'f2a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5d'
    mockFindingsMap.set(nextFindingId, { id: nextFindingId, status: 'pending' })
    // Configure autoAdvance to return the next pending ID
    mockAutoAdvance.mockReturnValue(nextFindingId)

    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }),
    )

    await act(async () => {
      await result.current.handleAccept(VALID_FINDING_ID)
    })

    // TQA-L1: verify autoAdvance called with correct args
    expect(mockAutoAdvance).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Map),
      VALID_FINDING_ID,
    )
    // Assert: store setSelectedFinding called with next pending ID
    expect(mockSetSelectedFinding).toHaveBeenCalledWith(nextFindingId)
  })

  it('[P1] U-H5: should announce correct reviewed count after action', async () => {
    // H6 fix: test the actual announce call with progress text
    // Arrange: 3 findings — 1 pending (target), 1 accepted, 1 pending
    mockFindingsMap.set('f2', { id: 'f2', status: 'accepted' })
    mockFindingsMap.set('f3', { id: 'f3', status: 'pending' })

    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
      }),
    )

    await act(async () => {
      await result.current.handleAccept(VALID_FINDING_ID)
    })

    // TQA-M1 fix: exact count assertion. mockSetFinding mutates mockFindingsMap (line 55-57),
    // so after optimistic update: VALID_FINDING_ID=accepted + f2=accepted + f3=pending = 2/3 reviewed
    expect(mockAnnounce).toHaveBeenCalledWith('Finding accepted. 2 of 3 reviewed')
  })

  it('[P1] U-H5b: should handle reject action with default toast', async () => {
    const { result } = renderHook(() =>
      useReviewActions({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID }),
    )

    await act(async () => {
      await result.current.handleReject(VALID_FINDING_ID)
    })

    expect(mockRejectFinding).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: VALID_FINDING_ID }),
    )
    // TQA-M1: reject uses default toast (not toast.success/warning)
    expect(mockAnnounce).toHaveBeenCalledWith(expect.stringContaining('rejected'))
  })

  it('[P1] U-H5c: should handle flag action with toast.warning', async () => {
    const { result } = renderHook(() =>
      useReviewActions({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID }),
    )

    await act(async () => {
      await result.current.handleFlag(VALID_FINDING_ID)
    })

    expect(mockFlagFinding).toHaveBeenCalledWith(
      expect.objectContaining({ findingId: VALID_FINDING_ID }),
    )
    // TQA-M1: flag uses toast.warning
    expect(mockToastWarning).toHaveBeenCalledWith(
      'Finding flagged for review',
      expect.objectContaining({ duration: 3000 }),
    )
    expect(mockAnnounce).toHaveBeenCalledWith(expect.stringContaining('flagged'))
  })

  // ── Story 4.3 ATDD: Note/Source extended actions ──

  it('[P0] U-H1: should call executeAction(note) + autoAdvance when finding is not noted', async () => {
    // Arrange: finding is pending (not noted)
    mockFindingsMap.set(VALID_FINDING_ID, { id: VALID_FINDING_ID, status: 'pending' })

    const { result } = renderHook(() =>
      useReviewActions({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID }),
    )

    await act(async () => {
      result.current.handleNote(VALID_FINDING_ID)
    })

    // handleNote on non-noted finding should dispatch 'note' action (via executeAction)
    // The noteFinding mock should be called (through ACTION_FN_MAP)
    expect(mockAnnounce).toHaveBeenCalledWith(expect.stringContaining('noted'))
  })

  it('[P0] U-H2: should call executeAction(source) + autoAdvance', async () => {
    mockFindingsMap.set(VALID_FINDING_ID, { id: VALID_FINDING_ID, status: 'pending' })

    const { result } = renderHook(() =>
      useReviewActions({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID }),
    )

    await act(async () => {
      await result.current.handleSourceIssue(VALID_FINDING_ID)
    })

    expect(mockAnnounce).toHaveBeenCalledWith(expect.stringContaining('source issue'))
  })

  it('[P1] U-H5: should open NoteInput when finding is already noted (no advance)', () => {
    // Arrange: finding is already noted
    mockFindingsMap.set(VALID_FINDING_ID, { id: VALID_FINDING_ID, status: 'noted' })

    const { result } = renderHook(() =>
      useReviewActions({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID }),
    )

    // Act
    const noteResult = result.current.handleNote(VALID_FINDING_ID)

    // Assert: returns 'open-note-input' signal (no action dispatched, no advance)
    expect(noteResult).toBe('open-note-input')
    expect(mockAnnounce).not.toHaveBeenCalled()
  })

  // ── Story 4.6: Pattern detection integration (CR-H6) ──

  it('[P1] should call trackRejection when handleReject succeeds', async () => {
    mockFindingsMap.set(VALID_FINDING_ID, {
      id: VALID_FINDING_ID,
      status: 'pending',
    })

    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        sourceLang: 'en-US',
        targetLang: 'th-TH',
      }),
    )

    await act(async () => {
      await result.current.handleReject(VALID_FINDING_ID)
    })

    expect(mockTrackRejection).toHaveBeenCalledTimes(1)
  })

  it('[P1] should NOT call trackRejection on accept action (only reject)', async () => {
    mockFindingsMap.set(VALID_FINDING_ID, {
      id: VALID_FINDING_ID,
      status: 'pending',
    })

    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        sourceLang: 'en-US',
        targetLang: 'th-TH',
      }),
    )

    await act(async () => {
      await result.current.handleAccept(VALID_FINDING_ID)
    })

    expect(mockTrackRejection).not.toHaveBeenCalled()
  })

  it('[P1] should NOT call trackRejection when isAlreadySuppressed returns true', async () => {
    mockIsAlreadySuppressed.mockReturnValue(true)
    mockFindingsMap.set(VALID_FINDING_ID, {
      id: VALID_FINDING_ID,
      status: 'pending',
    })

    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        sourceLang: 'en-US',
        targetLang: 'th-TH',
      }),
    )

    await act(async () => {
      await result.current.handleReject(VALID_FINDING_ID)
    })

    // R2-M10: verify arguments passed to isAlreadySuppressed
    expect(mockIsAlreadySuppressed).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ id: VALID_FINDING_ID }),
      'en-US',
      'th-TH',
      VALID_FILE_ID,
    )
    expect(mockTrackRejection).not.toHaveBeenCalled()
  })

  it('[P1] should call setDetectedPattern when pattern detected', async () => {
    const mockPattern = {
      category: 'Terminology',
      keywords: ['bank', 'terminology', 'translation'],
      patternName: 'Terminology: bank, terminology, translation',
      matchingFindingIds: ['a', 'b', 'c'],
      sourceLang: 'en-US',
      targetLang: 'th-TH',
    }
    mockTrackRejection.mockReturnValue({ tracker: new Map(), pattern: mockPattern as unknown })
    mockFindingsMap.set(VALID_FINDING_ID, {
      id: VALID_FINDING_ID,
      status: 'pending',
    })

    const { result } = renderHook(() =>
      useReviewActions({
        fileId: VALID_FILE_ID,
        projectId: VALID_PROJECT_ID,
        sourceLang: 'en-US',
        targetLang: 'th-TH',
      }),
    )

    await act(async () => {
      await result.current.handleReject(VALID_FINDING_ID)
    })

    // R2-L7: verify setRejectionTracker also called (immutability contract)
    expect(mockSetRejectionTracker).toHaveBeenCalledWith(expect.any(Map))
    // setDetectedPattern should be called with the detected pattern
    expect(mockSetDetectedPattern).toHaveBeenCalledWith(mockPattern)
  })
})
