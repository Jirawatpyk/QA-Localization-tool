/**
 * ATDD Tests — Story 3.5: Score Lifecycle & Confidence Display
 * AC: useThresholdSubscription — Realtime channel + polling fallback + cleanup
 */
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Supabase Realtime mock ──
// Must be set up before mock() calls so the mock factory can reference them

const mockChannel = {
  on: vi.fn().mockReturnValue(undefined as unknown),
  subscribe: vi.fn().mockReturnValue(undefined as unknown),
  unsubscribe: vi.fn(),
}
// Chain .on() and .subscribe() return self (Supabase Realtime pattern — NOT mockReturnThis())
mockChannel.on.mockReturnValue(mockChannel)
mockChannel.subscribe.mockReturnValue(mockChannel)

// Polling fallback: supabase.from().select().eq().single()
const mockSingle = vi.fn((..._args: unknown[]) =>
  Promise.resolve({
    data: {
      l2_confidence_min: 75,
      l3_confidence_min: 85,
    },
    error: null as { message: string } | null,
  }),
)
const mockEqResult = { single: mockSingle } as Record<string, unknown>
const mockEq = vi.fn().mockReturnValue(mockEqResult)
mockEqResult.eq = mockEq // make .eq() chainable for compound tenant filter
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

// ── Store mock — threshold update store ──
const mockUpdateThresholds = vi.fn((..._args: unknown[]) => undefined)

vi.mock('@/features/review/stores/review.store', () => ({
  useReviewStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      updateThresholds: mockUpdateThresholds,
      l2ConfidenceMin: 70,
      l3ConfidenceMin: 80,
    }),
  ),
}))

// ── Toast mock (sonner) — must be hoisted ──
const mockToast = vi.hoisted(() => ({
  success: vi.fn((..._args: unknown[]) => undefined),
  error: vi.fn((..._args: unknown[]) => undefined),
}))

vi.mock('sonner', () => ({
  toast: mockToast,
}))

// ── Import hook under test ──
import { useThresholdSubscription } from '@/features/review/hooks/use-threshold-subscription'

// ── Tests ──

