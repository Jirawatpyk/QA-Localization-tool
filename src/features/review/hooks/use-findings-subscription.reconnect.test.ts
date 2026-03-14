/**
 * Epic 3 P1 Tests — Realtime Reconnect Stops Polling (P1-11, Chaos #2)
 * Tests: Channel error → polling starts → channel reconnects (SUBSCRIBED) → polling stops,
 * poll interval reset, and no duplicate findings from overlap during reconnect.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Supabase client mock — mirrors pattern from use-findings-subscription.test.ts
const mockChannel = {
  on: vi.fn().mockReturnValue(undefined as unknown),
  subscribe: vi.fn(),
}
mockChannel.on.mockReturnValue(mockChannel)

// Polling fallback mock chain: supabase.from().select().eq().eq().order()
const mockOrder = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
)
const mockEqResult = { order: mockOrder } as Record<string, unknown>
const mockEq = vi.fn().mockReturnValue(mockEqResult)
mockEqResult.eq = mockEq // make .eq() chainable
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

const mockAnnounce = vi.fn()
vi.mock('@/features/review/utils/announce', () => ({
  announce: (...args: unknown[]) => mockAnnounce(...args),
}))

import { useFindingsSubscription } from '@/features/review/hooks/use-findings-subscription'
import { useReviewStore } from '@/features/review/stores/review.store'

describe('useFindingsSubscription — reconnect (P1-11)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockAnnounce.mockClear()
    useReviewStore.getState().resetForFile('test')
    mockChannel.on.mockReturnValue(mockChannel)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('[P1] should stop polling when channel transitions from CHANNEL_ERROR to SUBSCRIBED', async () => {
    renderHook(() => useFindingsSubscription('file-reconnect'))

    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void

    // Phase 1: Channel error — polling starts
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // First poll fires immediately
    await vi.advanceTimersByTimeAsync(0)
    expect(mockFrom).toHaveBeenCalledWith('findings')

    // Verify polling is active — advance 5s, another poll fires
    mockFrom.mockClear()
    await vi.advanceTimersByTimeAsync(5000)
    expect(mockFrom).toHaveBeenCalled()

    // Phase 2: Channel reconnects — polling should stop
    act(() => {
      subscribeCallback('SUBSCRIBED')
    })

    // Clear mock to track only post-reconnect calls
    mockFrom.mockClear()

    // Advance well past any poll interval — no more polling calls
    await vi.advanceTimersByTimeAsync(120_000)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('[P1] should reset poll interval to 5s after reconnect', async () => {
    renderHook(() => useFindingsSubscription('file-interval'))

    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void

    // Error → polling starts at 5s
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })
    await vi.advanceTimersByTimeAsync(0) // initial poll

    // Let exponential backoff increase interval: 5s → 10s → 20s
    await vi.advanceTimersByTimeAsync(5_000) // 2nd poll at 5s
    await vi.advanceTimersByTimeAsync(10_000) // 3rd poll at 10s

    // Reconnect — polling stops, interval resets
    act(() => {
      subscribeCallback('SUBSCRIBED')
    })

    // Disconnect again — should start fresh at 5s, not continue from 20s
    mockFrom.mockClear()
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })
    await vi.advanceTimersByTimeAsync(0) // initial poll

    mockFrom.mockClear()
    // At exactly 5s, the next poll should fire (fresh 5s interval, not 20s)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(mockFrom).toHaveBeenCalled()
  })

  it('[P1] should not create duplicate findings when poll result overlaps with Realtime INSERT', async () => {
    // Set up a finding already in store (from Realtime INSERT before reconnect)
    useReviewStore.getState().setFinding('existing-finding', {
      id: 'existing-finding',
      tenantId: '',
      projectId: '',
      sessionId: '',
      segmentId: 'seg-1',
      severity: 'major',
      category: 'accuracy',
      status: 'pending',
      description: 'Existing finding from Realtime',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileId: 'file-overlap',
      detectedByLayer: 'L2',
      aiModel: null,
      aiConfidence: 85,
      suggestedFix: null,
      sourceTextExcerpt: null,
      targetTextExcerpt: null,
      segmentCount: 1,
      scope: 'per-file',
      reviewSessionId: null,
      relatedFileIds: null,
    })

    // Mock poll response includes the same finding + a new one
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'existing-finding',
          severity: 'major',
          category: 'accuracy',
          description: 'Existing finding from Realtime',
          detected_by_layer: 'L2',
          ai_confidence: 85,
          status: 'pending',
          file_id: 'file-overlap',
        },
        {
          id: 'new-finding-from-poll',
          severity: 'minor',
          category: 'style',
          description: 'New finding from poll',
          detected_by_layer: 'L1',
          ai_confidence: null,
          status: 'pending',
          file_id: 'file-overlap',
        },
      ],
      error: null,
    })

    renderHook(() => useFindingsSubscription('file-overlap'))

    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void

    // Trigger polling via channel error
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // Wait for poll to complete
    await vi.advanceTimersByTimeAsync(0)

    // Findings map should have exactly 2 entries — no duplicates
    const map = useReviewStore.getState().findingsMap
    expect(map.size).toBe(2)
    expect(map.has('existing-finding')).toBe(true)
    expect(map.has('new-finding-from-poll')).toBe(true)

    // The existing finding should be the poll version (poll replaces entire set)
    const existing = map.get('existing-finding')
    expect(existing).toBeDefined()
  })
})
