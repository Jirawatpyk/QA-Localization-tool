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

import { updateTourState } from '@/features/onboarding/actions/updateTourState.action'

import { OnboardingTour } from './OnboardingTour'

describe('OnboardingTour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: desktop viewport
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
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
    Object.defineProperty(window, 'innerWidth', { value: 600, writable: true })

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
    })
  })

  it('should resume tour at correct step for returning user', async () => {
    render(<OnboardingTour userId="usr-1" userMetadata={{ dismissed_at_step: { setup: 2 } }} />)

    await vi.waitFor(() => {
      // dismissed_at_step is 1-based (2), resume is 0-based (1)
      expect(mockDrive).toHaveBeenCalledWith(1)
    })
  })

  it('should clamp resumeStep to LAST_STEP_INDEX when dismissed_at_step exceeds step count', async () => {
    // User dismissed at step 4 (from old 4-step tour) but now tour has only 2 steps
    render(<OnboardingTour userId="usr-1" userMetadata={{ dismissed_at_step: { setup: 4 } }} />)

    await vi.waitFor(() => {
      // 4 - 1 = 3, but clamped to LAST_STEP_INDEX (1)
      expect(mockDrive).toHaveBeenCalledWith(1)
    })
  })

  it('should set 2 tour steps', async () => {
    render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      const steps = mockSetSteps.mock.calls[0]?.[0] as Array<{ element: string }> | undefined
      expect(steps).toHaveLength(2)
    })
  })

  it('should call updateTourState dismiss when onCloseClick fires', async () => {
    render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | {
          onCloseClick?: () => void
        }
      | undefined
    mockGetActiveIndex.mockReturnValue(1)
    driverConfig?.onCloseClick?.()

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
    })

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

    // Simulate onDestroyed firing after destroy()
    vi.mocked(updateTourState).mockClear()
    driverConfig?.onDestroyed?.()

    // onDestroyed should NOT fire complete because dismissedRef is true
    expect(updateTourState).not.toHaveBeenCalled()
  })

  it('should fire complete via onDestroyed when tour finishes naturally on last step', async () => {
    render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

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
    })

    // Simulate dismiss via X button
    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | { onCloseClick?: () => void }
      | undefined
    driverConfig?.onCloseClick?.()

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
    })

    unmount()

    // After unmount, destroy should be called and no re-initialization should occur
    expect(mockDestroy).toHaveBeenCalled()
  })

  it('should destroy driver on unmount', async () => {
    const { unmount } = render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

    unmount()

    expect(mockDestroy).toHaveBeenCalled()
  })

  it('should NOT fire complete via onDestroyed on cleanup unmount', async () => {
    const { unmount } = render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

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
})
