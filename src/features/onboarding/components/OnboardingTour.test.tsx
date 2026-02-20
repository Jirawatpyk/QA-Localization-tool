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

  it('should set 4 tour steps', async () => {
    render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      const steps = mockSetSteps.mock.calls[0]?.[0] as Array<{ element: string }> | undefined
      expect(steps).toHaveLength(4)
    })
  })

  it('should call updateTourState dismiss when onDestroyStarted fires', async () => {
    render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

    // Get the onDestroyStarted callback
    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | {
          onDestroyStarted?: () => void
        }
      | undefined
    mockGetActiveIndex.mockReturnValue(1)
    driverConfig?.onDestroyStarted?.()

    expect(updateTourState).toHaveBeenCalledWith({
      action: 'dismiss',
      tourId: 'setup',
      dismissedAtStep: 2, // 0-based + 1 = 1-based
    })
  })

  it('should destroy driver on unmount', async () => {
    const { unmount } = render(<OnboardingTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

    unmount()

    expect(mockDestroy).toHaveBeenCalled()
  })
})
