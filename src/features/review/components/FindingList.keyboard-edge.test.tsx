/**
 * Story 4.1b — AC6: Accessibility + Boundary Tests + Party Mode Additions
 *
 * Split from FindingList.keyboard.test.tsx (RV-H1: file size > 300 lines).
 * Covers: aria-label, aria-rowindex, aria-rowcount, reduced motion,
 *         boundary values (wrap, single, empty), IME guard, rAF cleanup.
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { FindingList } from '@/features/review/components/FindingList'
import {
  defaultProps,
  pressKeyOnGrid,
} from '@/features/review/components/FindingList.keyboard.test-helpers'
import { useReviewStore } from '@/features/review/stores/review.store'
import { buildFindingForUI } from '@/test/factories'

// ── Mocks ──

vi.mock('@/features/review/hooks/use-keyboard-actions', () => ({
  useKeyboardActions: () => ({
    register: vi.fn(() => vi.fn()),
    unregister: vi.fn(),
    pushScope: vi.fn(),
    popScope: vi.fn(),
    activeScope: 'review' as const,
    getAllBindings: vi.fn(() => []),
    checkConflict: vi.fn(() => ({
      hasConflict: false,
      conflictWith: null,
      scope: null,
      key: null,
    })),
    suspend: vi.fn(),
    resume: vi.fn(),
  }),
  useReviewHotkeys: vi.fn(),
  REVIEW_HOTKEYS: [],
  _resetRegistry: vi.fn(),
}))

vi.mock('@/features/review/hooks/use-focus-management', () => ({
  useFocusManagement: () => ({
    trapFocus: vi.fn(),
    saveFocus: vi.fn(),
    restoreFocus: vi.fn(),
    autoAdvance: vi.fn(),
    pushEscapeLayer: vi.fn(),
    popEscapeLayer: vi.fn(),
    handleEscape: vi.fn(),
    savedFocusRef: { current: null },
    escapeLayersRef: { current: [] },
  }),
}))

let mockReducedMotion = false
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion,
}))

// ═══════════════════════════════════════════════════════════════════════
// AC6: Keyboard Accessibility Compliance
// ═══════════════════════════════════════════════════════════════════════

describe('FindingList — AC6: Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion = false
    useReviewStore.getState().resetForFile('test')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[T6.1][P0] should render aria-label with "Finding N of M, severity, category, status"', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', category: 'accuracy', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', category: 'fluency', aiConfidence: 80 }),
      buildFindingForUI({ id: 'n1', severity: 'minor', category: 'whitespace', aiConfidence: 50 }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)

    const rows = screen.getAllByTestId('finding-compact-row')
    expect(rows[0]!).toHaveAttribute('aria-label', expect.stringContaining('Finding 1 of'))
    expect(rows[0]!).toHaveAttribute('aria-label', expect.stringContaining('critical'))
  })

  it('[T6.2][P1] should set aria-rowindex on each row', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
      buildFindingForUI({ id: 'n1', severity: 'minor', aiConfidence: 50 }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)

    const rows = screen.getAllByTestId('finding-compact-row')
    expect(rows[0]!).toHaveAttribute('aria-rowindex', '1')
    expect(rows[1]!).toHaveAttribute('aria-rowindex', '2')
  })

  it('[T6.3][P1] should set aria-rowcount on grid container (total rows including Minor)', () => {
    // Note: aria-rowcount = total findings (6), not just visible navigable rows (4).
    // This is correct per ARIA spec — rowcount reflects total, not filtered count.
    render(<FindingList {...defaultProps()} />)
    const grid = screen.getByRole('grid')
    expect(grid).toHaveAttribute('aria-rowcount', '6')
  })

  it('[T6.4][P1] should use instant scroll when prefers-reduced-motion is active (G#37)', () => {
    mockReducedMotion = true

    HTMLElement.prototype.scrollIntoView = HTMLElement.prototype.scrollIntoView ?? (() => {})

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})

    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)

    const grid = screen.getByRole('grid')
    pressKeyOnGrid(grid, 'j')

    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }))

    rafSpy.mockRestore()
    scrollSpy.mockRestore()
  })

  it('[T6.5][P2] should verify rowgroup aria-label unchanged from 4.1a', () => {
    render(<FindingList {...defaultProps()} />)

    const rowgroups = screen.getAllByRole('rowgroup')
    expect(rowgroups[0]!).toHaveAttribute('aria-label', 'Critical findings')
    expect(rowgroups[1]!).toHaveAttribute('aria-label', 'Major findings')
    expect(rowgroups[2]!).toHaveAttribute('aria-label', 'Minor findings')
  })

  it('[T6.6][P1] should handle J/K only within grid scope (not global document)', () => {
    render(<FindingList {...defaultProps()} />)

    const grid = screen.getByRole('grid')
    const rows = screen.getAllByTestId('finding-compact-row')

    pressKeyOnGrid(grid, 'j')
    expect(rows[1]!).toHaveAttribute('tabindex', '0')

    act(() => {
      fireEvent.keyDown(document.body, { key: 'j', bubbles: true })
    })
    // Still on rows[1], not rows[2] — scoped to grid
    expect(rows[1]!).toHaveAttribute('tabindex', '0')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Boundary Value Tests (MANDATORY — Epic 2 Retro A2)
// ═══════════════════════════════════════════════════════════════════════

describe('FindingList — Boundary Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion = false
    useReviewStore.getState().resetForFile('test')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[B1][P1] should wrap J on last finding (idx=length-1) to first (idx=0)', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
      buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)
    const grid = screen.getByRole('grid')

    pressKeyOnGrid(grid, 'j') // m1
    pressKeyOnGrid(grid, 'j') // m2
    pressKeyOnGrid(grid, 'j') // wrap → c1

    const rows = screen.getAllByTestId('finding-compact-row')
    expect(rows[0]!).toHaveAttribute('tabindex', '0')
  })

  it('[B2][P1] should wrap K on first finding (idx=0) to last (idx=length-1)', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
      buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)
    const grid = screen.getByRole('grid')

    pressKeyOnGrid(grid, 'k')

    const rows = screen.getAllByTestId('finding-compact-row')
    expect(rows[2]!).toHaveAttribute('tabindex', '0')
  })

  it('[B3][P1] should handle single finding: J/K stays on same finding', () => {
    const findings = [buildFindingForUI({ id: 'solo', severity: 'major', aiConfidence: 80 })]
    render(<FindingList {...defaultProps({ findings })} />)
    const grid = screen.getByRole('grid')
    const row = screen.getByTestId('finding-compact-row')

    expect(row).toHaveAttribute('tabindex', '0')
    pressKeyOnGrid(grid, 'j')
    expect(row).toHaveAttribute('tabindex', '0')
    pressKeyOnGrid(grid, 'k')
    expect(row).toHaveAttribute('tabindex', '0')
  })

  it('[B4][P1] should handle empty list: no navigation, no crash', () => {
    render(<FindingList {...defaultProps({ findings: [] })} />)
    expect(screen.getByText(/no findings/i)).toBeInTheDocument()
  })

  it('[B5][P1] should handle focused finding removed from empty result', () => {
    const findings = [buildFindingForUI({ id: 'solo', severity: 'major', aiConfidence: 80 })]
    const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

    rerender(<FindingList {...defaultProps({ findings: [] })} />)
    expect(screen.getByText(/no findings/i)).toBeInTheDocument()
  })

  it('[B6][P1] should render "Finding 1 of 1" aria-label for single finding', () => {
    const findings = [
      buildFindingForUI({
        id: 'solo',
        severity: 'critical',
        category: 'accuracy',
        aiConfidence: 95,
      }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)
    const row = screen.getByTestId('finding-compact-row')
    expect(row).toHaveAttribute('aria-label', expect.stringContaining('Finding 1 of 1'))
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Party Mode Additions
// ═══════════════════════════════════════════════════════════════════════

describe('FindingList — Party Mode: Additional Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion = false
    useReviewStore.getState().resetForFile('test')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[T-IME-01][P1] should suppress J/K during IME composition (isComposing guard)', () => {
    render(<FindingList {...defaultProps()} />)
    const grid = screen.getByRole('grid')
    const rows = screen.getAllByTestId('finding-compact-row')

    expect(rows[0]!).toHaveAttribute('tabindex', '0')

    act(() => {
      fireEvent.keyDown(grid, { key: 'j', isComposing: true, bubbles: true })
    })
    expect(rows[0]!).toHaveAttribute('tabindex', '0')
    expect(rows[1]!).toHaveAttribute('tabindex', '-1')

    act(() => {
      fireEvent.keyDown(grid, { key: 'j', keyCode: 229, bubbles: true })
    })
    expect(rows[0]!).toHaveAttribute('tabindex', '0')
  })

  it('[T-SCROLL-01][P1] should call focus() on target row after J navigation via rAF', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)

    const grid = screen.getByRole('grid')
    pressKeyOnGrid(grid, 'j')

    expect(focusSpy).toHaveBeenCalled()

    rafSpy.mockRestore()
    focusSpy.mockRestore()
  })

  it('[T-CLEANUP-01][P1] should clean up rAF on unmount (no memory leak)', () => {
    const cancelRafSpy = vi.spyOn(window, 'cancelAnimationFrame')

    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
    ]
    const { unmount } = render(<FindingList {...defaultProps({ findings })} />)

    const grid = screen.getByRole('grid')
    pressKeyOnGrid(grid, 'j')

    unmount()
    expect(cancelRafSpy).toHaveBeenCalled()

    cancelRafSpy.mockRestore()
  })

  it('[T-ASYNC-01][P2] should handle async rerender during navigation without focus jump', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
      buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
    ]
    const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

    const grid = screen.getByRole('grid')
    pressKeyOnGrid(grid, 'j')

    const updatedFindings = [
      buildFindingForUI({ id: 'c-new', severity: 'critical', aiConfidence: 99 }),
      ...findings,
    ]
    rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

    const m1Row = screen
      .getAllByTestId('finding-compact-row')
      .find((r) => r.getAttribute('data-finding-id') === 'm1')
    expect(m1Row).toHaveAttribute('tabindex', '0')
  })
})
