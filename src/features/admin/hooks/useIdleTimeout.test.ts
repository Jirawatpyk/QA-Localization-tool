import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock sonner
const mockToastInfo = vi.fn()
const mockToastWarning = vi.fn()
vi.mock('sonner', () => ({
  toast: { info: mockToastInfo, warning: mockToastWarning },
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// Mock Supabase
const mockSignOut = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: { signOut: mockSignOut },
  }),
}))

describe('useIdleTimeout', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
  })

  it('should not sign out before timeout', async () => {
    const { useIdleTimeout } = await import('./useIdleTimeout')
    renderHook(() => useIdleTimeout())

    // Advance 20 minutes (less than 25 min warning threshold)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000)
    })

    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockToastWarning).not.toHaveBeenCalled()
  })

  it('should show warning toast at 25 minutes (5 min before expiry)', async () => {
    const { useIdleTimeout } = await import('./useIdleTimeout')
    renderHook(() => useIdleTimeout())

    // Advance 25 minutes (30 - 5 = warning threshold)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25 * 60 * 1000)
    })

    expect(mockToastWarning).toHaveBeenCalledWith(
      'Session expires in 5 minutes due to inactivity',
      { duration: 10000 },
    )
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('should sign out after 30 minutes of inactivity', async () => {
    const { useIdleTimeout } = await import('./useIdleTimeout')
    renderHook(() => useIdleTimeout())

    // Advance 30 minutes
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    })

    expect(mockSignOut).toHaveBeenCalled()
    expect(window.location.href).toBe('/login?reason=session_expired')
  })

  it('should reset timer on user activity', async () => {
    const { useIdleTimeout } = await import('./useIdleTimeout')
    renderHook(() => useIdleTimeout())

    // Advance 25 minutes
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25 * 60 * 1000)
    })

    // Simulate user activity — should reset both timers
    act(() => {
      window.dispatchEvent(new Event('mousedown'))
    })

    // Advance another 25 minutes (only 25 from last activity)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25 * 60 * 1000)
    })

    // Should NOT have signed out (only 25 min since activity)
    expect(mockSignOut).not.toHaveBeenCalled()

    // Advance 5 more minutes (30 minutes since last activity)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    })

    expect(mockSignOut).toHaveBeenCalled()
  })

  it('should pause timer when tab goes hidden and resume when visible', async () => {
    const { useIdleTimeout } = await import('./useIdleTimeout')
    renderHook(() => useIdleTimeout())

    // Advance 10 minutes (tab visible) — 20 min remaining
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    })

    // Tab goes hidden — timer should pause, timers cleared
    act(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // Tab becomes visible after "1 minute" (fake timers advanced Date.now during hidden)
    // With fake timers, Date.now() advances with advanceTimersByTime, so elapsed = 1 min
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1 * 60 * 1000)
    })

    act(() => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // remaining = 20 min - 1 min elapsed while hidden = 19 min
    // Advance 18 minutes — should NOT timeout yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(18 * 60 * 1000)
    })
    expect(mockSignOut).not.toHaveBeenCalled()

    // Advance 1 more minute — should now expire (19 min remaining used up)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1 * 60 * 1000)
    })
    expect(mockSignOut).toHaveBeenCalled()
  })
})
