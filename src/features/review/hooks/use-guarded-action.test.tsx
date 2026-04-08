import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock the three hooks useGuardedAction depends on. We control their return
// values per test to exercise every branch of the guard layer.
const mockIsReadOnly = vi.fn()
const mockSelfAssignIfNeeded = vi.fn()
const mockAnnounceReadOnly = vi.fn()

vi.mock('@/features/review/hooks/use-read-only-mode', () => ({
  useReadOnlyMode: () => mockIsReadOnly(),
  useLockGuard: () => ({
    isReadOnly: mockIsReadOnly(),
    selfAssignIfNeeded: mockSelfAssignIfNeeded,
  }),
  useReadOnlyAnnouncer: () => mockAnnounceReadOnly,
}))

import { toast } from 'sonner'

import { useGuardedAction } from './use-guarded-action'

const FILE_ID = 'file-1'
const PROJECT_ID = 'project-1'
const LABEL = 'approve file'

describe('useGuardedAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsReadOnly.mockReturnValue(false)
    mockSelfAssignIfNeeded.mockResolvedValue('proceed')
  })

  it('Layer 1: read-only → announces + returns readonly + does NOT run action', async () => {
    mockIsReadOnly.mockReturnValue(true)
    const action = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useGuardedAction())

    let outcome: string = ''
    await act(async () => {
      outcome = await result.current(LABEL, FILE_ID, PROJECT_ID, action)
    })

    expect(outcome).toBe('readonly')
    expect(mockAnnounceReadOnly).toHaveBeenCalledWith(LABEL)
    expect(mockSelfAssignIfNeeded).not.toHaveBeenCalled()
    expect(action).not.toHaveBeenCalled()
  })

  it('Layer 2: in-flight guard — second concurrent call returns in-flight without running', async () => {
    // Make self-assign hang so we can observe the in-flight state
    let resolveSelfAssign: (value: 'proceed') => void = () => {}
    mockSelfAssignIfNeeded.mockImplementation(
      () =>
        new Promise<'proceed'>((resolve) => {
          resolveSelfAssign = resolve
        }),
    )
    const action = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useGuardedAction())

    let firstPromise: Promise<string> = Promise.resolve('')
    let secondOutcome: string = ''
    await act(async () => {
      // Kick off first call (hangs at await selfAssignIfNeeded)
      firstPromise = result.current(LABEL, FILE_ID, PROJECT_ID, action)
      // Yield a microtask so the first call enters the try block
      await Promise.resolve()
      // Second call while first is in-flight
      secondOutcome = await result.current(LABEL, FILE_ID, PROJECT_ID, action)
      // Now let the first call finish
      resolveSelfAssign('proceed')
      await firstPromise
    })

    expect(secondOutcome).toBe('in-flight')
    expect(action).toHaveBeenCalledTimes(1) // only the first call ran
    // R5-M4: assert the second call short-circuited AT Layer 2 (in-flight ref)
    // BEFORE reaching Layer 3 (selfAssignIfNeeded). If a regression moved the
    // ref flip back to AFTER the await, the second call would reach selfAssign
    // and this assertion would fail — catching the race immediately.
    expect(mockSelfAssignIfNeeded).toHaveBeenCalledTimes(1)
  })

  it('Layer 3: self-assign conflict → returns conflict + does NOT run action', async () => {
    mockSelfAssignIfNeeded.mockResolvedValue('conflict')
    const action = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useGuardedAction())

    let outcome: string = ''
    await act(async () => {
      outcome = await result.current(LABEL, FILE_ID, PROJECT_ID, action)
    })

    expect(outcome).toBe('conflict')
    expect(mockSelfAssignIfNeeded).toHaveBeenCalledWith(FILE_ID, PROJECT_ID)
    expect(action).not.toHaveBeenCalled()
  })

  it('Layer 3: self-assign throw → returns error + toast + does NOT run action', async () => {
    mockSelfAssignIfNeeded.mockRejectedValue(new Error('network'))
    const action = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useGuardedAction())

    let outcome: string = ''
    await act(async () => {
      outcome = await result.current(LABEL, FILE_ID, PROJECT_ID, action)
    })

    expect(outcome).toBe('error')
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining(`Failed to acquire lock for ${LABEL}`),
    )
    expect(action).not.toHaveBeenCalled()
  })

  it('Layer 4: happy path → returns ran + action was invoked', async () => {
    const action = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useGuardedAction())

    let outcome: string = ''
    await act(async () => {
      outcome = await result.current(LABEL, FILE_ID, PROJECT_ID, action)
    })

    expect(outcome).toBe('ran')
    expect(action).toHaveBeenCalledTimes(1)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('Layer 5: action throw → returns threw + toast', async () => {
    const action = vi.fn().mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useGuardedAction())

    let outcome: string = ''
    await act(async () => {
      outcome = await result.current(LABEL, FILE_ID, PROJECT_ID, action)
    })

    expect(outcome).toBe('threw')
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to ${LABEL}`))
  })

  it('Layer 6: in-flight ref cleared after successful run', async () => {
    const action = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useGuardedAction())

    // First call completes
    await act(async () => {
      await result.current(LABEL, FILE_ID, PROJECT_ID, action)
    })
    // Second call should also run (ref was cleared in finally)
    let outcome: string = ''
    await act(async () => {
      outcome = await result.current(LABEL, FILE_ID, PROJECT_ID, action)
    })

    expect(outcome).toBe('ran')
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('Layer 6: in-flight ref cleared after action throws', async () => {
    const throwing = vi.fn().mockRejectedValue(new Error('boom'))
    const succeeding = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useGuardedAction())

    await act(async () => {
      await result.current(LABEL, FILE_ID, PROJECT_ID, throwing)
    })
    // Second call should run despite first throwing (ref cleared in finally)
    let outcome: string = ''
    await act(async () => {
      outcome = await result.current(LABEL, FILE_ID, PROJECT_ID, succeeding)
    })

    expect(outcome).toBe('ran')
    expect(succeeding).toHaveBeenCalledTimes(1)
  })

  it('Layer 6: in-flight ref cleared after self-assign throws', async () => {
    mockSelfAssignIfNeeded.mockRejectedValueOnce(new Error('network'))
    mockSelfAssignIfNeeded.mockResolvedValueOnce('proceed')
    const action = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useGuardedAction())

    await act(async () => {
      await result.current(LABEL, FILE_ID, PROJECT_ID, action)
    })
    let outcome: string = ''
    await act(async () => {
      outcome = await result.current(LABEL, FILE_ID, PROJECT_ID, action)
    })

    expect(outcome).toBe('ran')
    expect(action).toHaveBeenCalledTimes(1) // only second call reached action
  })
})
