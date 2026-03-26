/**
 * Tests — useScoreSubscription (Story 3.0 AC4 + Story 4.0 TD-REVIEW-002)
 * Supabase Realtime Score Subscription with polling fallback
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Supabase client mock
const mockChannel = {
  on: vi.fn().mockReturnValue(undefined as unknown),
  subscribe: vi.fn(),
}
// Chain .on() to return self
mockChannel.on.mockReturnValue(mockChannel)

// Polling fallback mock chain: supabase.from().select().eq().single()
const mockSingle = vi.fn((..._args: unknown[]) =>
  Promise.resolve({
    data: { mqm_score: 85, status: 'calculated' } as { mqm_score: number; status: string } | null,
    error: null as { message: string } | null,
  }),
)
// S4 fix: mockEq must be chainable — code calls .eq('file_id').eq('tenant_id').single()
const mockEqResult: Record<string, unknown> = { single: mockSingle }
const mockEq = vi.fn().mockReturnValue(mockEqResult)
mockEqResult.eq = mockEq // chainable: .eq().eq() returns self
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

const mockSupabase = {
  channel: vi.fn().mockReturnValue(mockChannel),
  removeChannel: vi.fn(),
  from: mockFrom,
}

vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => mockSupabase,
}))

import { useScoreSubscription } from '@/features/review/hooks/use-score-subscription'
import { useReviewStore } from '@/features/review/stores/review.store'

describe('useScoreSubscription', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // CR-H1: set currentFileId to match subscription fileId ('file-123')
    // so the H1 guard (currentFileId !== fileId → skip write) doesn't block
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('file-123')
    // Reset channel mock chain
    mockChannel.on.mockReturnValue(mockChannel)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── P0: Subscription Setup ──

  it('should subscribe to INSERT (primary) and UPDATE (secondary) on scores table', () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    expect(mockSupabase.channel).toHaveBeenCalledWith('scores:file-123')

    // INSERT is primary — scoreFile uses DELETE+INSERT lifecycle (AC6 bug fix)
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        schema: 'public',
        table: 'scores',
        filter: 'file_id=eq.file-123&tenant_id=eq.tenant-test',
      }),
      expect.any(Function),
    )

    // UPDATE is secondary safety net for backward compatibility
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'UPDATE',
        schema: 'public',
        table: 'scores',
        filter: 'file_id=eq.file-123&tenant_id=eq.tenant-test',
      }),
      expect.any(Function),
    )

    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('should update store currentScore on score change event', () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    // Simulate Realtime payload
    const onHandler = mockChannel.on.mock.calls[0]![2] as (payload: {
      new: { mqm_score: number; status: string }
    }) => void
    act(() => {
      onHandler({
        new: { mqm_score: 92, status: 'calculated' },
      })
    })

    expect(useReviewStore.getState().currentScore).toBe(92)
  })

  it('should update store scoreStatus on score change event', () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    const onHandler = mockChannel.on.mock.calls[0]![2] as (payload: {
      new: { mqm_score: number; status: string }
    }) => void
    act(() => {
      onHandler({
        new: { mqm_score: 92, status: 'calculated' },
      })
    })

    expect(useReviewStore.getState().scoreStatus).toBe('calculated')
  })

  // ── P0: Cleanup ──

  it('should cleanup channel on unmount', () => {
    const { unmount } = renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    unmount()

    expect(mockSupabase.removeChannel).toHaveBeenCalled()
  })

  // ── P1: Error Handling ──

  it('should fallback to polling on CHANNEL_ERROR and fetch score', async () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    // Simulate channel error via subscribe callback
    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // First poll fires immediately, then schedules next at 5s
    await vi.advanceTimersByTimeAsync(0)
    expect(mockFrom).toHaveBeenCalledWith('scores')
    expect(mockSelect).toHaveBeenCalledWith(
      'mqm_score, status, layer_completed, auto_pass_rationale',
    )
    expect(mockEq).toHaveBeenCalledWith('file_id', 'file-123')
    // CR-R2 M2: verify polling path also filters by tenant_id (S4 fix)
    expect(mockEq).toHaveBeenCalledWith('tenant_id', 'tenant-test')

    // Verify store updated from poll data
    await vi.advanceTimersByTimeAsync(5000)
    expect(useReviewStore.getState().currentScore).toBe(85)
  })

  it('should resubscribe after channel recovery and stop polling', async () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    // Simulate error then recovery
    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // Advance past first poll — verify store was updated by polling
    await vi.advanceTimersByTimeAsync(5000)
    const callsBeforeRecovery = mockFrom.mock.calls.length
    expect(callsBeforeRecovery).toBeGreaterThanOrEqual(1)
    expect(useReviewStore.getState().currentScore).toBe(85)

    // Recovery — should stop polling
    act(() => {
      subscribeCallback('SUBSCRIBED')
    })

    // After recovery, no more polls should fire
    await vi.advanceTimersByTimeAsync(60000)
    expect(mockFrom.mock.calls.length).toBe(callsBeforeRecovery)
  })

  it('should unsubscribe from old channel when fileId changes', () => {
    const { rerender } = renderHook(
      ({ fileId }: { fileId: string }) => useScoreSubscription(fileId, 'tenant-test'),
      { initialProps: { fileId: 'file-123' } },
    )

    rerender({ fileId: 'file-456' })

    expect(mockSupabase.removeChannel).toHaveBeenCalled()
    expect(mockSupabase.channel).toHaveBeenCalledWith('scores:file-456')
  })

  // ── P1-BV: Exponential Backoff Boundary Values ──

  it('should poll at 5s initial interval', async () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    // Trigger channel error
    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // Immediate poll fires first
    await vi.advanceTimersByTimeAsync(0)
    const callsAfterImmediate = mockFrom.mock.calls.length
    expect(callsAfterImmediate).toBeGreaterThanOrEqual(1)

    // After 5s, second poll fires
    await vi.advanceTimersByTimeAsync(5000)
    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsAfterImmediate)
  })

  it('should increase polling interval: 5s → 10s → 20s → 40s', async () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // Immediate poll
    await vi.advanceTimersByTimeAsync(0)
    const callsAfterImmediate = mockFrom.mock.calls.length

    // Advance through backoff sequence
    await vi.advanceTimersByTimeAsync(5000) // 1st scheduled poll at 5s
    const callsAfter5s = mockFrom.mock.calls.length
    expect(callsAfter5s).toBeGreaterThan(callsAfterImmediate)

    await vi.advanceTimersByTimeAsync(10000) // 2nd poll at 10s
    const callsAfter10s = mockFrom.mock.calls.length
    expect(callsAfter10s).toBeGreaterThan(callsAfter5s)

    await vi.advanceTimersByTimeAsync(20000) // 3rd poll at 20s
    const callsAfter20s = mockFrom.mock.calls.length
    expect(callsAfter20s).toBeGreaterThan(callsAfter10s)

    await vi.advanceTimersByTimeAsync(40000) // 4th poll at 40s
    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsAfter20s)
  })

  it('should cap polling interval at 60s (NOT 80s)', async () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // Advance through: immediate + 5s + 10s + 20s + 40s + 60s (cap, NOT 80s)
    await vi.advanceTimersByTimeAsync(0) // immediate
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(10000)
    await vi.advanceTimersByTimeAsync(20000)
    await vi.advanceTimersByTimeAsync(40000)

    const callsBeforeCap = mockFrom.mock.calls.length
    await vi.advanceTimersByTimeAsync(60000) // 5th poll capped at 60s
    const callsAfterCap = mockFrom.mock.calls.length
    expect(callsAfterCap).toBeGreaterThan(callsBeforeCap)

    // 6th poll should also be 60s (not 120s)
    await vi.advanceTimersByTimeAsync(60000)
    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsAfterCap)
  })

  // ── Story 3.2c AC6: BUG FIX — INSERT event + layerCompleted ──

  it('[P0] should subscribe to INSERT event (not UPDATE) — BUG FIX for score lifecycle', () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    // Verify that at least one .on() call uses INSERT event
    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    expect(insertCall).toBeDefined()
    expect(insertCall![1]).toEqual(
      expect.objectContaining({
        event: 'INSERT',
        schema: 'public',
        table: 'scores',
        filter: 'file_id=eq.file-123&tenant_id=eq.tenant-test',
      }),
    )
  })

  it('[P0] should pass layer_completed from Realtime INSERT payload to updateScore', () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    // Find the INSERT handler
    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    act(() => {
      onInsertHandler({
        new: {
          mqm_score: 88.5,
          status: 'calculated',
          layer_completed: 'L1L2',
        },
      })
    })

    const state = useReviewStore.getState()
    expect(state.currentScore).toBe(88.5)
    expect(state.scoreStatus).toBe('calculated')
    // layerCompleted should be updated via the extended updateScore signature
    expect(state.layerCompleted).toBe('L1L2')
  })

  it('[P0] should include layer_completed in polling fallback select', async () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    await vi.advanceTimersByTimeAsync(0)
    // Verify polling select includes layer_completed column
    expect(mockSelect).toHaveBeenCalledWith(expect.stringContaining('layer_completed'))
  })

  // ── TA: Coverage Gap Tests ──

  // B9 [P1]: score=0 in Realtime payload — falsy but valid number
  it('[P1] should update store when mqm_score is 0 (falsy but valid boundary)', () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    const onHandler = mockChannel.on.mock.calls[0]![2] as (payload: {
      new: Record<string, unknown>
    }) => void
    act(() => {
      onHandler({
        new: { mqm_score: 0, status: 'calculated' },
      })
    })

    expect(useReviewStore.getState().currentScore).toBe(0)
    expect(useReviewStore.getState().scoreStatus).toBe('calculated')
  })

  // B6 [P2]: polling interval resets to 5s after recovery then re-error
  it('[P2] should reset polling interval to 5s after recovery and re-error', async () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void

    // First error → start polling → advance through backoff
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })
    await vi.advanceTimersByTimeAsync(0) // immediate poll
    await vi.advanceTimersByTimeAsync(5000) // 5s
    await vi.advanceTimersByTimeAsync(10000) // 10s (interval doubled)

    // Recovery → stop polling and reset interval
    act(() => {
      subscribeCallback('SUBSCRIBED')
    })

    const callsAfterRecovery = mockFrom.mock.calls.length

    // Second error → should restart at 5s (not 20s)
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })
    await vi.advanceTimersByTimeAsync(0) // immediate poll
    const callsAfterImmediate = mockFrom.mock.calls.length
    expect(callsAfterImmediate).toBeGreaterThan(callsAfterRecovery)

    // At 5s (initial interval), next poll should fire
    await vi.advanceTimersByTimeAsync(5000)
    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsAfterImmediate)
  })

  // F6 [P1]: handleScoreChange ignores non-number mqm_score
  it('[P1] should not update store when mqm_score is not a number', () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    const onHandler = mockChannel.on.mock.calls[0]![2] as (payload: {
      new: Record<string, unknown>
    }) => void
    act(() => {
      onHandler({
        new: { mqm_score: '85', status: 'calculated' },
      })
    })

    expect(useReviewStore.getState().currentScore).toBeNull()
  })

  // F7 [P1]: handleScoreChange ignores invalid status string
  it('[P1] should not update store when status is not a valid ScoreStatus', () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    const onHandler = mockChannel.on.mock.calls[0]![2] as (payload: {
      new: Record<string, unknown>
    }) => void
    act(() => {
      onHandler({
        new: { mqm_score: 92, status: 'invalid_status' },
      })
    })

    expect(useReviewStore.getState().currentScore).toBeNull()
  })

  // F8 [P2]: non-string layer_completed passes null to store
  it('[P2] should pass null layerCompleted when layer_completed is not a string', () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    const onHandler = mockChannel.on.mock.calls[0]![2] as (payload: {
      new: Record<string, unknown>
    }) => void
    act(() => {
      onHandler({
        new: { mqm_score: 92, status: 'calculated', layer_completed: 123 },
      })
    })

    expect(useReviewStore.getState().currentScore).toBe(92)
    expect(useReviewStore.getState().layerCompleted).toBeNull()
  })

  it('[P2] should not update store when polling .single() returns no data', async () => {
    // Override mockSingle to return null data (no score row)
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'No rows found' } })

    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    // Trigger channel error to start polling
    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // First poll fires immediately
    await vi.advanceTimersByTimeAsync(0)

    // Store should remain at default values (no update from empty poll)
    expect(useReviewStore.getState().currentScore).toBeNull()
    expect(useReviewStore.getState().scoreStatus).toBe('na')
  })

  // ── TD-TENANT-003: tenantId filter (Story 4.1a) ──

  it('[T5.2][P0] should include tenant_id in Realtime filter when tenantId provided', () => {
    renderHook(() => useScoreSubscription('file-abc', 'tenant-xyz'))

    // Verify .on() is called with a filter containing tenant_id compound filter
    const onCalls = mockChannel.on.mock.calls as unknown[][]
    const hasCompoundFilter = onCalls.some((callArgs) => {
      const filterConfig = callArgs[1] as Record<string, unknown> | undefined
      if (!filterConfig) return false
      const filter = filterConfig.filter as string | undefined
      return filter?.includes('tenant_id=eq.tenant-xyz')
    })
    expect(hasCompoundFilter).toBe(true)
  })

  // ── Story 4.0 TD Regression ──

  it('[P1] TD7: should update autoPassRationale on Realtime transition to auto_passed', () => {
    renderHook(() => useScoreSubscription('file-123', 'tenant-test'))

    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    act(() => {
      onInsertHandler({
        new: {
          mqm_score: 98.5,
          status: 'auto_passed',
          layer_completed: 'L1L2',
          auto_pass_rationale: 'Score 98.5 exceeds threshold 95.0 with 0 critical findings',
        },
      })
    })

    expect(useReviewStore.getState().currentScore).toBe(98.5)
    expect(useReviewStore.getState().scoreStatus).toBe('auto_passed')
    expect(useReviewStore.getState().autoPassRationale).toBe(
      'Score 98.5 exceeds threshold 95.0 with 0 critical findings',
    )
  })
})
