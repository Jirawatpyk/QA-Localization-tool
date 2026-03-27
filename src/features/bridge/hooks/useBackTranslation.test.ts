/**
 * ATDD Story 5.1 — useBackTranslation hook unit tests
 *
 * Tests the client-side hook:
 *   - 300ms debounce on segmentId change (AC2 / Guardrail #53)
 *   - AbortController cancels in-flight on segment change (Guardrail #75)
 *   - Stale guard: discard result if segmentId changed (AC2)
 *   - States: { data, loading, error, cached } (AC1)
 *   - skipCache parameter for manual refresh (AC2)
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the server action
const mockGetBackTranslation = vi.fn()
vi.mock('@/features/bridge/actions/getBackTranslation.action', () => ({
  getBackTranslation: (...args: unknown[]) => mockGetBackTranslation(...args),
}))

import { useBackTranslation } from './useBackTranslation'

const MOCK_SUCCESS = {
  success: true as const,
  data: {
    backTranslation: 'Hello',
    contextualExplanation: 'A greeting',
    confidence: 0.9,
    languageNotes: [],
    translationApproach: null,
    cached: false,
    latencyMs: 150,
  },
}

describe('useBackTranslation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockGetBackTranslation.mockResolvedValue(MOCK_SUCCESS)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── AC2 / Scenario 2.10 [P1]: 300ms debounce ──────────────────────────
  it('should debounce segment focus changes by 300ms', async () => {
    const { rerender } = renderHook(
      ({ segmentId }) => useBackTranslation({ segmentId, projectId: 'p1' }),
      { initialProps: { segmentId: 'seg-1' as string | null } },
    )

    // Change segmentId rapidly
    rerender({ segmentId: 'seg-2' })
    rerender({ segmentId: 'seg-3' })

    // At 200ms — action should NOT have been called yet
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(mockGetBackTranslation).not.toHaveBeenCalled()

    // At 300ms — action should fire with last segmentId
    await act(async () => {
      vi.advanceTimersByTime(100)
    })
    expect(mockGetBackTranslation).toHaveBeenCalledTimes(1)
    expect(mockGetBackTranslation).toHaveBeenCalledWith(
      expect.objectContaining({ segmentId: 'seg-3' }),
    )
  })

  // ── AC2 / Scenario 2.11 [P1]: AbortController ─────────────────────────
  it('should cancel in-flight request via AbortController on segment change', async () => {
    // Start with seg-1 — let debounce fire
    const { rerender } = renderHook(
      ({ segmentId }) => useBackTranslation({ segmentId, projectId: 'p1' }),
      { initialProps: { segmentId: 'seg-1' as string | null } },
    )

    // Fire first debounce
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(mockGetBackTranslation).toHaveBeenCalledTimes(1)

    // Change segment — triggers new debounce + abort of previous
    rerender({ segmentId: 'seg-2' })

    // New debounce fires
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(mockGetBackTranslation).toHaveBeenCalledTimes(2)
    expect(mockGetBackTranslation).toHaveBeenLastCalledWith(
      expect.objectContaining({ segmentId: 'seg-2' }),
    )
  })

  // ── AC2 / Scenario 2.12 [P1]: Stale guard ─────────────────────────────
  it('should discard result if segmentId changed before response', async () => {
    // Slow response for seg-1
    let resolveSeg1: ((v: typeof MOCK_SUCCESS) => void) | undefined
    mockGetBackTranslation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSeg1 = resolve
        }),
    )

    const { result, rerender } = renderHook(
      ({ segmentId }) => useBackTranslation({ segmentId, projectId: 'p1' }),
      { initialProps: { segmentId: 'seg-1' as string | null } },
    )

    // Fire debounce for seg-1
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    // Change to seg-2 before seg-1 responds
    rerender({ segmentId: 'seg-2' })

    // Resolve seg-1 — should be discarded (stale guard)
    await act(async () => {
      resolveSeg1?.(MOCK_SUCCESS)
    })

    // Data should still be null (seg-1 result discarded, seg-2 pending)
    expect(result.current.data).toBeNull()
  })

  // ── AC1 / Scenario 1.2 [P1]: State shape ──────────────────────────────
  it('should expose { data, loading, error, cached } states', async () => {
    vi.useRealTimers() // waitFor needs real timers

    mockGetBackTranslation.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(MOCK_SUCCESS), 10)),
    )

    const { result } = renderHook(() => useBackTranslation({ segmentId: 'seg-1', projectId: 'p1' }))

    // Initial state
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.cached).toBe(false)

    // After debounce (300ms) + response
    await waitFor(
      () => {
        expect(result.current.data).not.toBeNull()
      },
      { timeout: 5000 },
    )
    expect(result.current.data?.backTranslation).toBe('Hello')
    expect(result.current.loading).toBe(false)
    expect(result.current.cached).toBe(false)

    vi.useFakeTimers() // restore for other tests
  })

  // ── AC2 / Scenario 2.13 [P2]: skipCache for manual refresh ────────────
  it('should pass skipCache=true when manual refresh requested', async () => {
    vi.useRealTimers() // waitFor needs real timers

    mockGetBackTranslation.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(MOCK_SUCCESS), 10)),
    )

    const { result } = renderHook(() => useBackTranslation({ segmentId: 'seg-1', projectId: 'p1' }))

    // Wait for initial load
    await waitFor(
      () => {
        expect(result.current.data).not.toBeNull()
      },
      { timeout: 5000 },
    )

    // Call refresh
    mockGetBackTranslation.mockClear()
    mockGetBackTranslation.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(MOCK_SUCCESS), 10)),
    )
    act(() => {
      result.current.refresh()
    })

    await waitFor(() => {
      expect(mockGetBackTranslation).toHaveBeenCalledWith(
        expect.objectContaining({ skipCache: true }),
      )
    })

    vi.useFakeTimers() // restore
  })

  // ── Edge: null segmentId → no request ──────────────────────────────────
  it('should not make request when segmentId is null', async () => {
    const { result } = renderHook(() => useBackTranslation({ segmentId: null, projectId: 'p1' }))

    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(mockGetBackTranslation).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeNull()
  })
})
