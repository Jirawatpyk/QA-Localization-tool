/**
 * Story 4.1b — AC2: Enter/Esc + AC3: Tab Order + AC5: Focus Stability
 *
 * Split from FindingList.keyboard.test.tsx (RV-H1: file size > 300 lines).
 * Covers: expand/collapse, escape hierarchy, tab order, grid entry/exit,
 *         focus stability on Realtime updates, mouse-click sync.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { FindingList } from '@/features/review/components/FindingList'
import {
  defaultProps,
  pressKeyOnGrid,
  openMinorAccordion,
} from '@/features/review/components/FindingList.keyboard.test-helpers'
import { useReviewStore } from '@/features/review/stores/review.store'
import { buildFindingForUI } from '@/test/factories'

// ── Mocks ──

const mockPushEscapeLayer = vi.fn()
const mockPopEscapeLayer = vi.fn()

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
    pushEscapeLayer: mockPushEscapeLayer,
    popEscapeLayer: mockPopEscapeLayer,
    handleEscape: vi.fn(),
    savedFocusRef: { current: null },
    escapeLayersRef: { current: [] },
  }),
}))

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}))

// ═══════════════════════════════════════════════════════════════════════
// AC2: Enter/Esc Expand/Collapse
// ═══════════════════════════════════════════════════════════════════════

describe('FindingList — AC2: Enter/Esc Expand/Collapse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReviewStore.getState().resetForFile('test')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[T2.3][P1] should NOT bubble Esc when finding is collapsed (no action)', () => {
    const onToggleExpand = vi.fn()
    const findings = [buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 })]
    render(<FindingList {...defaultProps({ findings, onToggleExpand })} />)

    const row = screen.getByTestId('finding-compact-row')
    fireEvent.keyDown(row, { key: 'Escape' })

    expect(onToggleExpand).not.toHaveBeenCalled()
  })

  it('[T2.4][P1] should keep focus on same row after expand/collapse via Enter', () => {
    const onToggleExpand = vi.fn()
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
    ]
    render(<FindingList {...defaultProps({ findings, onToggleExpand })} />)

    const row = screen.getAllByTestId('finding-compact-row')[0]!
    fireEvent.keyDown(row, { key: 'Enter' })

    expect(row).toHaveAttribute('tabindex', '0')
  })

  it('[T2.5][P1] should push/pop escape layer for expanded cards', () => {
    const expandedIds = new Set(['c1'])
    render(<FindingList {...defaultProps({ expandedIds })} />)

    expect(mockPushEscapeLayer).toHaveBeenCalledWith('expanded', expect.any(Function))
  })
})

// ═══════════════════════════════════════════════════════════════════════
// AC3: Tab Order — Grid Entry/Exit
// ═══════════════════════════════════════════════════════════════════════

describe('FindingList — AC3: Tab Order', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReviewStore.getState().resetForFile('test')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[T3.1][P1] should focus activeIndex row when Tab enters grid', () => {
    render(<FindingList {...defaultProps()} />)
    const grid = screen.getByRole('grid')

    pressKeyOnGrid(grid, 'j')
    pressKeyOnGrid(grid, 'j')

    const rows = screen.getAllByTestId('finding-compact-row')
    expect(rows[2]!).toHaveAttribute('tabindex', '0')
  })

  it('[T3.2][P1] should persist activeFindingId after J navigation (roving tabindex)', () => {
    render(<FindingList {...defaultProps()} />)
    const grid = screen.getByRole('grid')

    pressKeyOnGrid(grid, 'j')

    const rows = screen.getAllByTestId('finding-compact-row')
    expect(rows[1]!).toHaveAttribute('tabindex', '0')
  })

  it('[T3.3][P0] should NOT auto-focus grid on mount (G#40) — rAF flushed', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })

    render(<FindingList {...defaultProps()} />)

    expect(document.activeElement).toBe(document.body)

    rafSpy.mockRestore()
  })

  it('[T3.5][P1] should sync activeFindingId when mouse clicks a different finding row (M2)', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
      buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)

    const rows = screen.getAllByTestId('finding-compact-row')
    expect(rows[0]!).toHaveAttribute('tabindex', '0')

    fireEvent.click(rows[1]!)

    expect(rows[1]!).toHaveAttribute('tabindex', '0')
    expect(rows[0]!).toHaveAttribute('tabindex', '-1')
  })

  it('[T3.6][P1] should sync activeFindingId when clicking Minor row with accordion OPEN', () => {
    render(<FindingList {...defaultProps()} />)
    openMinorAccordion()

    const rows = screen.getAllByTestId('finding-compact-row')
    expect(rows[0]!).toHaveAttribute('tabindex', '0')

    const minorRow = rows.find((r) => r.getAttribute('data-finding-id') === 'n1')
    expect(minorRow).toBeDefined()

    fireEvent.click(minorRow!)

    expect(minorRow!).toHaveAttribute('tabindex', '0')
    expect(rows[0]!).toHaveAttribute('tabindex', '-1')
  })

  it('[T3.4][P2] should let Tab exit grid to next landmark (native behavior)', () => {
    render(<FindingList {...defaultProps()} />)
    const grid = screen.getByRole('grid')
    const rows = screen.getAllByTestId('finding-compact-row')

    expect(rows[0]!).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(grid, { key: 'Tab' })

    expect(rows[0]!).toHaveAttribute('tabindex', '0')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// AC5: Focus Stability on Realtime Updates
// ═══════════════════════════════════════════════════════════════════════

describe('FindingList — AC5: Focus Stability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReviewStore.getState().resetForFile('test')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[T5.1][P0] should retain focus on same finding ID when new finding inserted above', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
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

  it('[T5.2][P0] should recalculate activeIndex from activeFindingId on list change', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
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

  it('[T5.3][P1] should advance to nearest when focused finding is removed', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
      buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
    ]
    const { rerender } = render(<FindingList {...defaultProps({ findings })} />)
    const grid = screen.getByRole('grid')

    pressKeyOnGrid(grid, 'j')

    const updatedFindings = findings.filter((f) => f.id !== 'm1')
    rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

    const rows = screen.getAllByTestId('finding-compact-row')
    const activeRow = rows.find((r) => r.getAttribute('tabindex') === '0')
    expect(activeRow).toBeDefined()
  })

  it('[T5.4][P1] should NOT reset activeIndex to 0 when findings count changes', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
    ]
    const { rerender } = render(<FindingList {...defaultProps({ findings })} />)
    const grid = screen.getByRole('grid')

    pressKeyOnGrid(grid, 'j')

    const updatedFindings = [
      ...findings,
      buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
    ]
    rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

    const m1Row = screen
      .getAllByTestId('finding-compact-row')
      .find((r) => r.getAttribute('data-finding-id') === 'm1')
    expect(m1Row).toHaveAttribute('tabindex', '0')
  })
})
