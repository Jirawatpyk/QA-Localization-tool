import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { toast } from 'sonner'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock sonner toast (vitest hoists vi.mock automatically)
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

const mockUsePathname = vi.fn(() => '/dashboard')
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ refresh: mockRefresh })),
  usePathname: () => mockUsePathname(),
}))

type MockActionResult =
  | { success: true; data: { success: true } }
  | { success: false; code: string; error: string }

const mockUpdateTourState = vi.fn((..._args: unknown[]) =>
  Promise.resolve<MockActionResult>({ success: true, data: { success: true } }),
)
vi.mock('@/features/onboarding/actions/updateTourState.action', () => ({
  updateTourState: (...args: unknown[]) => mockUpdateTourState(...args),
}))

import { HelpMenu } from './HelpMenu'

describe('HelpMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render help menu trigger with correct testid and aria-label', () => {
    render(<HelpMenu />)
    const trigger = screen.getByTestId('help-menu-trigger')
    expect(trigger).toBeDefined()
    expect(trigger.getAttribute('aria-label')).toBe('Help')
  })

  it('should render as a button element', () => {
    render(<HelpMenu />)
    const trigger = screen.getByTestId('help-menu-trigger')
    expect(trigger.tagName).toBe('BUTTON')
  })

  it('should not crash on multiple renders', () => {
    const { rerender } = render(<HelpMenu />)
    rerender(<HelpMenu />)
    expect(screen.getByTestId('help-menu-trigger')).toBeDefined()
  })

  // ────────────────────────────────────────────────
  // ATDD RED PHASE — Story 2.8: Project Tour Restart in HelpMenu
  // Tests skipped until HelpMenu is updated with usePathname + project tour restart
  // AC Coverage: AC#1 (Task 5 — Restart Project Tour menu item)
  // ────────────────────────────────────────────────

  it('[P1] should show "Restart Project Tour" menu item when on a project route', async () => {
    mockUsePathname.mockReturnValue('/projects/proj-123/upload')

    render(<HelpMenu />)

    // Open Radix dropdown menu (requires pointerDown for trigger)
    const trigger = screen.getByTestId('help-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    // "Restart Project Tour" should be visible
    await waitFor(() => {
      const restartProjectBtn = screen.getByTestId('restart-project-tour-btn')
      expect(restartProjectBtn).toBeDefined()
    })
  })

  it('[P1] should NOT show "Restart Project Tour" menu item on dashboard', async () => {
    mockUsePathname.mockReturnValue('/dashboard')

    render(<HelpMenu />)

    // Open Radix dropdown menu
    const trigger = screen.getByTestId('help-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    // "Restart Project Tour" should NOT be visible
    await waitFor(() => {
      // The dropdown should be open (has "Restart Tour") but NOT "Restart Project Tour"
      expect(screen.queryByTestId('restart-project-tour-btn')).toBeNull()
    })
  })

  it('[P1] should call updateTourState with tourId "project" when "Restart Project Tour" is clicked', async () => {
    mockUsePathname.mockReturnValue('/projects/proj-456/glossary')

    render(<HelpMenu />)

    // Open Radix dropdown menu and click restart project tour
    const trigger = screen.getByTestId('help-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    await waitFor(() => {
      expect(screen.getByTestId('restart-project-tour-btn')).toBeDefined()
    })

    const restartProjectBtn = screen.getByTestId('restart-project-tour-btn')
    fireEvent.click(restartProjectBtn)

    expect(mockUpdateTourState).toHaveBeenCalledWith({
      action: 'restart',
      tourId: 'project',
    })

    // router.refresh() must be called after updateTourState to propagate cleared metadata
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('[P1] should NOT call router.refresh() when updateTourState returns { success: false }', async () => {
    mockUsePathname.mockReturnValue('/projects/proj-789/upload')
    mockUpdateTourState.mockResolvedValue({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Not authenticated',
    })

    render(<HelpMenu />)

    const trigger = screen.getByTestId('help-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    await waitFor(() => {
      expect(screen.getByTestId('restart-project-tour-btn')).toBeDefined()
    })

    fireEvent.click(screen.getByTestId('restart-project-tour-btn'))

    await waitFor(() => {
      expect(mockUpdateTourState).toHaveBeenCalled()
    })

    // router.refresh() must NOT fire on failure — stale metadata would prevent tour restart
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  // ────────────────────────────────────────────────
  // L4: Toast on restart failure
  // ────────────────────────────────────────────────

  it('[L] should show error toast when updateTourState returns { success: false }', async () => {
    mockUsePathname.mockReturnValue('/projects/proj-toast/upload')
    mockUpdateTourState.mockResolvedValue({
      success: false,
      code: 'DB_ERROR',
      error: 'Failed to update tour state',
    })

    render(<HelpMenu />)

    const trigger = screen.getByTestId('help-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    await waitFor(() => {
      expect(screen.getByTestId('restart-project-tour-btn')).toBeDefined()
    })

    fireEvent.click(screen.getByTestId('restart-project-tour-btn'))

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        'Failed to restart tour. Please try again.',
      )
    })
  })

  // ────────────────────────────────────────────────
  // L3: isPending disabled state during transition
  // ────────────────────────────────────────────────

  it('[L] should disable menu items while restart is in progress (isPending = true)', async () => {
    mockUsePathname.mockReturnValue('/projects/proj-pending/upload')

    // Never-resolving promise — transition stays pending
    let resolveUpdate!: (value: MockActionResult) => void
    mockUpdateTourState.mockImplementation(
      () =>
        new Promise<MockActionResult>((resolve) => {
          resolveUpdate = resolve
        }),
    )

    render(<HelpMenu />)
    const trigger = screen.getByTestId('help-menu-trigger')

    // Open dropdown
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    await waitFor(() => expect(screen.getByTestId('restart-tour-btn')).toBeDefined())

    // Click restart — starts transition (isPending = true), dropdown closes
    fireEvent.click(screen.getByTestId('restart-tour-btn'))

    // Re-open dropdown while transition is pending
    await act(async () => {
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    })

    // Both items should be aria-disabled / data-disabled during pending
    await waitFor(() => {
      const setupBtn = screen.getByTestId('restart-tour-btn')
      expect(
        setupBtn.hasAttribute('data-disabled') || setupBtn.getAttribute('aria-disabled') === 'true',
      ).toBe(true)
    })

    // Cleanup: resolve promise inside act to avoid "suspended resource" warning
    await act(async () => {
      resolveUpdate({ success: true, data: { success: true } })
    })
  })
})
