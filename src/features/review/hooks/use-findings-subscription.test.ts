/**
 * ATDD Tests — Story 3.2c: L2 Results Display & Score Update
 * AC7: New Realtime findings subscription hook
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Supabase client mock — mirrors pattern from use-score-subscription.test.ts
const mockChannel = {
  on: vi.fn().mockReturnValue(undefined as unknown),
  subscribe: vi.fn(),
}
mockChannel.on.mockReturnValue(mockChannel)

// Polling fallback mock chain: supabase.from().select().eq().eq().order()
// Each .eq() returns an object with .eq() (chainable) + .order()
const mockOrder = vi.fn((..._args: unknown[]) => Promise.resolve({ data: [], error: null }))
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
import { buildDbFinding } from '@/test/factories'

describe('useFindingsSubscription', () => {
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

  it('[P0] should add finding to findingsMap on INSERT event', async () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    // Get the INSERT handler from the .on() call
    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    const newFinding = buildDbFinding({ fileId: 'file-abc' })
    // Use async act() to flush queueMicrotask batch buffer
    await act(async () => {
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

  // ── P0: UPDATE syncs finding in store (accept/reject status change) ──

  it('[P0] should update finding in findingsMap on UPDATE event', async () => {
    // Pre-populate a finding
    useReviewStore.getState().setFinding('finding-update-1', {
      id: 'finding-update-1',
      tenantId: '',
      projectId: '',
      sessionId: '',
      segmentId: 'seg-1',
      severity: 'major',
      category: 'accuracy',
      status: 'pending',
      description: 'Original description',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileId: 'file-abc',
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

    renderHook(() => useFindingsSubscription('file-abc'))

    // Get the UPDATE handler
    const updateCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'UPDATE',
    )
    expect(updateCall).toBeDefined()
    const onUpdateHandler = updateCall![2] as (payload: { new: Record<string, unknown> }) => void

    act(() => {
      onUpdateHandler({
        new: {
          id: 'finding-update-1',
          severity: 'major',
          category: 'accuracy',
          description: 'Original description',
          detected_by_layer: 'L2',
          ai_confidence: 85,
          status: 'accepted',
          file_id: 'file-abc',
          updated_at: new Date(Date.now() + 1000).toISOString(), // newer than pre-populated
        },
      })
    })

    const updated = useReviewStore.getState().findingsMap.get('finding-update-1')
    expect(updated).toBeDefined()
    expect(updated!.status).toBe('accepted')
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

  // ── P0: Burst INSERT batching via queueMicrotask ──

  it('[P0] should batch burst INSERT events into single state update via queueMicrotask', async () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    // Track batch vs individual calls to verify batching
    const setFindingsSpy = vi.spyOn(useReviewStore.getState(), 'setFindings')
    const setFindingSpy = vi.spyOn(useReviewStore.getState(), 'setFinding')

    // Fire 5 INSERT events synchronously then flush microtask with async act()
    await act(async () => {
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

    // Batched: single setFindings (plural) call, NO individual setFinding calls
    expect(setFindingsSpy).toHaveBeenCalledTimes(1)
    expect(setFindingSpy).not.toHaveBeenCalled()

    // All 5 findings should be in the store
    const map = useReviewStore.getState().findingsMap
    expect(map.size).toBeGreaterThanOrEqual(5)
    expect(map.has('finding-0')).toBe(true)
    expect(map.has('finding-4')).toBe(true)

    setFindingsSpy.mockRestore()
    setFindingSpy.mockRestore()
  })

  // ── P0: INSERT+DELETE re-process idempotency (T7.7) ──

  it('[P0] should handle INSERT+DELETE+INSERT for re-process idempotency', async () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const deleteCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'DELETE',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void
    const onDeleteHandler = deleteCall![2] as (payload: { old: Record<string, unknown> }) => void

    const findingPayload = {
      id: 'finding-reprocess',
      severity: 'major',
      category: 'accuracy',
      description: 'Original finding',
      detected_by_layer: 'L2',
      ai_confidence: 80,
      status: 'pending',
      file_id: 'file-abc',
    }

    // Step 1: INSERT original finding (async act to flush queueMicrotask)
    await act(async () => {
      onInsertHandler({ new: findingPayload })
    })
    expect(useReviewStore.getState().findingsMap.has('finding-reprocess')).toBe(true)

    // Step 2: DELETE (re-process clears findings) — DELETE is synchronous, no batch buffer
    act(() => {
      onDeleteHandler({ old: { id: 'finding-reprocess' } })
    })
    expect(useReviewStore.getState().findingsMap.has('finding-reprocess')).toBe(false)

    // Step 3: INSERT again (re-process creates new findings)
    await act(async () => {
      onInsertHandler({
        new: { ...findingPayload, description: 'Re-processed finding', ai_confidence: 90 },
      })
    })

    const reprocessed = useReviewStore.getState().findingsMap.get('finding-reprocess')
    expect(reprocessed).toBeDefined()
    expect(reprocessed!.description).toBe('Re-processed finding')
    expect(reprocessed!.aiConfidence).toBe(90)
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

  // ── P1: SUBSCRIBED stops polling ──

  it('[P1] should stop polling when channel transitions to SUBSCRIBED', async () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    const subscribeCallback = mockChannel.subscribe.mock.calls[0]![0] as (status: string) => void

    // Start polling first
    act(() => {
      subscribeCallback('CHANNEL_ERROR')
    })
    await vi.advanceTimersByTimeAsync(0)

    // Then SUBSCRIBED should stop polling
    act(() => {
      subscribeCallback('SUBSCRIBED')
    })

    mockFrom.mockClear()
    await vi.advanceTimersByTimeAsync(60_000)
    // No more polling calls after SUBSCRIBED
    expect(mockFrom).not.toHaveBeenCalled()
  })

  // ── P1: INSERT with invalid data is ignored ──

  it('[P1] should ignore INSERT event with invalid severity', async () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    await act(async () => {
      onInsertHandler({ new: { id: 'bad-finding', severity: 'invalid_severity' } })
    })

    expect(useReviewStore.getState().findingsMap.has('bad-finding')).toBe(false)
  })

  // ── P1: INSERT with missing id is ignored ──

  it('[P1] should ignore INSERT event with missing id', async () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    const sizeBefore = useReviewStore.getState().findingsMap.size
    await act(async () => {
      onInsertHandler({ new: { severity: 'major' } })
    })

    expect(useReviewStore.getState().findingsMap.size).toBe(sizeBefore)
  })

  // ── P1: DELETE with missing id is ignored ──

  it('[P1] should ignore DELETE event with missing id', () => {
    useReviewStore.getState().setFinding('finding-keep', {
      id: 'finding-keep',
      tenantId: '',
      projectId: '',
      sessionId: '',
      segmentId: '',
      severity: 'major',
      category: '',
      status: 'pending',
      description: '',
      createdAt: '',
      updatedAt: '',
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

    const deleteCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'DELETE',
    )
    const onDeleteHandler = deleteCall![2] as (payload: { old: Record<string, unknown> }) => void

    act(() => {
      onDeleteHandler({ old: { id: 123 } }) // non-string id
    })

    expect(useReviewStore.getState().findingsMap.has('finding-keep')).toBe(true)
  })

  // ── P1: UPDATE with invalid data is ignored ──

  it('[P1] should ignore UPDATE event with invalid severity', () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    const updateCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'UPDATE',
    )
    const onUpdateHandler = updateCall![2] as (payload: { new: Record<string, unknown> }) => void

    const setFindingSpy = vi.spyOn(useReviewStore.getState(), 'setFinding')

    act(() => {
      onUpdateHandler({ new: { id: 'bad', severity: 999 } })
    })

    expect(setFindingSpy).not.toHaveBeenCalled()
    setFindingSpy.mockRestore()
  })

  // ── P1: mapRowToFinding with fallback values for non-string fields ──

  it('[P1] should map row with non-string optional fields to Finding with defaults', async () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    // Minimal valid data + numeric/null for optional fields
    await act(async () => {
      onInsertHandler({
        new: {
          id: 'finding-defaults',
          severity: 'minor',
          category: 123, // non-string → fallback ''
          description: null, // non-string → fallback ''
          detected_by_layer: 'INVALID', // invalid → fallback 'L1'
          status: 'INVALID_STATUS', // invalid → fallback 'pending'
          ai_confidence: 'not-a-number', // non-number → fallback null
          segment_count: 'string', // non-number → fallback 1
          scope: 123, // non-string → fallback 'per-file'
          related_file_ids: 'not-array', // non-array → fallback null
        },
      })
    })

    const finding = useReviewStore.getState().findingsMap.get('finding-defaults')
    expect(finding).toBeDefined()
    expect(finding!.category).toBe('')
    expect(finding!.description).toBe('')
    expect(finding!.detectedByLayer).toBe('L1')
    expect(finding!.status).toBe('pending')
    expect(finding!.aiConfidence).toBeNull()
    expect(finding!.segmentCount).toBe(1)
    expect(finding!.scope).toBe('per-file')
    expect(finding!.relatedFileIds).toBeNull()
  })

  // ── M4: announce() called on burst INSERT flush (Guardrail #33) ──

  it('[P1] should call announce() with count after batched INSERT flush', async () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    await act(async () => {
      onInsertHandler({
        new: {
          id: 'f1',
          severity: 'major',
          category: 'accuracy',
          status: 'pending',
          file_id: 'file-abc',
          detected_by_layer: 'L2',
        },
      })
      onInsertHandler({
        new: {
          id: 'f2',
          severity: 'minor',
          category: 'style',
          status: 'pending',
          file_id: 'file-abc',
          detected_by_layer: 'L2',
        },
      })
      onInsertHandler({
        new: {
          id: 'f3',
          severity: 'critical',
          category: 'accuracy',
          status: 'pending',
          file_id: 'file-abc',
          detected_by_layer: 'L2',
        },
      })
    })

    // announce() should be called once with the batch count
    expect(mockAnnounce).toHaveBeenCalledTimes(1)
    expect(mockAnnounce).toHaveBeenCalledWith('3 new AI findings added')
  })

  it('[P1] should call announce() with singular form for 1 finding', async () => {
    renderHook(() => useFindingsSubscription('file-abc'))

    const insertCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) => (call[1] as Record<string, unknown>)?.event === 'INSERT',
    )
    const onInsertHandler = insertCall![2] as (payload: { new: Record<string, unknown> }) => void

    await act(async () => {
      onInsertHandler({
        new: {
          id: 'single',
          severity: 'major',
          category: 'accuracy',
          status: 'pending',
          file_id: 'file-abc',
          detected_by_layer: 'L2',
        },
      })
    })

    expect(mockAnnounce).toHaveBeenCalledWith('1 new AI finding added')
  })

  // ── TD-TENANT-003: tenantId filter (Story 4.1a) ──

  it('[T5.1][P0] should include tenant_id in Realtime filter when tenantId provided', () => {
    renderHook(() => useFindingsSubscription('file-abc', 'tenant-xyz'))

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

  it('[T5.3][P0] should include tenant_id in polling fallback query', async () => {
    renderHook(() => useFindingsSubscription('file-abc', 'tenant-xyz'))

    // Trigger polling fallback
    const subscribeCallback = mockChannel.subscribe.mock.calls[0]?.[0] as
      | ((status: string) => void)
      | undefined
    if (subscribeCallback) {
      await act(async () => {
        subscribeCallback('CHANNEL_ERROR')
      })
    }

    // Advance timer past initial poll delay
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    // Verify .eq('tenant_id', 'tenant-xyz') is called in the polling chain
    expect(mockEq).toHaveBeenCalledWith('tenant_id', 'tenant-xyz')
  })
})
