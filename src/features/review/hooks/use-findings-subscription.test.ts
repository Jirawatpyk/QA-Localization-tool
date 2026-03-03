/**
 * ATDD Tests — Story 3.2c: L2 Results Display & Score Update
 * AC7: New Realtime findings subscription hook
 *
 * TDD RED PHASE — all tests are `it.skip()`.
 * Dev removes `.skip` and makes tests pass during implementation.
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Supabase client mock — mirrors pattern from use-score-subscription.test.ts
const mockChannel = {
  on: vi.fn().mockReturnValue(undefined as unknown),
  subscribe: vi.fn(),
}
mockChannel.on.mockReturnValue(mockChannel)

// Polling fallback mock chain: supabase.from().select().eq().order()
const mockOrder = vi.fn((..._args: unknown[]) => Promise.resolve({ data: [], error: null }))
const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
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

import { useFindingsSubscription } from '@/features/review/hooks/use-findings-subscription'
import { useReviewStore } from '@/features/review/stores/review.store'
import { buildDbFinding } from '@/test/factories'

describe('useFindingsSubscription', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    useReviewStore.getState().resetForFile('test')
    mockChannel.on.mockReturnValue(mockChannel)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── P0: Subscription setup ──

  it('[P0] should subscribe to findings table with filter file_id=eq.${fileId}', () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    expect(mockSupabase.channel).toHaveBeenCalledWith('findings:file-abc')
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        schema: 'public',
        table: 'findings',
        filter: 'file_id=eq.file-abc',
      }),
      expect.any(Function),
    )
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  // ── P0: INSERT adds finding to store ──

  it('[P0] should add finding to findingsMap on INSERT event', () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    // Get the INSERT handler from the .on() call
    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    const newFinding = buildDbFinding({ fileId: 'file-abc' })
    act(() => {
      onInsertHandler({
        new: {
          id: 'finding-1',
          severity: newFinding.severity,
          category: newFinding.category,
          description: newFinding.description,
          detected_by_layer: newFinding.detectedByLayer,
          ai_confidence: newFinding.aiConfidence,
          status: newFinding.status,
          file_id: 'file-abc',
        },
      })
    })

    expect(useReviewStore.getState().findingsMap.has('finding-1')).toBe(true)
  })

  // ── P0: DELETE removes finding from store ──

  it('[P0] should remove finding from findingsMap on DELETE event', () => {
    // Pre-populate a finding
    const finding = buildDbFinding({ fileId: 'file-abc' })
    useReviewStore.getState().setFinding('finding-1', {
      id: 'finding-1',
      tenantId: finding.tenantId!,
      projectId: finding.projectId!,
      sessionId: 'session-1',
      segmentId: finding.segmentId!,
      severity: finding.severity as 'critical' | 'major' | 'minor',
      category: finding.category!,
      status: 'pending',
      description: finding.description!,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileId: 'file-abc',
      detectedByLayer: 'L1',
      aiModel: null,
      aiConfidence: null,
      suggestedFix: null,
      sourceTextExcerpt: null,
      targetTextExcerpt: null,
      segmentCount: 1,
      scope: 'per-file',
      reviewSessionId: null,
      relatedFileIds: null,
    })

    renderHook(() => useFindingsSubscription('file-abc'))

    // Get the DELETE handler
    const deleteCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'DELETE',
    )
    const onDeleteHandler = deleteCall![2] as (payload: { old: Record<string, unknown> }) => void

    act(() => {
      onDeleteHandler({ old: { id: 'finding-1' } })
    })

    expect(useReviewStore.getState().findingsMap.has('finding-1')).toBe(false)
  })

  // ── P0: Burst INSERT batching ──

  it('[P0] should batch burst INSERT events into single state update', () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    // Fire 5 INSERT events rapidly (simulating L2 burst)
    act(() => {
      for (let i = 0; i < 5; i++) {
        onInsertHandler({
          new: {
            id: `finding-${i}`,
            severity: 'major',
            category: 'accuracy',
            description: `Finding ${i}`,
            detected_by_layer: 'L2',
            ai_confidence: 85,
            status: 'pending',
            file_id: 'file-abc',
          },
        })
      }
    })

    // All 5 findings should be in the store
    const map = useReviewStore.getState().findingsMap
    expect(map.size).toBeGreaterThanOrEqual(5)
    expect(map.has('finding-0')).toBe(true)
    expect(map.has('finding-4')).toBe(true)
  })

  // ── P1: Cleanup on unmount ──

  it('[P1] should cleanup on unmount by calling removeChannel()', () => {
    const { unmount } = renderHook(() => useFindingsSubscription('file-abc'))

    unmount()

    expect(mockSupabase.removeChannel).toHaveBeenCalled()
  })

  // ── P1: Polling fallback ──

  it('[P1] should activate polling fallback when Realtime unavailable', async () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    // Simulate channel error
    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })

    // First poll fires immediately
    await vi.advanceTimersByTimeAsync(0)
    expect(mockFrom).toHaveBeenCalledWith('findings')
    expect(mockEq).toHaveBeenCalledWith('file_id', 'file-abc')
  })
})