describe('useThresholdSubscription', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // Reset channel mock chain after clearAllMocks
    mockChannel.on.mockReturnValue(mockChannel)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // 3.5-U-048: Realtime event updates threshold in state
  it('[P1] should update threshold in store when Realtime UPDATE event fires', async () => {
    // Arrange: hook subscribes to language_pair_configs table changes
    const { unmount } = renderHook(() => useThresholdSubscription('en-US', 'th-TH'))

    // Capture the callback registered for UPDATE events on language_pair_configs
    const onCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) =>
        typeof call[1] === 'object' &&
        call[1] !== null &&
        (call[1] as Record<string, unknown>).event === 'UPDATE',
    )
    const updateCallback = onCall?.[2] as ((payload: unknown) => void) | undefined

    // Simulate Realtime UPDATE event with new thresholds
    act(() => {
      updateCallback?.({
        eventType: 'UPDATE',
        new: { l2_confidence_min: 80, l3_confidence_min: 90, target_lang: 'th-TH' },
        old: { l2_confidence_min: 70, l3_confidence_min: 80, target_lang: 'th-TH' },
      })
    })

    // Assert: store updateThresholds called with new values
    expect(mockUpdateThresholds).toHaveBeenCalledWith(
      expect.objectContaining({
        l2ConfidenceMin: 80,
        l3ConfidenceMin: 90,
      }),
    )

    unmount()
  })

  // 3.5-U-049: Toast "Confidence thresholds updated" shown on change
  it('[P1] should show toast "Confidence thresholds updated" when thresholds change via Realtime', async () => {
    // Arrange
    const { unmount } = renderHook(() => useThresholdSubscription('en-US', 'th-TH'))

    const onCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) =>
        typeof call[1] === 'object' &&
        call[1] !== null &&
        (call[1] as Record<string, unknown>).event === 'UPDATE',
    )
    const updateCallback = onCall?.[2] as ((payload: unknown) => void) | undefined

    // Simulate threshold change
    act(() => {
      updateCallback?.({
        eventType: 'UPDATE',
        new: { l2_confidence_min: 80, l3_confidence_min: 90, target_lang: 'th-TH' },
        old: { l2_confidence_min: 70, l3_confidence_min: 80, target_lang: 'th-TH' },
      })
    })

    // Advance past debounce window (500ms)
    await vi.advanceTimersByTimeAsync(600)

    // Assert: toast success message shown to reviewer
    expect(mockToast.success).toHaveBeenCalledWith(
      expect.stringMatching(/confidence.*threshold|threshold.*updated/i),
    )

    unmount()
  })

  // 3.5-U-050: cleanup calls channel.unsubscribe() on unmount
  it('[P0] should call channel.unsubscribe() when hook is unmounted', () => {
    // Arrange: hook creates a Realtime subscription
    const { unmount } = renderHook(() => useThresholdSubscription('en-US', 'th-TH'))

    // Act: unmount the hook (e.g., navigating away from review page)
    unmount()

    // Assert: cleanup removes the channel subscription to prevent memory leaks
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel)
  })

  // 3.5-U-051: Fallback polling starts on channel subscription error
  it('[P1] should start polling fallback when Realtime channel subscription fails', async () => {
    // Arrange: channel.subscribe() calls error callback (Supabase subscription failure)
    mockChannel.subscribe.mockImplementation((callback: (status: string) => void) => {
      callback('CHANNEL_ERROR')
    })

    // Act: render hook — subscription error triggers polling fallback
    renderHook(() => useThresholdSubscription('en-US', 'th-TH'))

    // Advance timers to trigger first polling interval (e.g., 30s)
    await vi.advanceTimersByTimeAsync(30_000)

    // Assert: polling query was made to fetch thresholds from DB directly
    expect(mockFrom).toHaveBeenCalledWith('language_pair_configs')
    expect(mockSelect).toHaveBeenCalled()
  })

  // CR-H1: targetLang filter in callback — prevents cross-language-pair contamination
  it('[P1] should ignore Realtime events for different targetLang (FM-8.2)', () => {
    // Arrange: hook subscribes for 'en-US' -> 'th-TH'
    const { unmount } = renderHook(() => useThresholdSubscription('en-US', 'th-TH'))

    const onCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) =>
        typeof call[1] === 'object' &&
        call[1] !== null &&
        (call[1] as Record<string, unknown>).event === 'UPDATE',
    )
    const updateCallback = onCall?.[2] as ((payload: unknown) => void) | undefined

    // Simulate UPDATE for a different target language (en-US -> ja-JP)
    act(() => {
      updateCallback?.({
        eventType: 'UPDATE',
        new: { l2_confidence_min: 90, l3_confidence_min: 95, target_lang: 'ja-JP' },
        old: { l2_confidence_min: 70, l3_confidence_min: 80, target_lang: 'ja-JP' },
      })
    })

    // Assert: store NOT updated — event was for a different language pair
    expect(mockUpdateThresholds).not.toHaveBeenCalled()

    unmount()
  })

  // CR-L2: empty targetLang skips subscription entirely
  it('[P1] should skip subscription when targetLang is empty string', () => {
    // Arrange: targetLang not yet resolved (null -> '' fallback)
    renderHook(() => useThresholdSubscription('en-US', ''))

    // Assert: no channel created — subscription skipped
    expect(mockSupabase.channel).not.toHaveBeenCalled()
  })

  // 3.5-U-052: Rapid changes -> debounced toast (not shown per change)
  it('[P2] should debounce toast so rapid threshold changes show only one notification', async () => {
    // Arrange: multiple rapid Realtime events arrive within debounce window
    const { unmount } = renderHook(() => useThresholdSubscription('en-US', 'th-TH'))

    const onCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) =>
        typeof call[1] === 'object' &&
        call[1] !== null &&
        (call[1] as Record<string, unknown>).event === 'UPDATE',
    )
    const updateCallback = onCall?.[2] as ((payload: unknown) => void) | undefined

    // Simulate 3 rapid changes within 500ms
    act(() => {
      updateCallback?.({
        eventType: 'UPDATE',
        new: { l2_confidence_min: 71, l3_confidence_min: 81, target_lang: 'th-TH' },
        old: {},
      })
      updateCallback?.({
        eventType: 'UPDATE',
        new: { l2_confidence_min: 72, l3_confidence_min: 82, target_lang: 'th-TH' },
        old: {},
      })
      updateCallback?.({
        eventType: 'UPDATE',
        new: { l2_confidence_min: 73, l3_confidence_min: 83, target_lang: 'th-TH' },
        old: {},
      })
    })

    // Store is updated immediately for each change (no debounce on state)
    expect(mockUpdateThresholds).toHaveBeenCalledTimes(3)

    // But toast is debounced — should fire only ONCE after debounce settles
    await vi.advanceTimersByTimeAsync(1000) // Wait for debounce to settle

    // Assert: toast shown once despite 3 rapid changes
    expect(mockToast.success).toHaveBeenCalledTimes(1)

    unmount()
  })
})

// TA: Coverage Gap Tests (Story 3.5)

