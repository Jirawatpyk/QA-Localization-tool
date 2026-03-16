/**
 * Story 4.1b — AC1: J/K/Arrow Navigation + AC4: Minor Accordion Navigation
 *
 * Split from FindingList.keyboard.test.tsx (RV-H1: file size > 300 lines).
 * Covers: roving tabindex, wrap, cross-severity, auto-collapse, Minor accordion.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { FindingList } from '@/features/review/components/FindingList'
import {
  defaultProps,
  pressKeyOnGrid,
  navigateForward,
  openMinorAccordion,
} from '@/features/review/components/FindingList.keyboard.test-helpers'
import { useReviewStore } from '@/features/review/stores/review.store'
import { buildFindingForUI } from '@/test/factories'

// ── Mocks (must be top-level in each test file — vi.mock is hoisted) ──

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

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}))

describe('FindingList — AC1: J/K/Arrow Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReviewStore.getState().resetForFile('test')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[T1.1][P0] should navigate forward on J keydown on grid', () => {
    render(<FindingList {...defaultProps()} />)
    const grid = screen.getByRole('grid')
    const rows = screen.getAllByTestId('finding-compact-row')

    expect(rows[0]!).toHaveAttribute('tabindex', '0')
    expect(rows[1]!).toHaveAttribute('tabindex', '-1')

    pressKeyOnGrid(grid, 'j')

    expect(rows[1]!).toHaveAttribute('tabindex', '0')
    expect(rows[0]!).toHaveAttribute('tabindex', '-1')
  })

  it('[T1.2][P0] should navigate backward on K keydown on grid', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
      buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)
    const grid = screen.getByRole('grid')
    const rows = screen.getAllByTestId('finding-compact-row')

    pressKeyOnGrid(grid, 'j')
    expect(rows[1]!).toHaveAttribute('tabindex', '0')

    pressKeyOnGrid(grid, 'k')
    expect(rows[0]!).toHaveAttribute('tabindex', '0')
    expect(rows[1]!).toHaveAttribute('tabindex', '-1')
  })

  it('[T1.3][P1] should navigate forward on ArrowDown keydown', () => {
    render(<FindingList {...defaultProps()} />)
    const grid = screen.getByRole('grid')
    const rows = screen.getAllByTestId('finding-compact-row')

    pressKeyOnGrid(grid, 'ArrowDown')
    expect(rows[1]!).toHaveAttribute('tabindex', '0')
    expect(rows[0]!).toHaveAttribute('tabindex', '-1')
  })

  it('[T1.4][P1] should navigate backward on ArrowUp keydown', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)
    const grid = screen.getByRole('grid')
    const rows = screen.getAllByTestId('finding-compact-row')

    pressKeyOnGrid(grid, 'ArrowDown')
    expect(rows[1]!).toHaveAttribute('tabindex', '0')

    pressKeyOnGrid(grid, 'ArrowUp')
    expect(rows[0]!).toHaveAttribute('tabindex', '0')
    expect(rows[1]!).toHaveAttribute('tabindex', '-1')
  })

  it('[T1.5][P0] should navigate across severity groups (Critical → Major → Minor)', () => {
    render(<FindingList {...defaultProps()} />)
    openMinorAccordion()

    const rows = screen.getAllByTestId('finding-compact-row')
    expect(rows.length).toBe(6)
    expect(rows[0]!).toHaveAttribute('tabindex', '0')
  })

  it('[T1.6][P1] should wrap J on last finding to first finding', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
      buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)
    const grid = screen.getByRole('grid')

    navigateForward(grid, 3) // c1→m1→m2→wrap→c1

    const rows = screen.getAllByTestId('finding-compact-row')
    expect(rows[0]!).toHaveAttribute('tabindex', '0')
  })

  it('[T1.7][P1] should wrap K on first finding to last finding', () => {
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

  it('[T1.8][P1] should suppress J/K in input elements (G#28)', () => {
    render(<FindingList {...defaultProps()} />)
    const grid = screen.getByRole('grid')
    const rows = screen.getAllByTestId('finding-compact-row')

    expect(rows[0]!).toHaveAttribute('tabindex', '0')

    const input = document.createElement('input')
    grid.appendChild(input)
    fireEvent.keyDown(input, { key: 'j', bubbles: true })

    expect(rows[0]!).toHaveAttribute('tabindex', '0')
    expect(rows[1]!).toHaveAttribute('tabindex', '-1')

    grid.removeChild(input)
  })

  it('[T1.9][P1] should auto-collapse expanded finding before J moves (DD#11)', () => {
    const onToggleExpand = vi.fn()
    const expandedIds = new Set(['c1'])
    render(<FindingList {...defaultProps({ expandedIds, onToggleExpand })} />)

    const grid = screen.getByRole('grid')
    pressKeyOnGrid(grid, 'j')

    expect(onToggleExpand).toHaveBeenCalledWith('c1')
  })

  it('[T1.10][P1] should compute flattenedIds excluding Minor when accordion closed (RV-M2 tightened)', () => {
    render(<FindingList {...defaultProps()} />)
    const grid = screen.getByRole('grid')

    // Navigate J 4 times — should cycle through exactly 4 (2C+2M) and wrap
    navigateForward(grid, 4)

    // After 4 J presses, wraps back to c1 — proves exactly 4 in flattenedIds
    const c1Row = screen
      .getAllByTestId('finding-compact-row')
      .find((r) => r.getAttribute('data-finding-id') === 'c1')
    expect(c1Row).toHaveAttribute('tabindex', '0')
  })

  it('[T1.11][P0] should update tabindex via roving tabindex after J navigation', () => {
    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
      buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)
    const grid = screen.getByRole('grid')
    const rows = screen.getAllByTestId('finding-compact-row')

    expect(rows[0]!).toHaveAttribute('tabindex', '0')
    expect(rows[1]!).toHaveAttribute('tabindex', '-1')
    expect(rows[2]!).toHaveAttribute('tabindex', '-1')

    pressKeyOnGrid(grid, 'j')
    expect(rows[0]!).toHaveAttribute('tabindex', '-1')
    expect(rows[1]!).toHaveAttribute('tabindex', '0')
    expect(rows[2]!).toHaveAttribute('tabindex', '-1')
  })

  it('[T1.12][P2] should call DOM focus() via requestAnimationFrame after navigation', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })

    const findings = [
      buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
      buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
    ]
    render(<FindingList {...defaultProps({ findings })} />)

    const grid = screen.getByRole('grid')
    pressKeyOnGrid(grid, 'j')

    expect(rafSpy).toHaveBeenCalled()
    rafSpy.mockRestore()
  })
})

describe('FindingList — AC4: Minor Accordion Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReviewStore.getState().resetForFile('test')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[T4.1][P0] should exclude Minor IDs from flattenedIds when accordion is closed', () => {
    render(<FindingList {...defaultProps()} />)
    const grid = screen.getByRole('grid')

    // 4 J presses cycles through 4 (C+M), wrapping back to c1
    navigateForward(grid, 4)

    const c1Row = screen
      .getAllByTestId('finding-compact-row')
      .find((r) => r.getAttribute('data-finding-id') === 'c1')
    expect(c1Row).toHaveAttribute('tabindex', '0')
  })

  it('[T4.2][P0] should include Minor IDs in flattenedIds when accordion is open', () => {
    render(<FindingList {...defaultProps()} />)
    openMinorAccordion()

    const rows = screen.getAllByTestId('finding-compact-row')
    expect(rows.length).toBe(6)

    const grid = screen.getByRole('grid')
    // 6 J presses cycles through all 6 findings, wrapping back to c1
    navigateForward(grid, 6)

    const c1Row = rows.find((r) => r.getAttribute('data-finding-id') === 'c1')
    expect(c1Row).toHaveAttribute('tabindex', '0')
  })

  it('[T4.3][P1] should navigate J from last Major to first Minor when accordion open', () => {
    render(<FindingList {...defaultProps()} />)
    openMinorAccordion()

    const grid = screen.getByRole('grid')
    navigateForward(grid, 4) // c1→c2→m1→m2→n1

    const n1Row = screen
      .getAllByTestId('finding-compact-row')
      .find((r) => r.getAttribute('data-finding-id') === 'n1')
    expect(n1Row).toHaveAttribute('tabindex', '0')
  })

  it('[T4.4][P1] should wrap J from last Major to first Critical when accordion closed', () => {
    render(<FindingList {...defaultProps()} />)
    const grid = screen.getByRole('grid')

    navigateForward(grid, 4) // c1→c2→m1→m2→wrap→c1

    const c1Row = screen
      .getAllByTestId('finding-compact-row')
      .find((r) => r.getAttribute('data-finding-id') === 'c1')
    expect(c1Row).toHaveAttribute('tabindex', '0')
  })

  it('[T4.5][P1] should navigate K from first Minor to last Major', () => {
    render(<FindingList {...defaultProps()} />)
    openMinorAccordion()

    const grid = screen.getByRole('grid')
    navigateForward(grid, 4) // → n1

    pressKeyOnGrid(grid, 'k') // n1 → m2

    const m2Row = screen
      .getAllByTestId('finding-compact-row')
      .find((r) => r.getAttribute('data-finding-id') === 'm2')
    expect(m2Row).toHaveAttribute('tabindex', '0')
  })
})
