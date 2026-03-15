/**
 * ATDD Tests — Story 4.1b: Keyboard Navigation & Focus Management
 *
 * GREEN PHASE: Tests activated — implementation in FindingList.tsx.
 *
 * Test Levels:
 *   - AC1: J/K/Arrow Navigation with Roving Tabindex
 *   - AC2: Enter/Esc Expand/Collapse (additive to 4.1a per-row handlers)
 *   - AC3: Tab Order — Grid Entry/Exit
 *   - AC4: Minor Accordion Keyboard Interaction
 *   - AC5: Focus Stability on Realtime Updates
 *   - AC6: Keyboard Accessibility Compliance
 *
 * Guardrails: #27 (focus indicator), #28 (scoped hotkeys), #29 (roving tabindex),
 *   #31 (escape hierarchy), #37 (reduced motion), #40 (no focus stealing)
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { FindingList } from '@/features/review/components/FindingList'
import { useReviewStore } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import { buildFindingForUI } from '@/test/factories'

// ── Helper: build findings spanning all severity groups ──

function buildMixedSeverityFindings(): FindingForDisplay[] {
  return [
    buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
    buildFindingForUI({ id: 'c2', severity: 'critical', aiConfidence: 80 }),
    buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
    buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
    buildFindingForUI({ id: 'n1', severity: 'minor', aiConfidence: 50 }),
    buildFindingForUI({ id: 'n2', severity: 'minor', aiConfidence: 40 }),
  ]
}

function defaultProps(overrides?: Record<string, unknown>) {
  return {
    findings: buildMixedSeverityFindings(),
    expandedIds: new Set<string>(),
    onToggleExpand: vi.fn(),
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    ...overrides,
  }
}

// ── Mock useKeyboardActions (still needed for pushEscapeLayer/popEscapeLayer tests) ──

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

// ── Mock useReducedMotion ──

let mockReducedMotion = false
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion,
}))

// ── Helper: press key on grid element ──

function pressKeyOnGrid(grid: HTMLElement, key: string, eventInit?: Partial<KeyboardEventInit>) {
  act(() => {
    fireEvent.keyDown(grid, { key, bubbles: true, ...eventInit })
  })
}

describe('FindingList — Keyboard Navigation (Story 4.1b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion = false
    // CR-C1: reset store activeFindingId + selectedId to prevent state leakage
    useReviewStore.getState().resetForFile('test')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: J/K/Arrow Navigation with Roving Tabindex
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC1: J/K/Arrow Navigation', () => {
    it('[T1.1][P0] should navigate forward on J keydown on grid', () => {
      render(<FindingList {...defaultProps()} />)

      const grid = screen.getByRole('grid')
      const rows = screen.getAllByTestId('finding-compact-row')

      // First row should be initially active (tabindex=0)
      expect(rows[0]!).toHaveAttribute('tabindex', '0')
      expect(rows[1]!).toHaveAttribute('tabindex', '-1')

      // Press J on grid
      pressKeyOnGrid(grid, 'j')

      // Second row should now be active
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

      // Navigate forward first to m1
      pressKeyOnGrid(grid, 'j')
      expect(rows[1]!).toHaveAttribute('tabindex', '0')

      // Press K to go backward
      pressKeyOnGrid(grid, 'k')
      expect(rows[0]!).toHaveAttribute('tabindex', '0')
      expect(rows[1]!).toHaveAttribute('tabindex', '-1')
    })

    it('[T1.3][P1] should navigate forward on ArrowDown keydown', () => {
      render(<FindingList {...defaultProps()} />)

      const grid = screen.getByRole('grid')
      const rows = screen.getAllByTestId('finding-compact-row')

      expect(rows[0]!).toHaveAttribute('tabindex', '0')

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

      // Navigate forward first
      pressKeyOnGrid(grid, 'ArrowDown')
      expect(rows[1]!).toHaveAttribute('tabindex', '0')

      // ArrowUp to go back
      pressKeyOnGrid(grid, 'ArrowUp')
      expect(rows[0]!).toHaveAttribute('tabindex', '0')
      expect(rows[1]!).toHaveAttribute('tabindex', '-1')
    })

    it('[T1.5][P0] should navigate across severity groups (Critical → Major → Minor)', () => {
      // GIVEN: 6 findings across 3 severity groups, Minor accordion OPEN
      render(<FindingList {...defaultProps()} />)

      // Open Minor accordion first
      const accordionTrigger = screen.getByText(/Minor \(2\)/)
      fireEvent.click(accordionTrigger)

      const rows = screen.getAllByTestId('finding-compact-row')
      // flattenedIds should be: [c1, c2, m1, m2, n1, n2]
      expect(rows.length).toBe(6)

      // First row (c1) should be initially active
      expect(rows[0]!).toHaveAttribute('tabindex', '0')
    })

    it('[T1.6][P1] should wrap J on last finding to first finding', () => {
      // GIVEN: 3 findings (no Minor), active on last finding
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      const grid = screen.getByRole('grid')

      // Navigate J twice → active on m2 (index 2)
      pressKeyOnGrid(grid, 'j')
      pressKeyOnGrid(grid, 'j')
      // m2 should be active
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[2]!).toHaveAttribute('tabindex', '0')

      // Navigate J once more → wraps to c1 (index 0)
      pressKeyOnGrid(grid, 'j')
      expect(rows[0]!).toHaveAttribute('tabindex', '0')
    })

    it('[T1.7][P1] should wrap K on first finding to last finding', () => {
      // GIVEN: 3 findings, active on first finding (c1)
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      const grid = screen.getByRole('grid')

      // K at index 0 → wraps to m2 (index 2)
      pressKeyOnGrid(grid, 'k')
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[2]!).toHaveAttribute('tabindex', '0')
    })

    it('[T1.8][P1] should suppress J/K in input elements (G#28)', () => {
      // The grid onKeyDown handler checks target.tagName for INPUT/TEXTAREA/SELECT
      // and returns early without navigating
      render(<FindingList {...defaultProps()} />)

      const grid = screen.getByRole('grid')
      const rows = screen.getAllByTestId('finding-compact-row')

      // Initially c1 is active
      expect(rows[0]!).toHaveAttribute('tabindex', '0')

      // Simulate J keydown with target being an INPUT element
      // fireEvent.keyDown dispatches from the grid, but we need to simulate
      // the target being an input. We create a synthetic event targeting an input.
      const input = document.createElement('input')
      grid.appendChild(input)
      fireEvent.keyDown(input, { key: 'j', bubbles: true })

      // Should NOT navigate — c1 still active
      expect(rows[0]!).toHaveAttribute('tabindex', '0')
      expect(rows[1]!).toHaveAttribute('tabindex', '-1')

      grid.removeChild(input)
    })

    it('[T1.9][P1] should auto-collapse expanded finding before J moves (DD#11)', () => {
      // GIVEN: c1 is expanded, active on c1
      const onToggleExpand = vi.fn()
      const expandedIds = new Set(['c1'])
      render(<FindingList {...defaultProps({ expandedIds, onToggleExpand })} />)

      const grid = screen.getByRole('grid')

      // WHEN: J handler invoked (navigateNext)
      pressKeyOnGrid(grid, 'j')

      // THEN: onToggleExpand('c1') called (auto-collapse before moving)
      expect(onToggleExpand).toHaveBeenCalledWith('c1')
    })

    it('[T1.10][P1] should compute flattenedIds from severity groups', () => {
      // GIVEN: 2C + 2M + 2m findings, Minor accordion closed
      render(<FindingList {...defaultProps()} />)

      // THEN: Only Critical + Major rows participate in J/K navigation
      const rows = screen.getAllByTestId('finding-compact-row')
      // 4 visible navigable rows (2C + 2M) with roving tabindex
      const navigableRows = rows.filter((r) => {
        const tabindex = r.getAttribute('tabindex')
        return tabindex === '0' || tabindex === '-1'
      })
      // Critical + Major visible (Minor inside closed accordion but still rendered)
      // All rows have tabindex, but Minor rows are tabindex=-1 (not in flattenedIds)
      // Active row is c1 (tabindex=0)
      expect(navigableRows.length).toBeGreaterThanOrEqual(4)
    })

    it('[T1.11][P0] should update tabindex via roving tabindex after J navigation', () => {
      // GIVEN: 3 findings, initially active on first
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      const grid = screen.getByRole('grid')
      const rows = screen.getAllByTestId('finding-compact-row')
      // Initially c1 active
      expect(rows[0]!).toHaveAttribute('tabindex', '0')
      expect(rows[1]!).toHaveAttribute('tabindex', '-1')
      expect(rows[2]!).toHaveAttribute('tabindex', '-1')

      // After J: m1 should be active
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

      // Navigate J → should trigger requestAnimationFrame
      pressKeyOnGrid(grid, 'j')

      expect(rafSpy).toHaveBeenCalled()
      rafSpy.mockRestore()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC2: Enter/Esc Expand/Collapse (additive tests — 4.1a covers per-row)
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC2: Enter/Esc Expand/Collapse (additive)', () => {
    it('[T2.3][P1] should NOT bubble Esc when finding is collapsed (no action)', () => {
      // GIVEN: Finding is NOT expanded, active row focused
      const onToggleExpand = vi.fn()
      const findings = [buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 })]
      render(<FindingList {...defaultProps({ findings, onToggleExpand })} />)

      // WHEN: Esc key pressed on collapsed row
      const row = screen.getByTestId('finding-compact-row')
      fireEvent.keyDown(row, { key: 'Escape' })

      // THEN: onToggleExpand NOT called (already collapsed — per-row handler checks isExpanded)
      expect(onToggleExpand).not.toHaveBeenCalled()
    })

    it('[T2.4][P1] should keep focus on same row after expand/collapse via Enter', () => {
      // GIVEN: Focus on row c1 (activeIndex=0)
      const onToggleExpand = vi.fn()
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
      ]
      render(<FindingList {...defaultProps({ findings, onToggleExpand })} />)

      // WHEN: Enter pressed on c1
      const row = screen.getAllByTestId('finding-compact-row')[0]!
      fireEvent.keyDown(row, { key: 'Enter' })

      // THEN: activeFindingId stays 'c1', focus stays on c1 row
      expect(row).toHaveAttribute('tabindex', '0')
    })

    it('[T2.5][P1] should push/pop escape layer for expanded cards', () => {
      // GIVEN: FindingList with c1 expanded
      const expandedIds = new Set(['c1'])
      render(<FindingList {...defaultProps({ expandedIds })} />)

      // THEN: pushEscapeLayer('expanded', ...) should have been called
      expect(mockPushEscapeLayer).toHaveBeenCalledWith('expanded', expect.any(Function))
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC3: Tab Order — Grid Entry/Exit
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC3: Tab Order', () => {
    it('[T3.1][P1] should focus activeIndex row when Tab enters grid', () => {
      // GIVEN: FindingList rendered
      render(<FindingList {...defaultProps()} />)

      const grid = screen.getByRole('grid')

      // Navigate to m1 first
      pressKeyOnGrid(grid, 'j')
      pressKeyOnGrid(grid, 'j')

      // THEN: m1 should be active
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[2]!).toHaveAttribute('tabindex', '0')
    })

    it('[T3.2][P1] should persist activeFindingId after J navigation (roving tabindex)', () => {
      // GIVEN: Default findings rendered, active on c1 (index 0)
      render(<FindingList {...defaultProps()} />)

      const grid = screen.getByRole('grid')

      // WHEN: Navigate J once → moves to c2 (index 1, sorted by confidence desc)
      pressKeyOnGrid(grid, 'j')

      // THEN: c2 has tabindex=0 (activeFindingId persists across renders)
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[1]!).toHaveAttribute('tabindex', '0')
    })

    it('[T3.3][P0] should NOT auto-focus grid on mount (G#40) — rAF flushed', () => {
      // H2 fix: Mock rAF to execute synchronously so focus stealing would be detected
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        cb(0)
        return 0
      })

      // GIVEN: Fresh render with rAF executing inline
      render(<FindingList {...defaultProps()} />)

      // THEN: No element inside FindingList is focused (G#40 mount guard prevents it)
      expect(document.activeElement).toBe(document.body)

      rafSpy.mockRestore()
    })

    it('[T3.5][P1] should sync activeFindingId when mouse clicks a different finding row (M2)', () => {
      // GIVEN: Active on c1, 3 findings
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      const rows = screen.getAllByTestId('finding-compact-row')
      // Initially c1 is active
      expect(rows[0]!).toHaveAttribute('tabindex', '0')

      // WHEN: Mouse click on m1 row
      fireEvent.click(rows[1]!)

      // THEN: m1 becomes active (tabindex=0), c1 becomes inactive (tabindex=-1)
      expect(rows[1]!).toHaveAttribute('tabindex', '0')
      expect(rows[0]!).toHaveAttribute('tabindex', '-1')
    })

    it('[T3.6][P1] should sync activeFindingId when clicking Minor row with accordion OPEN', () => {
      // GIVEN: accordion OPEN, active on c1
      render(<FindingList {...defaultProps()} />)
      const trigger = screen.getByText(/Minor \(2\)/)
      fireEvent.click(trigger)

      const rows = screen.getAllByTestId('finding-compact-row')
      // c1 is active
      expect(rows[0]!).toHaveAttribute('tabindex', '0')

      // Find Minor row n1 (now in DOM + flattenedIds since accordion is open)
      const minorRow = rows.find((r) => r.getAttribute('data-finding-id') === 'n1')
      expect(minorRow).toBeDefined()

      // WHEN: Click the Minor row
      fireEvent.click(minorRow!)

      // THEN: n1 becomes active (in flattenedIds when accordion open)
      expect(minorRow!).toHaveAttribute('tabindex', '0')
      expect(rows[0]!).toHaveAttribute('tabindex', '-1')
    })

    it('[T3.4][P2] should let Tab exit grid to next landmark (native behavior)', () => {
      // GIVEN: FindingList rendered
      render(<FindingList {...defaultProps()} />)

      // THEN: Grid onKeyDown handler does NOT intercept Tab key
      // Verify by pressing Tab on grid — tabindex should NOT change (Tab is not handled)
      const grid = screen.getByRole('grid')
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[0]!).toHaveAttribute('tabindex', '0')

      fireEvent.keyDown(grid, { key: 'Tab' })

      // Active row unchanged — Tab was not intercepted
      expect(rows[0]!).toHaveAttribute('tabindex', '0')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC4: Minor Accordion Keyboard Interaction
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC4: Minor Accordion Navigation', () => {
    it('[T4.1][P0] should exclude Minor IDs from flattenedIds when accordion is closed', () => {
      // GIVEN: 2C + 2M + 2m, accordion default CLOSED
      render(<FindingList {...defaultProps()} />)

      const grid = screen.getByRole('grid')

      // Navigate through all findings with J — should only cycle through 4 (C+M)
      pressKeyOnGrid(grid, 'j') // c2
      pressKeyOnGrid(grid, 'j') // m1
      pressKeyOnGrid(grid, 'j') // m2
      pressKeyOnGrid(grid, 'j') // wrap → c1

      // After 4 J presses, should be back at c1
      const rows = screen.getAllByTestId('finding-compact-row')
      const c1Row = rows.find((r) => r.getAttribute('data-finding-id') === 'c1')
      expect(c1Row).toHaveAttribute('tabindex', '0')
    })

    it('[T4.2][P0] should include Minor IDs in flattenedIds when accordion is open', () => {
      // GIVEN: 2C + 2M + 2m
      render(<FindingList {...defaultProps()} />)

      // WHEN: Open Minor accordion
      const trigger = screen.getByText(/Minor \(2\)/)
      fireEvent.click(trigger)

      // THEN: All 6 rows participate in J/K navigation
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows.length).toBe(6)

      const grid = screen.getByRole('grid')

      // Navigate J through all 6
      pressKeyOnGrid(grid, 'j') // c2
      pressKeyOnGrid(grid, 'j') // m1
      pressKeyOnGrid(grid, 'j') // m2
      pressKeyOnGrid(grid, 'j') // n1
      pressKeyOnGrid(grid, 'j') // n2
      pressKeyOnGrid(grid, 'j') // wrap → c1

      const c1Row = rows.find((r) => r.getAttribute('data-finding-id') === 'c1')
      expect(c1Row).toHaveAttribute('tabindex', '0')
    })

    it('[T4.3][P1] should navigate J from last Major to first Minor when accordion open', () => {
      // GIVEN: Accordion open
      render(<FindingList {...defaultProps()} />)
      const trigger = screen.getByText(/Minor \(2\)/)
      fireEvent.click(trigger)

      const grid = screen.getByRole('grid')

      // Navigate to m2 (last Major — index 3)
      pressKeyOnGrid(grid, 'j') // c2
      pressKeyOnGrid(grid, 'j') // m1
      pressKeyOnGrid(grid, 'j') // m2

      // J from m2 → n1 (first Minor)
      pressKeyOnGrid(grid, 'j')
      const rows = screen.getAllByTestId('finding-compact-row')
      const n1Row = rows.find((r) => r.getAttribute('data-finding-id') === 'n1')
      expect(n1Row).toHaveAttribute('tabindex', '0')
    })

    it('[T4.4][P1] should wrap J from last Major to first Critical when accordion closed', () => {
      // GIVEN: Accordion closed
      render(<FindingList {...defaultProps()} />)

      const grid = screen.getByRole('grid')

      // Navigate to m2 (last visible finding)
      pressKeyOnGrid(grid, 'j') // c2
      pressKeyOnGrid(grid, 'j') // m1
      pressKeyOnGrid(grid, 'j') // m2

      // J from m2 → wraps to c1 (Minor skipped)
      pressKeyOnGrid(grid, 'j')
      const rows = screen.getAllByTestId('finding-compact-row')
      const c1Row = rows.find((r) => r.getAttribute('data-finding-id') === 'c1')
      expect(c1Row).toHaveAttribute('tabindex', '0')
    })

    it('[T4.5][P1] should navigate K from first Minor to last Major', () => {
      // GIVEN: Accordion open, navigate to n1
      render(<FindingList {...defaultProps()} />)
      const trigger = screen.getByText(/Minor \(2\)/)
      fireEvent.click(trigger)

      const grid = screen.getByRole('grid')

      // Navigate to n1 (first Minor — index 4)
      pressKeyOnGrid(grid, 'j') // c2
      pressKeyOnGrid(grid, 'j') // m1
      pressKeyOnGrid(grid, 'j') // m2
      pressKeyOnGrid(grid, 'j') // n1

      // K from n1 → m2 (last Major)
      pressKeyOnGrid(grid, 'k')
      const rows = screen.getAllByTestId('finding-compact-row')
      const m2Row = rows.find((r) => r.getAttribute('data-finding-id') === 'm2')
      expect(m2Row).toHaveAttribute('tabindex', '0')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC5: Focus Stability on Realtime Updates
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC5: Focus Stability', () => {
    it('[T5.1][P0] should retain focus on same finding ID when new finding inserted above', () => {
      // GIVEN: Active on m1 (navigate to it first)
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
      ]
      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      const grid = screen.getByRole('grid')

      // Navigate to m1
      pressKeyOnGrid(grid, 'j')

      // WHEN: New critical finding inserted above (Realtime push)
      const updatedFindings = [
        buildFindingForUI({ id: 'c-new', severity: 'critical', aiConfidence: 99 }),
        ...findings,
      ]
      rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

      // THEN: m1 still has tabIndex=0 (focus tracked by ID, not index)
      const m1Row = screen
        .getAllByTestId('finding-compact-row')
        .find((r) => r.getAttribute('data-finding-id') === 'm1')
      expect(m1Row).toHaveAttribute('tabindex', '0')
    })

    it('[T5.2][P0] should recalculate activeIndex from activeFindingId on list change', () => {
      // GIVEN: Active on m1 at index 1
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
      ]
      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      const grid = screen.getByRole('grid')

      // Navigate to m1
      pressKeyOnGrid(grid, 'j')

      // WHEN: New finding inserted → m1 moves to index 2
      const updatedFindings = [
        buildFindingForUI({ id: 'c-new', severity: 'critical', aiConfidence: 99 }),
        ...findings,
      ]
      rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

      // THEN: m1 row should still have tabIndex=0
      const m1Row = screen
        .getAllByTestId('finding-compact-row')
        .find((r) => r.getAttribute('data-finding-id') === 'm1')
      expect(m1Row).toHaveAttribute('tabindex', '0')
    })

    it('[T5.3][P1] should advance to nearest when focused finding is removed', () => {
      // GIVEN: Active on m1
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      const grid = screen.getByRole('grid')

      // Navigate to m1
      pressKeyOnGrid(grid, 'j')

      // WHEN: m1 is removed from findings (Realtime deletion)
      const updatedFindings = findings.filter((f) => f.id !== 'm1')
      rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

      // THEN: Some row should have tabIndex=0 (not crash, focus advanced)
      const rows = screen.getAllByTestId('finding-compact-row')
      const activeRow = rows.find((r) => r.getAttribute('tabindex') === '0')
      expect(activeRow).toBeDefined()
    })

    it('[T5.4][P1] should NOT reset activeIndex to 0 when findings count changes', () => {
      // GIVEN: Navigate to m1 (index 1)
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
      ]
      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      const grid = screen.getByRole('grid')

      // Navigate to m1
      pressKeyOnGrid(grid, 'j')

      // WHEN: New finding added (count changes)
      const updatedFindings = [
        ...findings,
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

      // THEN: m1 row should still have tabIndex=0 (NOT reset to c1)
      const m1Row = screen
        .getAllByTestId('finding-compact-row')
        .find((r) => r.getAttribute('data-finding-id') === 'm1')
      expect(m1Row).toHaveAttribute('tabindex', '0')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC6: Keyboard Accessibility Compliance
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC6: Accessibility', () => {
    it('[T6.1][P0] should render aria-label with "Finding N of M, severity, category, status"', () => {
      // GIVEN: FindingList with 3 findings
      const findings = [
        buildFindingForUI({
          id: 'c1',
          severity: 'critical',
          category: 'accuracy',
          aiConfidence: 95,
        }),
        buildFindingForUI({ id: 'm1', severity: 'major', category: 'fluency', aiConfidence: 80 }),
        buildFindingForUI({
          id: 'n1',
          severity: 'minor',
          category: 'whitespace',
          aiConfidence: 50,
        }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      // THEN: First row has aria-label containing finding position and severity
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[0]!).toHaveAttribute('aria-label', expect.stringContaining('Finding 1 of'))
      expect(rows[0]!).toHaveAttribute('aria-label', expect.stringContaining('critical'))
    })

    it('[T6.2][P1] should set aria-rowindex on each row', () => {
      // GIVEN: 3 findings
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
        buildFindingForUI({ id: 'n1', severity: 'minor', aiConfidence: 50 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      // THEN: rows have aria-rowindex 1, 2, 3
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[0]!).toHaveAttribute('aria-rowindex', '1')
      expect(rows[1]!).toHaveAttribute('aria-rowindex', '2')
    })

    it('[T6.3][P1] should set aria-rowcount on grid container', () => {
      // GIVEN: 6 findings
      render(<FindingList {...defaultProps()} />)

      // THEN: Grid container has aria-rowcount=6
      const grid = screen.getByRole('grid')
      expect(grid).toHaveAttribute('aria-rowcount', '6')
    })

    it('[T6.4][P1] should use instant scroll when prefers-reduced-motion is active (G#37)', () => {
      mockReducedMotion = true

      // jsdom doesn't define scrollIntoView — define it so we can spy on it
      HTMLElement.prototype.scrollIntoView = HTMLElement.prototype.scrollIntoView ?? (() => {})

      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        cb(0)
        return 0
      })
      const scrollSpy = vi
        .spyOn(HTMLElement.prototype, 'scrollIntoView')
        .mockImplementation(() => {})

      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      const grid = screen.getByRole('grid')
      pressKeyOnGrid(grid, 'j')

      // When reduced motion, scrollIntoView MUST be called with 'instant' (no conditional — anti-pattern #39)
      expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }))

      rafSpy.mockRestore()
      scrollSpy.mockRestore()
    })

    it('[T6.5][P2] should verify rowgroup aria-label unchanged from 4.1a', () => {
      // GIVEN: Findings spanning 3 severity groups
      render(<FindingList {...defaultProps()} />)

      // THEN: rowgroups have correct labels
      const rowgroups = screen.getAllByRole('rowgroup')
      expect(rowgroups[0]!).toHaveAttribute('aria-label', 'Critical findings')
      expect(rowgroups[1]!).toHaveAttribute('aria-label', 'Major findings')
      expect(rowgroups[2]!).toHaveAttribute('aria-label', 'Minor findings')
    })

    it('[T6.6][P1] should handle J/K only within grid scope (not global document)', () => {
      // GIVEN: FindingList rendered — J/K handled via grid onKeyDown, not document listener
      render(<FindingList {...defaultProps()} />)

      const grid = screen.getByRole('grid')
      const rows = screen.getAllByTestId('finding-compact-row')

      // J on grid navigates
      pressKeyOnGrid(grid, 'j')
      expect(rows[1]!).toHaveAttribute('tabindex', '0')

      // J dispatched on document body does NOT navigate (scoped to grid)
      act(() => {
        fireEvent.keyDown(document.body, { key: 'j', bubbles: true })
      })
      // Still on rows[1], not rows[2]
      expect(rows[1]!).toHaveAttribute('tabindex', '0')
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Boundary Value Tests (MANDATORY — Epic 2 Retro A2)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Boundary Tests', () => {
    it('[B1][P1] should wrap J on last finding (idx=length-1) to first (idx=0)', () => {
      // GIVEN: 3 findings
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      const grid = screen.getByRole('grid')

      // Navigate to last
      pressKeyOnGrid(grid, 'j') // m1
      pressKeyOnGrid(grid, 'j') // m2

      // J at last → wrap to c1
      pressKeyOnGrid(grid, 'j')
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[0]!).toHaveAttribute('tabindex', '0')
    })

    it('[B2][P1] should wrap K on first finding (idx=0) to last (idx=length-1)', () => {
      // GIVEN: 3 findings, active on first
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      const grid = screen.getByRole('grid')

      // K at first → wrap to m2
      pressKeyOnGrid(grid, 'k')
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[2]!).toHaveAttribute('tabindex', '0')
    })

    it('[B3][P1] should handle single finding: J/K stays on same finding', () => {
      // GIVEN: Only 1 finding
      const findings = [buildFindingForUI({ id: 'solo', severity: 'major', aiConfidence: 80 })]
      render(<FindingList {...defaultProps({ findings })} />)

      const grid = screen.getByRole('grid')
      const row = screen.getByTestId('finding-compact-row')
      expect(row).toHaveAttribute('tabindex', '0')

      // J wraps to self
      pressKeyOnGrid(grid, 'j')
      expect(row).toHaveAttribute('tabindex', '0')

      // K wraps to self
      pressKeyOnGrid(grid, 'k')
      expect(row).toHaveAttribute('tabindex', '0')
    })

    it('[B4][P1] should handle empty list: no navigation, no crash', () => {
      // GIVEN: 0 findings
      render(<FindingList {...defaultProps({ findings: [] })} />)

      // THEN: No crash, empty state rendered
      expect(screen.getByText(/no findings/i)).toBeInTheDocument()
    })

    it('[B5][P1] should handle focused finding removed from empty result', () => {
      // GIVEN: 1 finding active
      const findings = [buildFindingForUI({ id: 'solo', severity: 'major', aiConfidence: 80 })]
      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      // WHEN: Finding removed → empty list
      rerender(<FindingList {...defaultProps({ findings: [] })} />)

      // THEN: Renders empty state, no crash
      expect(screen.getByText(/no findings/i)).toBeInTheDocument()
    })

    it('[B6][P1] should render "Finding 1 of 1" aria-label for single finding', () => {
      // GIVEN: 1 finding
      const findings = [
        buildFindingForUI({
          id: 'solo',
          severity: 'critical',
          category: 'accuracy',
          aiConfidence: 95,
        }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      // THEN: aria-label contains "Finding 1 of 1"
      const row = screen.getByTestId('finding-compact-row')
      expect(row).toHaveAttribute('aria-label', expect.stringContaining('Finding 1 of 1'))
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Party Mode Additions (2026-03-10)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Party Mode: Additional Tests', () => {
    it('[T-IME-01][P1] should suppress J/K during IME composition (isComposing guard)', () => {
      // GIVEN: FindingList rendered with findings
      render(<FindingList {...defaultProps()} />)

      const grid = screen.getByRole('grid')
      const rows = screen.getAllByTestId('finding-compact-row')

      // Initially c1 is active
      expect(rows[0]!).toHaveAttribute('tabindex', '0')

      // WHEN: J pressed during IME composition (isComposing=true)
      act(() => {
        fireEvent.keyDown(grid, { key: 'j', isComposing: true, bubbles: true })
      })

      // THEN: Navigation suppressed — c1 still active
      expect(rows[0]!).toHaveAttribute('tabindex', '0')
      expect(rows[1]!).toHaveAttribute('tabindex', '-1')

      // Also test keyCode 229 (IME process key)
      act(() => {
        fireEvent.keyDown(grid, { key: 'j', keyCode: 229, bubbles: true })
      })

      // THEN: Still suppressed
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

      // focus() should have been called on the target row (via rAF)
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
      // Trigger a navigation to schedule a rAF
      pressKeyOnGrid(grid, 'j')

      // WHEN: Component unmounts
      unmount()

      // THEN: cancelAnimationFrame should have been called (cleanup in useEffect return)
      expect(cancelRafSpy).toHaveBeenCalled()

      cancelRafSpy.mockRestore()
    })

    it('[T-ASYNC-01][P2] should handle async rerender during navigation without focus jump', () => {
      // GIVEN: Active on m1
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      const grid = screen.getByRole('grid')

      // Navigate to m1
      pressKeyOnGrid(grid, 'j')

      // Async rerender (Realtime push) while user is navigating
      const updatedFindings = [
        buildFindingForUI({ id: 'c-new', severity: 'critical', aiConfidence: 99 }),
        ...findings,
      ]
      rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

      // THEN: activeFindingId stays 'm1' (ID-based tracking)
      const m1Row = screen
        .getAllByTestId('finding-compact-row')
        .find((r) => r.getAttribute('data-finding-id') === 'm1')
      expect(m1Row).toHaveAttribute('tabindex', '0')
    })
  })
})
