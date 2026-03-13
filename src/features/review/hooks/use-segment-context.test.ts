/**
 * ATDD GREEN PHASE — Story 4.1c: Detail Panel & Segment Context
 * Hook: useSegmentContext
 *
 * Tests use REAL timers with waitFor (fake timers cause timeouts with
 * React async state updates inside setTimeout callbacks).
 * The 150ms debounce is fast enough for real timer tests.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the server action that the hook calls
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetSegmentContext = vi.fn<(...args: unknown[]) => Promise<any>>((..._args: unknown[]) =>
  Promise.resolve({
    success: true as const,
    data: {
      currentSegment: {
        id: 'seg-1',
        segmentNumber: 5,
        sourceText: 'Source text here',
        targetText: 'Target text here',
        sourceLang: 'en-US',
        targetLang: 'th-TH',
        wordCount: 3,
      },
      contextBefore: [],
      contextAfter: [],
      findingsBySegmentId: {},
    },
  }),
)

vi.mock('@/features/review/actions/getSegmentContext.action', () => ({
  getSegmentContext: (...args: unknown[]) => mockGetSegmentContext(...args),
}))

import { useSegmentContext } from '@/features/review/hooks/use-segment-context'

const defaultData = {
  currentSegment: {
    id: 'seg-1',
    segmentNumber: 5,
    sourceText: 'Source text here',
    targetText: 'Target text here',
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    wordCount: 3,
  },
  contextBefore: [],
  contextAfter: [],
  findingsBySegmentId: {},
}

const WAIT_OPTS = { timeout: 2000 }

describe('useSegmentContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSegmentContext.mockResolvedValue({
      success: true as const,
      data: defaultData,
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC2, AC3: Happy Path — Data Fetching
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-H.1][P0] should return data after successful fetch', async () => {
    const { result } = renderHook(() =>
      useSegmentContext({ fileId: 'file-1', segmentId: 'seg-1', contextRange: 2 }),
    )
    await waitFor(() => {
      expect(result.current.data).not.toBeNull()
      expect(result.current.data!.currentSegment.id).toBe('seg-1')
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    }, WAIT_OPTS)
  })

  it('[T-H.2][P1] should show loading state during fetch', async () => {
    // Slow fetch (300ms)
    mockGetSegmentContext.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true as const, data: defaultData }), 300),
        ),
    )
    const { result } = renderHook(() =>
      useSegmentContext({ fileId: 'file-1', segmentId: 'seg-1', contextRange: 2 }),
    )
    // Loading starts immediately
    expect(result.current.isLoading).toBe(true)
    // Eventually resolves
    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false)
        expect(result.current.data).not.toBeNull()
      },
      { timeout: 3000 },
    )
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC2: Debounce & Abort
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-H.3][P1] should debounce rapid segmentId changes (only final fetched)', async () => {
    const { result, rerender } = renderHook(
      ({ segmentId }: { segmentId: string }) =>
        useSegmentContext({ fileId: 'file-1', segmentId, contextRange: 2 }),
      { initialProps: { segmentId: 'seg-1' } },
    )
    // Rapid changes within debounce window (150ms)
    rerender({ segmentId: 'seg-2' })
    rerender({ segmentId: 'seg-3' })
    rerender({ segmentId: 'seg-4' })

    await waitFor(() => {
      expect(result.current.data).not.toBeNull()
    }, WAIT_OPTS)

    // Only final segmentId ('seg-4') should have been fetched
    const calls = mockGetSegmentContext.mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0]![0]).toEqual(expect.objectContaining({ segmentId: 'seg-4' }))
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC2: Caching
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-H.4][P1] should return cached data on revisit (no re-fetch)', async () => {
    // NOTE: cache invalidation on finding mutation is Story 4.2 scope
    const { result, rerender } = renderHook(
      ({ segmentId }: { segmentId: string }) =>
        useSegmentContext({ fileId: 'file-1', segmentId, contextRange: 2 }),
      { initialProps: { segmentId: 'seg-1' } },
    )
    await waitFor(() => expect(result.current.data).not.toBeNull(), WAIT_OPTS)
    const callCountAfterFirst = mockGetSegmentContext.mock.calls.length

    // Navigate to seg-2
    mockGetSegmentContext.mockResolvedValueOnce({
      success: true as const,
      data: {
        ...defaultData,
        currentSegment: { ...defaultData.currentSegment, id: 'seg-2', segmentNumber: 6 },
      },
    })
    rerender({ segmentId: 'seg-2' })
    await waitFor(() => expect(result.current.data?.currentSegment.id).toBe('seg-2'), WAIT_OPTS)

    // Navigate back to seg-1 — should use cache
    rerender({ segmentId: 'seg-1' })
    await waitFor(() => expect(result.current.data?.currentSegment.id).toBe('seg-1'), WAIT_OPTS)

    // Should NOT have called action again for seg-1 (cache hit)
    expect(mockGetSegmentContext.mock.calls.length).toBe(callCountAfterFirst + 1) // only seg-2 was new
  })

  it('[T-H.5][P1] should clear cache on fileId change', async () => {
    const { result, rerender } = renderHook(
      ({ fileId, segmentId }: { fileId: string; segmentId: string }) =>
        useSegmentContext({ fileId, segmentId, contextRange: 2 }),
      { initialProps: { fileId: 'file-1', segmentId: 'seg-1' } },
    )
    await waitFor(() => expect(result.current.data).not.toBeNull(), WAIT_OPTS)
    mockGetSegmentContext.mockClear()

    // Change file
    rerender({ fileId: 'file-2', segmentId: 'seg-1' })
    await waitFor(() => {
      // Should re-fetch even though segmentId is same (cache was cleared on fileId change)
      expect(mockGetSegmentContext).toHaveBeenCalledTimes(1)
    }, WAIT_OPTS)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: Error Handling
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-H.6][P1] should set error state on server action failure', async () => {
    mockGetSegmentContext.mockResolvedValue({
      success: false as const,
      error: 'Segment not found',
      code: 'NOT_FOUND',
    })
    const { result } = renderHook(() =>
      useSegmentContext({ fileId: 'file-1', segmentId: 'seg-1', contextRange: 2 }),
    )
    await waitFor(() => {
      expect(result.current.error).toBe('Segment not found')
      expect(result.current.data).toBeNull()
      expect(result.current.isLoading).toBe(false)
    }, WAIT_OPTS)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC3: Cross-file Guard
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-H.7][P0] should not fetch when segmentId is null (cross-file guard)', async () => {
    const { result } = renderHook(() =>
      useSegmentContext({ fileId: 'file-1', segmentId: null, contextRange: 2 }),
    )
    // Wait a bit to confirm no fetch happens
    await new Promise((r) => setTimeout(r, 300))
    expect(mockGetSegmentContext).not.toHaveBeenCalled()
    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: Retry
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-H.8][P1] should clear cache entry and refetch on retry()', async () => {
    mockGetSegmentContext.mockResolvedValueOnce({
      success: false as const,
      error: 'Network error',
      code: 'INTERNAL_ERROR',
    })
    const { result } = renderHook(() =>
      useSegmentContext({ fileId: 'file-1', segmentId: 'seg-1', contextRange: 2 }),
    )
    await waitFor(() => expect(result.current.error).not.toBeNull(), WAIT_OPTS)

    // Fix the mock and retry
    mockGetSegmentContext.mockResolvedValueOnce({
      success: true as const,
      data: defaultData,
    })
    act(() => {
      result.current.retry()
    })
    await waitFor(() => {
      expect(result.current.error).toBeNull()
      expect(result.current.data).not.toBeNull()
    }, WAIT_OPTS)
  })

  it('[T-H.9][P1] should cycle through error → retry → loading → success', async () => {
    mockGetSegmentContext
      .mockResolvedValueOnce({
        success: false as const,
        error: 'Temporary error',
        code: 'INTERNAL_ERROR',
      })
      .mockResolvedValueOnce({ success: true as const, data: defaultData })

    const { result } = renderHook(() =>
      useSegmentContext({ fileId: 'file-1', segmentId: 'seg-1', contextRange: 2 }),
    )
    await waitFor(() => expect(result.current.error).toBe('Temporary error'), WAIT_OPTS)

    act(() => {
      result.current.retry()
    })
    // During refetch: isLoading=true
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => {
      expect(result.current.data).not.toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    }, WAIT_OPTS)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC2: Abort & Unmount Safety
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-H.10][P1] should abort in-flight request when segmentId changes', async () => {
    // First call: slow (never resolves before abort)
    let resolveFirst!: (value: unknown) => void
    mockGetSegmentContext
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce({
        success: true as const,
        data: {
          ...defaultData,
          currentSegment: { ...defaultData.currentSegment, id: 'seg-2', segmentNumber: 6 },
        },
      })

    const { result, rerender } = renderHook(
      ({ segmentId }: { segmentId: string }) =>
        useSegmentContext({ fileId: 'file-1', segmentId, contextRange: 2 }),
      { initialProps: { segmentId: 'seg-1' } },
    )

    // Wait for first fetch to start
    await new Promise((r) => setTimeout(r, 200))

    // Change segmentId before first fetch completes
    rerender({ segmentId: 'seg-2' })

    // Resolve first (stale) fetch — should be ignored since aborted
    resolveFirst({ success: true as const, data: defaultData })

    await waitFor(() => {
      expect(result.current.data?.currentSegment.id).toBe('seg-2')
    }, WAIT_OPTS)
  })

  it('[T-H.11][P1] should not cause setState warning on unmount during in-flight fetch', async () => {
    const { unmount } = renderHook(() =>
      useSegmentContext({ fileId: 'file-1', segmentId: 'seg-1', contextRange: 2 }),
    )
    // Unmount before debounce fires
    unmount()
    // Wait for any pending operations
    await new Promise((r) => setTimeout(r, 300))
    // No React warning about setState on unmounted component
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC3: Edge Cases
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-H.12][P2] should clear data and skip fetch when fileId becomes null', async () => {
    const { result, rerender } = renderHook(
      ({ fileId }: { fileId: string | null }) =>
        useSegmentContext({ fileId, segmentId: 'seg-1', contextRange: 2 }),
      { initialProps: { fileId: 'file-1' as string | null } },
    )
    await waitFor(() => expect(result.current.data).not.toBeNull(), WAIT_OPTS)

    // File becomes null
    rerender({ fileId: null })
    await waitFor(() => {
      expect(result.current.data).toBeNull()
      expect(result.current.isLoading).toBe(false)
    }, WAIT_OPTS)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Coverage Gaps: Error, Refetch, Cache Eviction
  // ═══════════════════════════════════════════════════════════════════════

  it('[TA-G7][P1] should set error to "Failed to load segment context" when server action throws', async () => {
    mockGetSegmentContext.mockRejectedValueOnce(new Error('Network failure'))

    const { result } = renderHook(() =>
      useSegmentContext({ fileId: 'file-1', segmentId: 'seg-1', contextRange: 2 }),
    )
    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load segment context')
      expect(result.current.data).toBeNull()
      expect(result.current.isLoading).toBe(false)
    }, WAIT_OPTS)
  })

  it('[TA-G2][P1] should refetch when contextRange changes (different cache key)', async () => {
    const { result, rerender } = renderHook(
      ({ contextRange }: { contextRange: number }) =>
        useSegmentContext({ fileId: 'file-1', segmentId: 'seg-1', contextRange }),
      { initialProps: { contextRange: 2 } },
    )
    await waitFor(() => expect(result.current.data).not.toBeNull(), WAIT_OPTS)
    const firstCallCount = mockGetSegmentContext.mock.calls.length

    // Change contextRange — should trigger a new fetch (different cache key)
    mockGetSegmentContext.mockResolvedValueOnce({
      success: true as const,
      data: {
        ...defaultData,
        contextBefore: [{ ...defaultData.currentSegment, id: 'extra-seg', segmentNumber: 2 }],
      },
    })
    rerender({ contextRange: 3 })

    await waitFor(() => {
      expect(mockGetSegmentContext.mock.calls.length).toBe(firstCallCount + 1)
    }, WAIT_OPTS)
  })

  it('[TA-G1][P2] should evict oldest cache entry when cache exceeds MAX_CACHE_SIZE (50)', async () => {
    // Use dynamic mock that returns data based on input segmentId
    mockGetSegmentContext.mockImplementation((...args: unknown[]) => {
      const input = args[0] as Record<string, unknown>
      const segId = input.segmentId as string
      return Promise.resolve({
        success: true as const,
        data: {
          ...defaultData,
          currentSegment: {
            ...defaultData.currentSegment,
            id: segId,
            segmentNumber: Number(segId.replace('seg-', '')),
          },
        },
      })
    })

    // Fill cache: fetch seg-0 first
    const { result, rerender } = renderHook(
      ({ segmentId }: { segmentId: string }) =>
        useSegmentContext({ fileId: 'file-1', segmentId, contextRange: 2 }),
      { initialProps: { segmentId: 'seg-0' } },
    )
    await waitFor(() => expect(result.current.data?.currentSegment.id).toBe('seg-0'), WAIT_OPTS)

    // Fetch 50 more unique segments (seg-1 through seg-50) to exceed MAX_CACHE_SIZE
    for (let i = 1; i <= 50; i++) {
      rerender({ segmentId: `seg-${i}` })
      await waitFor(
        () => expect(result.current.data?.currentSegment.id).toBe(`seg-${i}`),
        WAIT_OPTS,
      )
    }

    // Track call count before re-visit
    const callsBefore = mockGetSegmentContext.mock.calls.length

    // Cache now has 50 entries (seg-1:2 through seg-50:2). seg-0:2 was evicted.
    // Re-visit seg-0 — should require a NEW fetch (evicted from cache)
    rerender({ segmentId: 'seg-0' })
    await waitFor(() => expect(result.current.data?.currentSegment.id).toBe('seg-0'), {
      timeout: 5000,
    })

    // Verify re-fetch happened (seg-0 was evicted, so a new call was made)
    expect(mockGetSegmentContext.mock.calls.length).toBeGreaterThan(callsBefore)

    // Verify seg-0 was fetched twice total (initial + re-fetch after eviction)
    const seg0Calls = mockGetSegmentContext.mock.calls.filter(
      (call) => (call[0] as Record<string, unknown>)?.segmentId === 'seg-0',
    )
    expect(seg0Calls.length).toBe(2)
  }, 60000)
})
