/**
 * P2-08 (Chaos #3): Poll + Realtime overlap produces no duplicates
 * Findings should be deduped by ID in findingsMap (Map<string, Finding>).
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Supabase client mock ──

const mockChannel = {
  on: vi.fn().mockReturnValue(undefined as unknown),
  subscribe: vi.fn(),
}
mockChannel.on.mockReturnValue(mockChannel)

const mockOrder = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
)
const mockEqResult = { order: mockOrder } as Record<string, unknown>
const mockEq = vi.fn().mockReturnValue(mockEqResult)
mockEqResult.eq = mockEq
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

vi.mock('@/features/review/utils/announce', () => ({
  announce: vi.fn(),
}))

import { useFindingsSubscription } from '@/features/review/hooks/use-findings-subscription'
import { useReviewStore } from '@/features/review/stores/review.store'

describe('useFindingsSubscription — dedup (P2-08)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('test')
    mockChannel.on.mockReturnValue(mockChannel)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('[P2] should dedup by id when poll returns finding A and Realtime pushes same finding A', async () => {
    // Step 1: Set up subscription
    renderHook(() => useFindingsSubscription('file-abc'))

    // Step 2: Simulate Realtime INSERT for finding A
    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    await act(async () => {
      onInsertHandler({
        new: {
          id: 'finding-A',
          severity: 'major',
          category: 'accuracy',
          description: 'Test finding A',
          detected_by_layer: 'L2',
          ai_confidence: 85,
          status: 'pending',
          file_id: 'file-abc',
        },
      })
    })

    // Step 3: Simulate polling returning the same finding A
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'finding-A',
          severity: 'major',
          category: 'accuracy',
          description: 'Test finding A',
          detected_by_layer: 'L2',
          ai_confidence: 85,
          status: 'pending',
          file_id: 'file-abc',
        },
      ],
      error: null,
    })

    // Trigger polling fallback
    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })
    await vi.advanceTimersByTimeAsync(0) // flush poll

    // Assert: findingsMap has exactly 1 entry (dedup by id)
    const map = useReviewStore.getState().findingsMap
    expect(map.size).toBe(1)
    expect(map.has('finding-A')).toBe(true)
  })

  it('[P2] should merge poll [A, B] and Realtime [B, C] into findingsMap with [A, B, C]', async () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    // Step 1: Poll returns [A, B]
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'finding-A',
          severity: 'major',
          category: 'accuracy',
          description: 'Finding A',
          detected_by_layer: 'L2',
          status: 'pending',
          file_id: 'file-abc',
        },
        {
          id: 'finding-B',
          severity: 'minor',
          category: 'fluency',
          description: 'Finding B',
          detected_by_layer: 'L2',
          status: 'pending',
          file_id: 'file-abc',
        },
      ],
      error: null,
    })

    // Trigger poll
    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })
    await vi.advanceTimersByTimeAsync(0)

    // Step 2: Realtime pushes [B, C] (B is duplicate, C is new)
    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    // Simulate SUBSCRIBED to stop polling, then push via Realtime
    act(() => {
      subscribeCallback('SUBSCRIBED')
    })

    await act(async () => {
      onInsertHandler({
        new: {
          id: 'finding-B',
          severity: 'minor',
          category: 'fluency',
          description: 'Finding B updated',
          detected_by_layer: 'L2',
          status: 'pending',
          file_id: 'file-abc',
        },
      })
      onInsertHandler({
        new: {
          id: 'finding-C',
          severity: 'critical',
          category: 'accuracy',
          description: 'Finding C',
          detected_by_layer: 'L3',
          status: 'pending',
          file_id: 'file-abc',
        },
      })
    })

    // Assert: findingsMap should have exactly 3 entries
    const map = useReviewStore.getState().findingsMap
    expect(map.has('finding-A')).toBe(true)
    expect(map.has('finding-B')).toBe(true)
    expect(map.has('finding-C')).toBe(true)
    expect(map.size).toBe(3)
  })
})
