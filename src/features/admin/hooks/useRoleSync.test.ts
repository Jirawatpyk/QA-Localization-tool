import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock sonner
vi.mock('sonner', () => ({
  toast: { info: vi.fn() },
}))

// Mock next/navigation
const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}))

// Mock Supabase
const mockRefreshSession = vi.fn().mockResolvedValue({ data: {}, error: null })
const mockRemoveChannel = vi.fn()
let realtimeCallback: ((payload: unknown) => void) | null = null

const mockChannel = {
  on: vi.fn((_event: string, _filter: unknown, cb: (payload: unknown) => void) => {
    realtimeCallback = cb
    return mockChannel
  }),
  subscribe: vi.fn(() => mockChannel),
}

vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: { refreshSession: mockRefreshSession },
    channel: () => mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}))

describe('useRoleSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    realtimeCallback = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should not subscribe when userId is undefined', async () => {
    const { useRoleSync } = await import('./useRoleSync')
    renderHook(() => useRoleSync(undefined))

    expect(mockChannel.subscribe).not.toHaveBeenCalled()
  })

  it('should subscribe to user_roles changes for given userId', async () => {
    const { useRoleSync } = await import('./useRoleSync')
    renderHook(() => useRoleSync('user-123'))

    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'UPDATE',
        table: 'user_roles',
        filter: 'user_id=eq.user-123',
      }),
      expect.any(Function),
    )
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('should refresh session when role change detected', async () => {
    const { useRoleSync } = await import('./useRoleSync')
    renderHook(() => useRoleSync('user-123'))

    // Simulate realtime role change event
    await act(async () => {
      realtimeCallback?.({ new: { role: 'qa_reviewer' } })
    })

    expect(mockRefreshSession).toHaveBeenCalled()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('should poll every 5 minutes as fallback', async () => {
    const { useRoleSync } = await import('./useRoleSync')
    renderHook(() => useRoleSync('user-123'))

    // Advance 5 minutes
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })

    expect(mockRefreshSession).toHaveBeenCalled()
  })

  it('should cleanup subscription and interval on unmount', async () => {
    const { useRoleSync } = await import('./useRoleSync')
    const { unmount } = renderHook(() => useRoleSync('user-123'))

    unmount()

    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel)
  })
})