describe('useThresholdSubscription — TA: Coverage Gap Tests (Story 3.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // Reset channel mock chain after clearAllMocks
    mockChannel.on.mockReturnValue(mockChannel)
    mockChannel.subscribe.mockReturnValue(mockChannel)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // G6 [P1]: language pair change → cleanup old subscription + start new
  it('[P1] should cleanup old subscription and create new one when language pair changes (G6)', () => {
    // First render: subscribe for en-US -> th-TH
    const { rerender, unmount } = renderHook(
      ({ source, target }: { source: string; target: string }) =>
        useThresholdSubscription(source, target),
      { initialProps: { source: 'en-US', target: 'th-TH' } },
    )

    // Verify first channel was created
    expect(mockSupabase.channel).toHaveBeenCalledWith('thresholds:en-US:th-TH')
    const firstCallCount = mockSupabase.removeChannel.mock.calls.length

    // Re-render with different target language: en-US -> ja-JP
    rerender({ source: 'en-US', target: 'ja-JP' })

    // Old channel should be cleaned up (removeChannel called)
    expect(mockSupabase.removeChannel.mock.calls.length).toBeGreaterThan(firstCallCount)

    // New channel should be created for the new language pair
    expect(mockSupabase.channel).toHaveBeenCalledWith('thresholds:en-US:ja-JP')

    unmount()
  })

  // CM-5 [P1]: partial threshold update — only l2 changes, l3 is non-number → update blocked
  it('[P1] should NOT call updateThresholds when l3_confidence_min is not a number (CM-5)', () => {
    const { unmount } = renderHook(() => useThresholdSubscription('en-US', 'th-TH'))

    const onCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) =>
        typeof call[1] === 'object' &&
        call[1] !== null &&
        (call[1] as Record<string, unknown>).event === 'UPDATE',
    )
    const updateCallback = onCall?.[2] as ((payload: unknown) => void) | undefined

    // Simulate Realtime payload: l2 is number, but l3 is a non-number string
    act(() => {
      updateCallback?.({
        eventType: 'UPDATE',
        new: { l2_confidence_min: 85, l3_confidence_min: 'invalid', target_lang: 'th-TH' },
        old: {},
      })
    })

    // Both must be numbers — since l3 is 'invalid', updateThresholds should NOT be called
    expect(mockUpdateThresholds).not.toHaveBeenCalled()

    unmount()
  })

  // G14 [P2]: Realtime payload with null thresholds → type guard blocks
  it('[P2] should NOT call updateThresholds when thresholds are null in Realtime payload (G14)', () => {
    const { unmount } = renderHook(() => useThresholdSubscription('en-US', 'th-TH'))

    const onCall = mockChannel.on.mock.calls.find(
      (call: unknown[]) =>
        typeof call[1] === 'object' &&
        call[1] !== null &&
        (call[1] as Record<string, unknown>).event === 'UPDATE',
    )
    const updateCallback = onCall?.[2] as ((payload: unknown) => void) | undefined

    // Simulate Realtime payload with null thresholds
    act(() => {
      updateCallback?.({
        eventType: 'UPDATE',
        new: { l2_confidence_min: null, l3_confidence_min: null, target_lang: 'th-TH' },
        old: {},
      })
    })

    // typeof null !== 'number' → both are null → updateThresholds should NOT be called
    expect(mockUpdateThresholds).not.toHaveBeenCalled()

    unmount()
  })

  // TD-TENANT-003 [P0]: tenantId compound filter on Realtime + polling
  it('[P0] should include tenant_id in Realtime filter when tenantId provided (TD-TENANT-003)', () => {
    const { unmount } = renderHook(() => useThresholdSubscription('en-US', 'th-TH', 'tenant-abc'))

    // Verify Realtime filter includes tenant_id compound filter
    const onCalls = mockChannel.on.mock.calls as unknown[][]
    const updateCall = onCalls.find(
      (call) =>
        typeof call[1] === 'object' &&
        call[1] !== null &&
        (call[1] as Record<string, unknown>).event === 'UPDATE',
    )
    const filterConfig = updateCall?.[1] as Record<string, unknown> | undefined
    expect(filterConfig?.filter).toBe('source_lang=eq.en-US&tenant_id=eq.tenant-abc')

    unmount()
  })

  // TD-TENANT-003 [P0]: polling fallback includes tenant_id
  it('[P0] should include tenant_id in polling query when tenantId provided (TD-TENANT-003)', async () => {
    const { unmount } = renderHook(() => useThresholdSubscription('en-US', 'th-TH', 'tenant-abc'))

    // Trigger CHANNEL_ERROR → starts polling
    const subscribeFn = mockChannel.subscribe.mock.calls[0]?.[0] as
      | ((status: string) => void)
      | undefined
    act(() => subscribeFn?.('CHANNEL_ERROR'))

    // Advance timer to trigger poll
    await vi.advanceTimersByTimeAsync(30_000)

    // Verify .eq() was called with tenant_id
    const eqCalls = mockEq.mock.calls as unknown[][]
    const tenantEqCall = eqCalls.find((call) => call[0] === 'tenant_id' && call[1] === 'tenant-abc')
    expect(tenantEqCall).toBeDefined()

    unmount()
  })
})
