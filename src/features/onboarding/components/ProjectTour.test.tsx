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

const mockUsePathname = vi.fn(() => '/projects/proj-1/upload')

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

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

import { ProjectTour } from './ProjectTour'

describe('ProjectTour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isDismissed).mockReturnValue(false)
    mockUsePathname.mockReturnValue('/projects/proj-1/upload')
    // Default: desktop viewport — configurable:true required to allow redefinition between tests
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true })
  })

  afterEach(() => {
    cleanup()
  })

  // ────────────────────────────────────────────────
  // AC#1: First-Time Project Tour Activation
  // ────────────────────────────────────────────────

  it('[P0] should not start tour if project_tour_completed is set', async () => {
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
    render(<ProjectTour userId="usr-1" userMetadata={{}} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
      expect(mockDrive).toHaveBeenCalledWith(0)
    })
  })

  it('[P0] should set exactly 2 tour steps (Glossary + Files)', async () => {
    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      const steps = mockSetSteps.mock.calls[0]?.[0] as
        | Array<{ element: string; popover: { title: string } }>
        | undefined
      expect(steps).toHaveLength(2)
      expect(steps?.[0]?.element).toBe('[data-tour="project-glossary"]')
      expect(steps?.[0]?.popover?.title).toBe('Import Glossary')
      expect(steps?.[1]?.element).toBe('[data-tour="project-files"]')
      expect(steps?.[1]?.popover?.title).toBe('Upload Files')
    })
  })

  it('[P1] should call updateTourState dismiss with tourId "project" when onCloseClick fires (step 2)', async () => {
    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | { onCloseClick?: () => void }
      | undefined
    mockGetActiveIndex.mockReturnValue(1)
    driverConfig?.onCloseClick?.()

    expect(markDismissed).toHaveBeenCalledWith('project')
    expect(updateTourState).toHaveBeenCalledWith({
      action: 'dismiss',
      tourId: 'project',
      dismissedAtStep: 2, // 0-based index 1 + 1 = 1-based step 2
    })
    expect(mockDestroy).toHaveBeenCalled()
  })

  it('[P1] should call updateTourState dismiss with dismissedAtStep: 1 when X clicked on first step', async () => {
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

    // After dismiss, isDismissed now returns true
    vi.mocked(isDismissed).mockReturnValue(true)

    // Simulate onDestroyed firing after destroy()
    vi.mocked(updateTourState).mockClear()
    driverConfig?.onDestroyed?.()

    // onDestroyed should NOT fire complete because isDismissed('project') is true
    expect(updateTourState).not.toHaveBeenCalled()
  })

  // ────────────────────────────────────────────────
  // AC#2: Resume After Dismiss
  // ────────────────────────────────────────────────

  it('[P1] should resume tour at correct step for returning user (dismissed_at_step.project = 2)', async () => {
    render(<ProjectTour userId="usr-1" userMetadata={{ dismissed_at_step: { project: 2 } }} />)

    await vi.waitFor(() => {
      // dismissed_at_step is 1-based (2), resume is 0-based (1)
      expect(mockDrive).toHaveBeenCalledWith(1)
    })
  })

  it('[P1] should clamp resumeStep to LAST_STEP_INDEX when dismissed_at_step exceeds step count', async () => {
    // User dismissed at step 5 (from hypothetical future longer tour) but now tour has only 2 steps
    render(<ProjectTour userId="usr-1" userMetadata={{ dismissed_at_step: { project: 5 } }} />)

    await vi.waitFor(() => {
      // 5 - 1 = 4, but clamped to LAST_STEP_INDEX (1)
      expect(mockDrive).toHaveBeenCalledWith(1)
    })
  })

  it('[P2] should not re-init tour after dismiss when metadata still has dismissed_at_step set', async () => {
    const { rerender } = render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    })

    // Simulate dismiss via X button
    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | { onCloseClick?: () => void }
      | undefined
    driverConfig?.onCloseClick?.()

    // After dismiss, isDismissed returns true
    vi.mocked(isDismissed).mockReturnValue(true)

    // Clear mocks to track new calls
    mockDriverFn.mockClear()

    // Re-render with updated metadata where dismissed_at_step.project is set (truthy) —
    // this represents a non-restart refresh where dismiss is preserved in DB.
    rerender(<ProjectTour userId="usr-1" userMetadata={{ dismissed_at_step: { project: 1 } }} />)

    // Tour must NOT re-initialize because isDismissed('project') is true
    await vi.waitFor(() => {
      expect(mockDriverFn).not.toHaveBeenCalled()
    })
  })

  it('[P1] should re-init tour after restart clears session dismiss state', async () => {
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

    // After dismiss, isDismissed returns true
    vi.mocked(isDismissed).mockReturnValue(true)

    // Clear mocks to track new calls
    mockDriverFn.mockClear()

    // Verify dismiss state blocks re-init (rerender with stale metadata)
    rerender(<ProjectTour userId="usr-1" userMetadata={{ dismissed_at_step: { project: 1 } }} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(mockDriverFn).not.toHaveBeenCalled()

    // Simulate restart: HelpMenu calls clearDismissed + router.refresh()
    // isDismissed now returns false (cleared by HelpMenu)
    vi.mocked(isDismissed).mockReturnValue(false)

    // Re-render with cleared metadata (restart clears dismissed_at_step)
    rerender(<ProjectTour userId="usr-1" userMetadata={{ dismissed_at_step: { project: null } }} />)

    // Tour MUST re-initialize after restart (dismiss state cleared)
    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    })
  })

  // ────────────────────────────────────────────────
  // AC#3: Mobile Suppression
  // ────────────────────────────────────────────────

  it('[P1] should not start tour on mobile viewport (< 768px)', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 600, writable: true, configurable: true })

    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).not.toHaveBeenCalled()
    })
  })

  // ────────────────────────────────────────────────
  // Cleanup & Lifecycle
  // ────────────────────────────────────────────────

  it('[P2] should destroy driver on unmount', async () => {
    const { unmount } = render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

    unmount()

    expect(mockDestroy).toHaveBeenCalled()
  })

  it('[P2] should NOT fire complete via onDestroyed on cleanup unmount', async () => {
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

  // ────────────────────────────────────────────────
  // H1: Viewport boundary — 768px exact (NOT suppressed)
  // ────────────────────────────────────────────────

  it('[P1] should start tour on viewport exactly 768px (boundary — not suppressed)', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 768, writable: true, configurable: true })

    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })
  })

  // ────────────────────────────────────────────────
  // H2: C1 restart — userMetadata becomes null (null path)
  // ────────────────────────────────────────────────

  it('[P1] should re-init tour after restart when userMetadata has no dismissed_at_step (completed-then-restart path)', async () => {
    const { rerender } = render(
      <ProjectTour userId="usr-1" userMetadata={{ dismissed_at_step: { project: 1 } }} />,
    )

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    })

    // Simulate dismiss via X button
    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | { onCloseClick?: () => void }
      | undefined
    mockGetActiveIndex.mockReturnValue(0)
    driverConfig?.onCloseClick?.()

    // After dismiss, isDismissed returns true
    vi.mocked(isDismissed).mockReturnValue(true)

    mockDriverFn.mockClear()

    // Verify dismiss state blocks re-init
    rerender(<ProjectTour userId="usr-1" userMetadata={{ dismissed_at_step: { project: 1 } }} />)
    await new Promise((r) => setTimeout(r, 50))
    expect(mockDriverFn).not.toHaveBeenCalled()

    // Restart: HelpMenu calls clearDismissed → isDismissed returns false
    vi.mocked(isDismissed).mockReturnValue(false)

    // Restart action cleared project_tour_completed but dismissed_at_step was absent
    rerender(<ProjectTour userId="usr-1" userMetadata={{ project_tour_completed: null }} />)

    // Tour re-inits because isDismissed is false
    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    })
  })

  // ────────────────────────────────────────────────
  // M2: onCloseClick — getActiveIndex() returns undefined (?? 0 fallback)
  // ────────────────────────────────────────────────

  it('[L] should call updateTourState with dismissedAtStep: 1 when getActiveIndex returns undefined on close', async () => {
    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalled()
    })

    const driverConfig = mockDriverFn.mock.calls[0]?.[0] as
      | { onCloseClick?: () => void }
      | undefined
    mockGetActiveIndex.mockReturnValue(undefined as unknown as number)
    driverConfig?.onCloseClick?.()

    // undefined ?? 0 = 0, then 0 + 1 = 1 → dismissedAtStep: 1
    expect(updateTourState).toHaveBeenCalledWith({
      action: 'dismiss',
      tourId: 'project',
      dismissedAtStep: 1,
    })
  })

  // ────────────────────────────────────────────────
  // S-FIX-6 Regression: Dismiss survives full unmount + remount
  // Original bug: useRef(false) resets on remount — caught by unmount() + render(), NOT rerender()
  // ────────────────────────────────────────────────

  it('[P0] should NOT re-init tour after dismiss when component is fully unmounted and remounted with stale metadata', async () => {
    const { unmount } = render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    })

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

    // Fresh mount with STALE metadata (server hasn't persisted yet)
    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    // Wait long enough for the async dynamic import to resolve (if it were to fire)
    await new Promise((r) => setTimeout(r, 50))

    // Tour must NOT re-init because isDismissed('project') blocks it
    expect(mockDriverFn).not.toHaveBeenCalled()
  })

  // ────────────────────────────────────────────────
  // S-FIX-6: Route guard — suppress tour on /review/ page (MULTI-02)
  // ────────────────────────────────────────────────

  it('[P0] should suppress tour when pathname includes /review/', async () => {
    mockUsePathname.mockReturnValue('/projects/proj-1/review/session-abc')

    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    // Wait long enough for the async dynamic import to resolve (if it were to fire)
    await new Promise((r) => setTimeout(r, 50))

    // Driver was NOT initialized because route guard blocks it
    expect(mockDriverFn).not.toHaveBeenCalled()
  })

  it('[P1] should activate tour on project upload page (not /review/)', async () => {
    mockUsePathname.mockReturnValue('/projects/proj-1/upload')

    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    })
  })

  it('[P1] should activate tour on project glossary page (not /review/)', async () => {
    mockUsePathname.mockReturnValue('/projects/proj-1/glossary')

    render(<ProjectTour userId="usr-1" userMetadata={null} />)

    await vi.waitFor(() => {
      expect(mockDriverFn).toHaveBeenCalledTimes(1)
    })
  })
})
