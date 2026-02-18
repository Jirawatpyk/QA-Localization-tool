import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock sonner
vi.mock('sonner', () => ({
  toast: { info: vi.fn() },
}))

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}))

// Mock Supabase
const mockSignOut = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: { signOut: mockSignOut },
  }),
}))

describe('useIdleTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should not sign out before timeout', async () => {
    const { useIdleTimeout } = await import('./useIdleTimeout')
    renderHook(() => useIdleTimeout())

    // Advance 7 hours (less than 8 hour timeout)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000)
    })

    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('should sign out after 8 hours of inactivity', async () => {
    const { useIdleTimeout } = await import('./useIdleTimeout')
    renderHook(() => useIdleTimeout())

    // Advance 8 hours
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8 * 60 * 60 * 1000)
    })

    expect(mockSignOut).toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/login?reason=session_expired')
  })

  it('should reset timer on user activity', async () => {
    const { useIdleTimeout } = await import('./useIdleTimeout')
    renderHook(() => useIdleTimeout())

    // Advance 7 hours
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000)
    })

    // Simulate user activity
    act(() => {
      window.dispatchEvent(new Event('mousedown'))
    })

    // Advance another 7 hours (only 7 from last activity)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7 * 60 * 60 * 1000)
    })

    // Should NOT have signed out
    expect(mockSignOut).not.toHaveBeenCalled()

    // Advance 1 more hour (8 hours since last activity)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1 * 60 * 60 * 1000)
    })

    expect(mockSignOut).toHaveBeenCalled()
  })
})
