/**
 * Story 4.3 — SeverityOverrideMenu component tests
 * ATDD: C-SO1, C-SO2, C-SO3
 *
 * Uses shadcn DropdownMenu (Radix). Rendered with open={true} to test menu items.
 * Guardrails referenced: #27 (focus indicator), #31 (Esc one layer), #36 (severity icons)
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { SeverityOverrideMenu } from '@/features/review/components/SeverityOverrideMenu'
import type { FindingSeverity } from '@/types/finding'

describe('SeverityOverrideMenu', () => {
  const onOverride = vi.fn()
  const onReset = vi.fn()
  const onOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderMenu(overrides?: {
    currentSeverity?: FindingSeverity
    originalSeverity?: FindingSeverity | null
    open?: boolean
  }) {
    return render(
      <SeverityOverrideMenu
        currentSeverity={overrides?.currentSeverity ?? 'major'}
        originalSeverity={overrides?.originalSeverity ?? null}
        onOverride={onOverride}
        onReset={onReset}
        open={overrides?.open ?? true}
        onOpenChange={onOpenChange}
        trigger={<button data-testid="trigger-btn">Override</button>}
      />,
    )
  }

  it('[P1] C-SO1: should render 3 severity options, disable current severity', () => {
    renderMenu({ currentSeverity: 'major' })

    // All 3 severity options should be rendered
    const criticalItem = screen.getByTestId('override-critical')
    const majorItem = screen.getByTestId('override-major')
    const minorItem = screen.getByTestId('override-minor')

    expect(criticalItem).toBeDefined()
    expect(majorItem).toBeDefined()
    expect(minorItem).toBeDefined()

    // Check text labels (Guardrail #36: icon + text + color)
    expect(criticalItem.textContent).toContain('Override to Critical')
    expect(majorItem.textContent).toContain('Override to Major')
    expect(minorItem.textContent).toContain('Override to Minor')

    // Current severity (major) should be disabled
    expect(majorItem.getAttribute('data-disabled')).toBeDefined()

    // Other severities should NOT be disabled
    expect(criticalItem.getAttribute('data-disabled')).toBeNull()
    expect(minorItem.getAttribute('data-disabled')).toBeNull()
  })

  it('[P1] C-SO1b: should disable critical when currentSeverity is critical', () => {
    renderMenu({ currentSeverity: 'critical' })

    const criticalItem = screen.getByTestId('override-critical')
    const majorItem = screen.getByTestId('override-major')
    const minorItem = screen.getByTestId('override-minor')

    expect(criticalItem.getAttribute('data-disabled')).toBeDefined()
    expect(majorItem.getAttribute('data-disabled')).toBeNull()
    expect(minorItem.getAttribute('data-disabled')).toBeNull()
  })

  it('[P1] C-SO1c: should call onOverride when non-disabled option is clicked', async () => {
    const user = userEvent.setup()
    renderMenu({ currentSeverity: 'major' })

    const criticalItem = screen.getByTestId('override-critical')
    await user.click(criticalItem)

    expect(onOverride).toHaveBeenCalledOnce()
    expect(onOverride).toHaveBeenCalledWith('critical')
  })

  it('[P1] C-SO2: should show Reset to original only when originalSeverity is set', () => {
    // No originalSeverity — reset should NOT appear
    renderMenu({ currentSeverity: 'critical', originalSeverity: null })
    expect(screen.queryByTestId('override-reset')).toBeNull()
  })

  it('[P1] C-SO2b: should show Reset to original when originalSeverity is provided', () => {
    renderMenu({ currentSeverity: 'critical', originalSeverity: 'minor' })

    const resetItem = screen.getByTestId('override-reset')
    expect(resetItem).toBeDefined()
    expect(resetItem.textContent).toContain('Reset to original')
    expect(resetItem.textContent).toContain('minor')
  })

  it('[P1] C-SO2c: should call onReset when Reset to original is clicked', async () => {
    const user = userEvent.setup()
    renderMenu({ currentSeverity: 'critical', originalSeverity: 'minor' })

    const resetItem = screen.getByTestId('override-reset')
    await user.click(resetItem)

    expect(onReset).toHaveBeenCalledOnce()
  })

  it('[P1] C-SO1d: should not render menu content when closed', () => {
    renderMenu({ open: false })

    // Menu content should not be in the DOM when closed
    expect(screen.queryByTestId('override-critical')).toBeNull()
    expect(screen.queryByTestId('override-major')).toBeNull()
    expect(screen.queryByTestId('override-minor')).toBeNull()
  })
})
