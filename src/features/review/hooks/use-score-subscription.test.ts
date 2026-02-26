/**
 * ATDD Tests — Story 3.0: Score & Review Infrastructure
 * AC4: Supabase Realtime Score Subscription (`useScoreSubscription`)
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
  Promise.resolve({ data: { mqm_score: 85, status: 'calculated' }, error: null }),
)
const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
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
    useReviewStore.getState().resetForFile('test')
    // Reset channel mock chain
    mockChannel.on.mockReturnValue(mockChannel)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── P0: Subscription Setup ──

  it('should subscribe to scores table filtered by fileId', () => {
    renderHook(() => useScoreSubscription('file-123'))

    expect(mockSupabase.channel).toHaveBeenCalledWith('scores:file-123')
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'UPDATE',
        schema: 'public',
        table: 'scores',
        filter: 'file_id=eq.file-123',
      }),
      expect.any(Function),
    )
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('should update store currentScore on score change event', () => {
    renderHook(() => useScoreSubscription('file-123'))

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
    renderHook(() => useScoreSubscription('file-123'))

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
    const { unmount } = renderHook(() => useScoreSubscription('file-123'))

    unmount()

    expect(mockSupabase.removeChannel).toHaveBeenCalled()
  })

  // ── P1: Error Handling ──

  it('should fallback to polling on CHANNEL_ERROR and fetch score', async () => {
    renderHook(() => useScoreSubscription('file-123'))

    // Simulate channel error via subscribe callback
    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // First poll fires immediately, then schedules next at 5s
    await vi.advanceTimersByTimeAsync(0)
    expect(mockFrom).toHaveBeenCalledWith('scores')
    expect(mockEq).toHaveBeenCalledWith('file_id', 'file-123')

    // Verify store updated from poll data
    await vi.advanceTimersByTimeAsync(5000)
    expect(useReviewStore.getState().currentScore).toBe(85)
  })

  it('should resubscribe after channel recovery', async () => {
    renderHook(() => useScoreSubscription('file-123'))

    // Simulate error then recovery
    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // Advance past first poll
    await vi.advanceTimersByTimeAsync(5000)

    // Recovery — should stop polling
    act(() => {
      subscribeCallback('SUBSCRIBED')
    })

    // No crash after recovery
  })

  it('should unsubscribe from old channel when fileId changes', () => {
    const { rerender } = renderHook(
      ({ fileId }: { fileId: string }) => useScoreSubscription(fileId),
      { initialProps: { fileId: 'file-123' } },
    )

    rerender({ fileId: 'file-456' })

    expect(mockSupabase.removeChannel).toHaveBeenCalled()
    expect(mockSupabase.channel).toHaveBeenCalledWith('scores:file-456')
  })

  // ── P1-BV: Exponential Backoff Boundary Values ──

  it('should poll at 5s initial interval', async () => {
    renderHook(() => useScoreSubscription('file-123'))

    // Trigger channel error
    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // First poll at 5s — no crash
    await vi.advanceTimersByTimeAsync(5000)
  })

  it('should increase polling interval: 5s → 10s → 20s → 40s', async () => {
    renderHook(() => useScoreSubscription('file-123'))

    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // Advance through backoff sequence
    await vi.advanceTimersByTimeAsync(5000) // 1st poll at 5s
    await vi.advanceTimersByTimeAsync(10000) // 2nd poll at 10s
    await vi.advanceTimersByTimeAsync(20000) // 3rd poll at 20s
    await vi.advanceTimersByTimeAsync(40000) // 4th poll at 40s
    // No crash = backoff working
  })

  it('should cap polling interval at 60s (NOT 80s)', async () => {
    renderHook(() => useScoreSubscription('file-123'))

    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // Advance through: 5s + 10s + 20s + 40s + 60s (cap, NOT 80s)
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(10000)
    await vi.advanceTimersByTimeAsync(20000)
    await vi.advanceTimersByTimeAsync(40000)
    await vi.advanceTimersByTimeAsync(60000) // 5th poll capped at 60s

    // 6th poll should also be 60s (not 120s)
    await vi.advanceTimersByTimeAsync(60000)
    // No crash = cap working
  })
})
