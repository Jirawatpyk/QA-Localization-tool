/**
 * Story 4.3 Gap — G4: overrideInFlightRef double-click guard pattern
 * Regression test for CR-R1-H2.
 *
 * Verifies the ref-based guard pattern used in ReviewPageClient to prevent
 * concurrent overrideSeverity calls. The pattern:
 *   if (inFlightRef.current) return
 *   inFlightRef.current = true
 *   await action()
 *   finally { inFlightRef.current = false }
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type InFlightGuard = {
  current: boolean
}

function createGuardedAction(guard: InFlightGuard, actionFn: () => Promise<void>) {
  return async (): Promise<'blocked' | 'completed'> => {
    if (guard.current) return 'blocked'
    guard.current = true
    try {
      await actionFn()
      return 'completed'
    } finally {
      guard.current = false
    }
  }
}

describe('In-flight guard pattern', () => {
  let guard: InFlightGuard
  let actionFn: ReturnType<typeof vi.fn<() => Promise<void>>>

  beforeEach(() => {
    vi.clearAllMocks()
    guard = { current: false }
    actionFn = vi.fn(
      (..._args: unknown[]) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 100)
        }),
    )
  })

  it('[P1] G4: should block second call while first is in-flight', async () => {
    vi.useFakeTimers()

    const guarded = createGuardedAction(guard, actionFn)

    // First call starts — sets guard.current = true
    const firstPromise = guarded()

    // Second call while first in-flight — should be blocked immediately
    const secondResult = await guarded()

    expect(secondResult).toBe('blocked')
    expect(actionFn).toHaveBeenCalledOnce()

    // Complete the first call
    await vi.advanceTimersByTimeAsync(100)
    const firstResult = await firstPromise

    expect(firstResult).toBe('completed')
    expect(guard.current).toBe(false)

    vi.useRealTimers()
  })

  it('[P1] G4b: should allow new call after first completes', async () => {
    vi.useFakeTimers()

    const guarded = createGuardedAction(guard, actionFn)

    // First call
    const firstPromise = guarded()
    await vi.advanceTimersByTimeAsync(100)
    await firstPromise

    // Guard should be released
    expect(guard.current).toBe(false)

    // Second call should succeed
    const secondPromise = guarded()
    await vi.advanceTimersByTimeAsync(100)
    const secondResult = await secondPromise

    expect(secondResult).toBe('completed')
    expect(actionFn).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('[P1] G4c: should release guard even when action throws', async () => {
    const failingAction = vi.fn((..._args: unknown[]) => Promise.reject(new Error('action failed')))
    const guarded = createGuardedAction(guard, failingAction)

    // First call throws — guard must still be released via finally
    await expect(guarded()).rejects.toThrow('action failed')
    expect(guard.current).toBe(false)

    // Subsequent call should NOT be blocked
    const failingAction2 = vi.fn((..._args: unknown[]) =>
      Promise.reject(new Error('action failed again')),
    )
    const guarded2 = createGuardedAction(guard, failingAction2)
    await expect(guarded2()).rejects.toThrow('action failed again')
    expect(failingAction2).toHaveBeenCalledOnce()
  })
})
