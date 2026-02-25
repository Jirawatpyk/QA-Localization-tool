// ATDD GREEN PHASE — Story 2.8: Project-level Onboarding Tour
// All tests activated — ProjectTour.tsx implemented.
//
// AC Coverage:
//   AC#1 — First-time project tour activation (2 steps: Glossary + Files)
//   AC#2 — Resume after dismiss (dismissed_at_step.project)
//   AC#3 — Mobile suppression (< 768px)

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

describe('ProjectTour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: desktop viewport
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
  })

  afterEach(() => {
    cleanup()
  })

  // ────────────────────────────────────────────────
  // AC#1: First-Time Project Tour Activation
  // ────────────────────────────────────────────────

  it('[P0] should not start tour if project_tour_completed is set', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    render(
      <ProjectTour
        userId="usr-1"
        userMetadata={{ project_tour_completed: '2026-01-01T00:00:00Z' }}
      />,
    )

    await vi.waitFor(() => {
      expect(mockDriverFn).not.toHaveBeenCalled()
    })
  })

  it('[P1] should start tour from step 0 for first-time user (metadata null)', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
      expect(mockSetSteps).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            element: '[data-tour="project-glossary"]',
            popover: expect.objectContaining({
              title: 'Import Glossary',
            }),
          }),
        ]),
      )
      expect(mockDrive).toHaveBeenCalledWith(0)
    })
  })

  it('[P1] should start tour from step 0 for first-time user (metadata empty object)', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    render(<ProjectTour userId="usr-1" userMetadata={{}} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
      expect(mockDrive).toHaveBeenCalledWith(0)
    })
  })

  it('[P0] should set exactly 2 tour steps (Glossary + Files)', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      const steps = mockSetSteps.mock.calls[0]?.[0] as
        | Array<{ element: string; popover: { title: string } }>
        | undefined
      expect(steps).toHaveLength(2)
      expect(steps?.[0]?.element).toBe('[data-tour="project-glossary"]')
      expect(steps?.[1]?.element).toBe('[data-tour="project-files"]')
    })
  })

  it('[P1] should call updateTourState dismiss with tourId "project" when onCloseClick fires (step 2)', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | { onCloseClick?: () => void }
      | undefined
    mockGetActiveIndex.mockReturnValue(1)
    driverConfig?.onCloseClick?.()

    expect(updateTourState).toHaveBeenCalledWith({
      action: 'dismiss',
      tourId: 'project',
      dismissedAtStep: 2, // 0-based index 1 + 1 = 1-based step 2
    })
    expect(mockDestroy).toHaveBeenCalled()
  })

  it('[P1] should call updateTourState dismiss with dismissedAtStep: 1 when X clicked on first step', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | { onCloseClick?: () => void }
      | undefined
    mockGetActiveIndex.mockReturnValue(0) // first step (index 0)
    driverConfig?.onCloseClick?.()

    expect(updateTourState).toHaveBeenCalledWith({
      action: 'dismiss',
      tourId: 'project',
      dismissedAtStep: 1, // 0-based index 0 + 1 = 1-based step 1
    })
  })

  it('[P1] should fire complete via onDestroyed when tour finishes naturally on last step', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as { onDestroyed?: () => void } | undefined

    // Simulate natural completion (Done button on last step triggers destroy)
    mockGetActiveIndex.mockReturnValue(1) // LAST_STEP_INDEX = 1 (2 steps)
    driverConfig?.onDestroyed?.()

    expect(updateTourState).toHaveBeenCalledWith({
      action: 'complete',
      tourId: 'project',
    })
  })

  it('[P1] should NOT fire complete when X is clicked on last step (dismiss only)', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    render(<ProjectTour userId="usr-1" userMetadata={null} />)

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
      tourId: 'project',
      dismissedAtStep: 2,
    })

    // Simulate onDestroyed firing after destroy()
    vi.mocked(updateTourState).mockClear()
    driverConfig?.onDestroyed?.()

    // onDestroyed should NOT fire complete because dismissedRef is true
    expect(updateTourState).not.toHaveBeenCalled()
  })

  // ────────────────────────────────────────────────
  // AC#2: Resume After Dismiss
  // ────────────────────────────────────────────────

  it('[P1] should resume tour at correct step for returning user (dismissed_at_step.project = 2)', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    render(<ProjectTour userId="usr-1" userMetadata={{ dismissed_at_step: { project: 2 } }} />)

    await vi.waitFor(() => {
      // dismissed_at_step is 1-based (2), resume is 0-based (1)
      expect(mockDrive).toHaveBeenCalledWith(1)
    })
  })

  it('[P1] should clamp resumeStep to LAST_STEP_INDEX when dismissed_at_step exceeds step count', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    // User dismissed at step 5 (from hypothetical future longer tour) but now tour has only 2 steps
    render(<ProjectTour userId="usr-1" userMetadata={{ dismissed_at_step: { project: 5 } }} />)

    await vi.waitFor(() => {
      // 5 - 1 = 4, but clamped to LAST_STEP_INDEX (1)
      expect(mockDrive).toHaveBeenCalledWith(1)
    })
  })

  it('[P2] should not re-init tour after dismiss when metadata still has dismissed_at_step set', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    const { rerender } = render(<ProjectTour userId="usr-1" userMetadata={null} />)

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

    // Re-render with updated metadata where dismissed_at_step.project is set (truthy) —
    // this represents a non-restart refresh where dismiss is preserved in DB.
    rerender(<ProjectTour userId="usr-1" userMetadata={{ dismissed_at_step: { project: 1 } }} />)

    // Tour must NOT re-initialize because dismissed_at_step.project is still set
    await vi.waitFor(() => {
      expect(mockDriverFn).not.toHaveBeenCalled()
    })
  })

  it('[P1] should re-init tour after restart clears dismissed_at_step in same session', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    const { rerender } = render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    })

    // Simulate dismiss via X button on step 1
    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | { onCloseClick?: () => void }
      | undefined
    mockGetActiveIndex.mockReturnValue(0)
    driverConfig?.onCloseClick?.()

    // Clear mocks to track new calls
    mockDriverFn.mockClear()

    // Simulate restart: server action clears project_tour_completed and
    // dismissed_at_step.project → router.refresh() flows cleared metadata back.
    // dismissed_at_step.project is null (falsy) — restart signal.
    rerender(<ProjectTour userId="usr-1" userMetadata={{ dismissed_at_step: { project: null } }} />)

    // Tour MUST re-initialize after restart (dismissedRef was reset)
    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    })
  })

  // ────────────────────────────────────────────────
  // AC#3: Mobile Suppression
  // ────────────────────────────────────────────────

  it('[P1] should not start tour on mobile viewport (< 768px)', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 600, writable: true })

    const { ProjectTour } = await import('./ProjectTour')
    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).not.toHaveBeenCalled()
    })
  })

  // ────────────────────────────────────────────────
  // Cleanup & Lifecycle
  // ────────────────────────────────────────────────

  it('[P2] should destroy driver on unmount', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    const { unmount } = render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

    unmount()

    expect(mockDestroy).toHaveBeenCalled()
  })

  it('[P2] should NOT fire complete via onDestroyed on cleanup unmount', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    const { unmount } = render(<ProjectTour userId="usr-1" userMetadata={null} />)

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
      tourId: 'project',
    })
  })

  it('[L] should NOT fire complete via onDestroyed when getActiveIndex returns undefined', async () => {
    const { ProjectTour } = await import('./ProjectTour')
    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as { onDestroyed?: () => void } | undefined

    // Simulate driver destroyed with no active index (e.g. tour not fully started)
    // driver.js getActiveIndex() may return undefined in edge cases
    mockGetActiveIndex.mockReturnValue(undefined as unknown as number)
    driverConfig?.onDestroyed?.()

    // undefined !== LAST_STEP_INDEX (1) → complete must NOT fire
    expect(updateTourState).not.toHaveBeenCalled()
  })
})
