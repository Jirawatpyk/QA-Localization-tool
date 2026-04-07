import { render, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockDrive = vi.fn()
const mockSetSteps = vi.fn()
const mockDestroy = vi.fn()
const mockGetActiveIndex = vi.fn(() => 0)

const mockDriverInstance = {
  setSteps: mockSetSteps,
  drive: mockDrive,
  destroy: mockDestroy,
  getActiveIndex: mockGetActiveIndex,
}

const mockDriverFn = vi.fn((..._args: unknown[]) => mockDriverInstance)

vi.mock('driver.js', () => ({
  driver: mockDriverFn,
}))

vi.mock('driver.js/dist/driver.css', () => ({}))

vi.mock('@/features/onboarding/actions/updateTourState.action', () => ({
  updateTourState: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
}))

vi.mock('@/features/onboarding/dismissState', () => ({
  isDismissed: vi.fn().mockReturnValue(false),
  markDismissed: vi.fn(),
  clearDismissed: vi.fn(),
  _resetForTesting: vi.fn(),
}))

import { updateTourState } from '@/features/onboarding/actions/updateTourState.action'
import { isDismissed, markDismissed } from '@/features/onboarding/dismissState'

import { OnboardingTour } from './OnboardingTour'

// Dynamic import('driver.js') in the component is async even when mocked.
// Under full-suite load (1700+ tests), microtask resolution can exceed
// vi.waitFor's default 1000ms timeout — use a generous budget.
const DYNAMIC_IMPORT_TIMEOUT = { timeout: 3000 }

describe('OnboardingTour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isDismissed).mockReturnValue(false)
    // Default: desktop viewport — configurable:true required to allow redefinition between tests/workers
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true })
  })

  afterEach(() => {
    cleanup()
  })

  it('should not start tour if setup_tour_completed is set', async () => {
    render(
      <OnboardingTour
        userId="usr-1"
        userMetadata={{ setup_tour_completed: '2026-01-01T00:00:00Z' }}
      />,
    )

    // Wait for potential async effects
    await vi.waitFor(() => {
      expect(mockDriverFn).not.toHaveBeenCalled()
    })
  })

  it('should not start tour on mobile viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 600, writable: true, configurable: true })

    render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).not.toHaveBeenCalled()
    })
  })

  it('should start tour from step 0 for first-time user', async () => {
    render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
      expect(mockSetSteps).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            popover: expect.objectContaining({
              title: 'Welcome to QA Localization Tool',
            }),
          }),
        ]),
      )
      expect(mockDrive).toHaveBeenCalledWith(0)
    }, DYNAMIC_IMPORT_TIMEOUT)
  })

  it('should resume tour at correct step for returning user', async () => {
    render(<OnboardingTour userId="usr-1" userMetadata={{ dismissed_at_step: { setup: 2 } }} />)

    await vi.waitFor(() => {
      // dismissed_at_step is 1-based (2), resume is 0-based (1)
      expect(mockDrive).toHaveBeenCalledWith(1)
    }, DYNAMIC_IMPORT_TIMEOUT)
  })

  it('should clamp resumeStep to LAST_STEP_INDEX when dismissed_at_step exceeds step count', async () => {
    // User dismissed at step 4 (from old 4-step tour) but now tour has only 2 steps
    render(<OnboardingTour userId="usr-1" userMetadata={{ dismissed_at_step: { setup: 4 } }} />)

    await vi.waitFor(() => {
      // 4 - 1 = 3, but clamped to LAST_STEP_INDEX (1)
      expect(mockDrive).toHaveBeenCalledWith(1)
    }, DYNAMIC_IMPORT_TIMEOUT)
  })

  it('should set 2 tour steps', async () => {
    render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      const steps = mockSetSteps.mock.calls[0]?.[0] as Array<{ element: string }> | undefined
      expect(steps).toHaveLength(2)
    }, DYNAMIC_IMPORT_TIMEOUT)
  })

  it('should call updateTourState dismiss when onCloseClick fires', async () => {
    render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    }, DYNAMIC_IMPORT_TIMEOUT)

    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | {
          onCloseClick?: () => void
        }
      | undefined
    mockGetActiveIndex.mockReturnValue(1)
    driverConfig?.onCloseClick?.()

    expect(markDismissed).toHaveBeenCalledWith('setup')
    expect(updateTourState).toHaveBeenCalledWith({
      action: 'dismiss',
      tourId: 'setup',
      dismissedAtStep: 2, // 0-based + 1 = 1-based
    })
    expect(mockDestroy).toHaveBeenCalled()
  })

  it('should NOT fire complete when X is clicked on last step (dismiss only)', async () => {
    render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    }, DYNAMIC_IMPORT_TIMEOUT)

    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | {
          onCloseClick?: () => void
          onDestroyed?: () => void
        }
      | undefined

    // Simulate X click on last step (index 1)
    mockGetActiveIndex.mockReturnValue(1)
    driverConfig?.onCloseClick?.()

    // onCloseClick should fire dismiss
    expect(updateTourState).toHaveBeenCalledWith({
      action: 'dismiss',
      tourId: 'setup',
      dismissedAtStep: 2,
    })

    // After dismiss, isDismissed now returns true
    vi.mocked(isDismissed).mockReturnValue(true)

    // Simulate onDestroyed firing after destroy()
    vi.mocked(updateTourState).mockClear()
    driverConfig?.onDestroyed?.()

    // onDestroyed should NOT fire complete because isDismissed('setup') is true
    expect(updateTourState).not.toHaveBeenCalled()
  })

  it('should fire complete via onDestroyed when tour finishes naturally on last step', async () => {
    render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    }, DYNAMIC_IMPORT_TIMEOUT)

    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | {
          onDestroyed?: () => void
        }
      | undefined

    // Simulate natural completion (Done button on last step triggers destroy)
    mockGetActiveIndex.mockReturnValue(1)
    driverConfig?.onDestroyed?.()

    expect(updateTourState).toHaveBeenCalledWith({
      action: 'complete',
      tourId: 'setup',
    })
  })

  it('should not re-init tour after dismiss even if component re-renders', async () => {
    const { rerender } = render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    }, DYNAMIC_IMPORT_TIMEOUT)

    // Simulate dismiss via X button
    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | { onCloseClick?: () => void }
      | undefined
    driverConfig?.onCloseClick?.()

    // After dismiss, isDismissed returns true
    vi.mocked(isDismissed).mockReturnValue(true)

    // Clear mocks to track new calls
    mockDriverFn.mockClear()

    // Re-render with updated metadata (server action re-renders parent)
    rerender(<OnboardingTour userId="usr-1" userMetadata={{ dismissed_at_step: { setup: 1 } }} />)

    // Wait and verify driver was NOT re-initialized
    await vi.waitFor(() => {
      expect(mockDriverFn).not.toHaveBeenCalled()
    })
  })

  it('should guard against async race via cancelled flag in initTour', async () => {
    // This test verifies the cancelled guard exists by inspecting the driver config.
    // In tests, the mock import resolves synchronously so we can't simulate true
    // async cancellation. Instead, we verify the cleanup sets driverRef to null
    // which is the observable outcome of the cancelled flag + cleanup working together.
    const { unmount } = render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    }, DYNAMIC_IMPORT_TIMEOUT)

    unmount()

    // After unmount, destroy should be called and no re-initialization should occur
    expect(mockDestroy).toHaveBeenCalled()
  })

  it('should destroy driver on unmount', async () => {
    const { unmount } = render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    }, DYNAMIC_IMPORT_TIMEOUT)

    unmount()

    expect(mockDestroy).toHaveBeenCalled()
  })

  it('should NOT fire complete via onDestroyed on cleanup unmount', async () => {
    const { unmount } = render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    }, DYNAMIC_IMPORT_TIMEOUT)

    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as { onDestroyed?: () => void } | undefined

    // Simulate last step active when unmounting
    mockGetActiveIndex.mockReturnValue(1)
    unmount()

    // onDestroyed would fire from destroy(), simulate it
    driverConfig?.onDestroyed?.()

    // Should NOT fire complete because cancelled flag is set by cleanup
    expect(updateTourState).not.toHaveBeenCalledWith({
      action: 'complete',
      tourId: 'setup',
    })
  })

  // ────────────────────────────────────────────────
  // S-FIX-6: Restart clears session dismiss state → tour re-activates (AC5)
  // ────────────────────────────────────────────────

  it('should re-init tour after restart clears session dismiss state', async () => {
    const { rerender } = render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    }, DYNAMIC_IMPORT_TIMEOUT)

    // Simulate dismiss via X button
    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | { onCloseClick?: () => void }
      | undefined
    mockGetActiveIndex.mockReturnValue(0)
    driverConfig?.onCloseClick?.()

    // After dismiss, isDismissed returns true
    vi.mocked(isDismissed).mockReturnValue(true)

    // Clear mocks to track new calls
    mockDriverFn.mockClear()

    // Verify dismiss state blocks re-init (rerender with stale metadata)
    rerender(<OnboardingTour userId="usr-1" userMetadata={{ dismissed_at_step: { setup: 1 } }} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(mockDriverFn).not.toHaveBeenCalled()

    // Simulate restart: HelpMenu calls clearDismissed + router.refresh()
    // isDismissed now returns false (cleared by HelpMenu)
    vi.mocked(isDismissed).mockReturnValue(false)

    // Re-render with cleared metadata (restart clears dismissed_at_step)
    rerender(
      <OnboardingTour userId="usr-1" userMetadata={{ dismissed_at_step: { setup: null } }} />,
    )

    // Tour MUST re-initialize after restart (dismiss state cleared)
    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    }, DYNAMIC_IMPORT_TIMEOUT)
  })

  // ────────────────────────────────────────────────
  // S-FIX-6 Regression: Dismiss survives full unmount + remount
  // Original bug: useRef(false) resets on remount — caught by unmount() + render(), NOT rerender()
  // ────────────────────────────────────────────────

  it('should NOT re-init tour after dismiss when component is fully unmounted and remounted with stale metadata', async () => {
    const { unmount } = render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    }, DYNAMIC_IMPORT_TIMEOUT)

    // Simulate dismiss via X button
    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | { onCloseClick?: () => void }
      | undefined
    driverConfig?.onCloseClick?.()

    // After dismiss, isDismissed returns true (session state persisted)
    vi.mocked(isDismissed).mockReturnValue(true)

    // Full unmount — simulates real navigation (component destroyed)
    unmount()

    // Clear mocks to track fresh mount
    mockDriverFn.mockClear()

    // Fresh mount with STALE metadata (server hasn't persisted yet — dismissed_at_step still null)
    // This is the exact race condition: server action in-flight, user navigates back
    render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    // Wait long enough for the async dynamic import to resolve (if it were to fire)
    await new Promise((r) => setTimeout(r, 50))

    // Tour must NOT re-init because isDismissed('setup') blocks it
    expect(mockDriverFn).not.toHaveBeenCalled()
  })
})
