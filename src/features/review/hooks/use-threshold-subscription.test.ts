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
        new: { l2_confidence_min: 80, l3_confidence_min: 90 },
        old: { l2_confidence_min: 70, l3_confidence_min: 80 },
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
        new: { l2_confidence_min: 80, l3_confidence_min: 90 },
        old: { l2_confidence_min: 70, l3_confidence_min: 80 },
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
        new: { l2_confidence_min: 71, l3_confidence_min: 81 },
        old: {},
      })
      updateCallback?.({
        eventType: 'UPDATE',
        new: { l2_confidence_min: 72, l3_confidence_min: 82 },
        old: {},
      })
      updateCallback?.({
        eventType: 'UPDATE',
        new: { l2_confidence_min: 73, l3_confidence_min: 83 },
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
