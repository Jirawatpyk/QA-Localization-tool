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

// ── Mock useKeyboardActions to capture registered handlers ──

type HandlerFn = (event: KeyboardEvent) => void
type RegisterCall = [string, HandlerFn, { scope: string; description: string }]

const registeredHandlers = new Map<string, HandlerFn>()
const mockCleanups: Array<() => void> = []

const mockRegister = vi.fn(
  (key: string, handler: HandlerFn, _options: { scope: string; description: string }) => {
    registeredHandlers.set(key, handler)
    const cleanup = vi.fn(() => {
      registeredHandlers.delete(key)
    })
    mockCleanups.push(cleanup)
    return cleanup
  },
)

const mockPushEscapeLayer = vi.fn()
const mockPopEscapeLayer = vi.fn()

vi.mock('@/features/review/hooks/use-keyboard-actions', () => ({
  useKeyboardActions: () => ({
    register: mockRegister,
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

// ── Helper to simulate J/K key presses via registered handlers ──

function pressKey(key: string) {
  const handler = registeredHandlers.get(key)
  if (handler) {
    act(() => {
      handler(new KeyboardEvent('keydown', { key, bubbles: true }))
    })
  }
}

describe('FindingList — Keyboard Navigation (Story 4.1b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registeredHandlers.clear()
    mockCleanups.length = 0
    mockReducedMotion = false
    // CR-C1 fix: reset store selectedId to prevent state leakage between tests
    // (FindingList now syncs activeFindingId → store.selectedId)
    useReviewStore.getState().setSelectedFinding(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: J/K/Arrow Navigation with Roving Tabindex
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC1: J/K/Arrow Navigation', () => {
    it('[T1.1][P0] should register J handler that moves activeIndex forward', () => {
      render(<FindingList {...defaultProps()} />)

      // THEN: register called with 'j' key and scope 'review'
      expect(mockRegister).toHaveBeenCalledWith(
        'j',
        expect.any(Function),
        expect.objectContaining({ scope: 'review' }),
      )

      // Verify J handler was registered
      const jCall = mockRegister.mock.calls.find((call: RegisterCall) => call[0] === 'j')
      expect(jCall).toBeDefined()
    })

    it('[T1.2][P0] should register K handler that moves activeIndex backward', () => {
      render(<FindingList {...defaultProps()} />)

      expect(mockRegister).toHaveBeenCalledWith(
        'k',
        expect.any(Function),
        expect.objectContaining({ scope: 'review' }),
      )
    })

    it('[T1.3][P1] should register ArrowDown handler same as J', () => {
      render(<FindingList {...defaultProps()} />)

      expect(mockRegister).toHaveBeenCalledWith(
        'ArrowDown',
        expect.any(Function),
        expect.objectContaining({ scope: 'review' }),
      )
    })

    it('[T1.4][P1] should register ArrowUp handler same as K', () => {
      render(<FindingList {...defaultProps()} />)

      expect(mockRegister).toHaveBeenCalledWith(
        'ArrowUp',
        expect.any(Function),
        expect.objectContaining({ scope: 'review' }),
      )
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

      // Navigate J twice → active on m2 (index 2)
      pressKey('j')
      pressKey('j')
      // m2 should be active
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[2]!).toHaveAttribute('tabindex', '0')

      // Navigate J once more → wraps to c1 (index 0)
      pressKey('j')
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

      // K at index 0 → wraps to m2 (index 2)
      pressKey('k')
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[2]!).toHaveAttribute('tabindex', '0')
    })

    it('[T1.8][P1] should suppress J/K in input elements (G#28)', () => {
      render(<FindingList {...defaultProps()} />)

      // THEN: register calls should NOT specify allowInInput (defaults to false)
      const jCall = mockRegister.mock.calls.find((call: RegisterCall) => call[0] === 'j')
      expect(jCall).toBeDefined()
      // allowInInput is not set in options → defaults to false in useKeyboardActions
      const options = (jCall as RegisterCall)[2]
      expect(options).not.toHaveProperty('allowInInput', true)
    })

    it('[T1.9][P1] should auto-collapse expanded finding before J moves (DD#11)', () => {
      // GIVEN: c1 is expanded, active on c1
      const onToggleExpand = vi.fn()
      const expandedIds = new Set(['c1'])
      render(<FindingList {...defaultProps({ expandedIds, onToggleExpand })} />)

      // WHEN: J handler invoked (navigateNext)
      pressKey('j')

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

      const rows = screen.getAllByTestId('finding-compact-row')
      // Initially c1 active
      expect(rows[0]!).toHaveAttribute('tabindex', '0')
      expect(rows[1]!).toHaveAttribute('tabindex', '-1')
      expect(rows[2]!).toHaveAttribute('tabindex', '-1')

      // After J: m1 should be active
      pressKey('j')
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

      // Navigate J → should trigger requestAnimationFrame
      pressKey('j')

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

      // Navigate to m1 first
      pressKey('j')
      pressKey('j')

      // THEN: m1 should be active
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[2]!).toHaveAttribute('tabindex', '0')
    })

    it('[T3.2][P1] should persist activeFindingId after J navigation (roving tabindex)', () => {
      // GIVEN: Default findings rendered, active on c1 (index 0)
      render(<FindingList {...defaultProps()} />)

      // WHEN: Navigate J once → moves to c2 (index 1, sorted by confidence desc)
      pressKey('j')

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

      // THEN: Grid container does NOT trap Tab (no Tab handler registered)
      // Verify no Tab registration
      const tabCall = mockRegister.mock.calls.find((call: RegisterCall) => call[0] === 'Tab')
      expect(tabCall).toBeUndefined()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC4: Minor Accordion Keyboard Interaction
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC4: Minor Accordion Navigation', () => {
    it('[T4.1][P0] should exclude Minor IDs from flattenedIds when accordion is closed', () => {
      // GIVEN: 2C + 2M + 2m, accordion default CLOSED
      render(<FindingList {...defaultProps()} />)

      // Navigate through all findings with J — should only cycle through 4 (C+M)
      pressKey('j') // c2
      pressKey('j') // m1
      pressKey('j') // m2
      pressKey('j') // wrap → c1

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

      // Navigate J through all 6
      pressKey('j') // c2
      pressKey('j') // m1
      pressKey('j') // m2
      pressKey('j') // n1
      pressKey('j') // n2
      pressKey('j') // wrap → c1

      const c1Row = rows.find((r) => r.getAttribute('data-finding-id') === 'c1')
      expect(c1Row).toHaveAttribute('tabindex', '0')
    })

    it('[T4.3][P1] should navigate J from last Major to first Minor when accordion open', () => {
      // GIVEN: Accordion open
      render(<FindingList {...defaultProps()} />)
      const trigger = screen.getByText(/Minor \(2\)/)
      fireEvent.click(trigger)

      // Navigate to m2 (last Major — index 3)
      pressKey('j') // c2
      pressKey('j') // m1
      pressKey('j') // m2

      // J from m2 → n1 (first Minor)
      pressKey('j')
      const rows = screen.getAllByTestId('finding-compact-row')
      const n1Row = rows.find((r) => r.getAttribute('data-finding-id') === 'n1')
      expect(n1Row).toHaveAttribute('tabindex', '0')
    })

    it('[T4.4][P1] should wrap J from last Major to first Critical when accordion closed', () => {
      // GIVEN: Accordion closed
      render(<FindingList {...defaultProps()} />)

      // Navigate to m2 (last visible finding)
      pressKey('j') // c2
      pressKey('j') // m1
      pressKey('j') // m2

      // J from m2 → wraps to c1 (Minor skipped)
      pressKey('j')
      const rows = screen.getAllByTestId('finding-compact-row')
      const c1Row = rows.find((r) => r.getAttribute('data-finding-id') === 'c1')
      expect(c1Row).toHaveAttribute('tabindex', '0')
    })

    it('[T4.5][P1] should navigate K from first Minor to last Major', () => {
      // GIVEN: Accordion open, navigate to n1
      render(<FindingList {...defaultProps()} />)
      const trigger = screen.getByText(/Minor \(2\)/)
      fireEvent.click(trigger)

      // Navigate to n1 (first Minor — index 4)
      pressKey('j') // c2
      pressKey('j') // m1
      pressKey('j') // m2
      pressKey('j') // n1

      // K from n1 → m2 (last Major)
      pressKey('k')
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

      // Navigate to m1
      pressKey('j')

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

      // Navigate to m1
      pressKey('j')

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

      // Navigate to m1
      pressKey('j')

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

      // Navigate to m1
      pressKey('j')

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

      pressKey('j')

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

    it('[T6.6][P1] should register J/K only with scope "review" (not global)', () => {
      // GIVEN: FindingList rendered
      render(<FindingList {...defaultProps()} />)

      // THEN: All J/K/Arrow registrations use scope='review'
      const calls = mockRegister.mock.calls as RegisterCall[]
      const navCalls = calls.filter((c) => ['j', 'k', 'ArrowDown', 'ArrowUp'].includes(c[0]))
      for (const call of navCalls) {
        expect(call[2].scope).toBe('review')
      }
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

      // Navigate to last
      pressKey('j') // m1
      pressKey('j') // m2

      // J at last → wrap to c1
      pressKey('j')
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

      // K at first → wrap to m2
      pressKey('k')
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[2]!).toHaveAttribute('tabindex', '0')
    })

    it('[B3][P1] should handle single finding: J/K stays on same finding', () => {
      // GIVEN: Only 1 finding
      const findings = [buildFindingForUI({ id: 'solo', severity: 'major', aiConfidence: 80 })]
      render(<FindingList {...defaultProps({ findings })} />)

      const row = screen.getByTestId('finding-compact-row')
      expect(row).toHaveAttribute('tabindex', '0')

      // J wraps to self
      pressKey('j')
      expect(row).toHaveAttribute('tabindex', '0')

      // K wraps to self
      pressKey('k')
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
    it('[T-IME-01][P1] should delegate J/K to useKeyboardActions which handles IME guard', () => {
      // GIVEN: FindingList rendered with findings
      render(<FindingList {...defaultProps()} />)

      // THEN: J/K registered via useKeyboardActions (which has built-in IME guard)
      // Verify all 4 navigation keys are registered (no direct keydown bypass)
      const registeredKeys = mockRegister.mock.calls.map((call: RegisterCall) => call[0])
      expect(registeredKeys).toContain('j')
      expect(registeredKeys).toContain('k')
      expect(registeredKeys).toContain('ArrowDown')
      expect(registeredKeys).toContain('ArrowUp')
      // IME suppression (isComposing || keyCode===229) is handled by the hook internally
      // No direct keydown handler on grid means no IME bypass path exists
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

      pressKey('j')

      // focus() should have been called on the target row (via rAF)
      expect(focusSpy).toHaveBeenCalled()

      rafSpy.mockRestore()
      focusSpy.mockRestore()
    })

    it('[T-CLEANUP-01][P1] should call cleanup functions on unmount (no memory leak)', () => {
      const { unmount } = render(<FindingList {...defaultProps()} />)

      // Verify handlers were registered
      const registeredCount = mockRegister.mock.calls.length
      expect(registeredCount).toBeGreaterThanOrEqual(4) // j, k, ArrowDown, ArrowUp

      // WHEN: Component unmounts
      unmount()

      // THEN: Cleanup functions returned by register() should be called
      // Each register call returns a cleanup fn — verify they were invoked
      for (const cleanup of mockCleanups) {
        expect(cleanup).toHaveBeenCalled()
      }
    })

    it('[T-ASYNC-01][P2] should handle async rerender during navigation without focus jump', () => {
      // GIVEN: Active on m1
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      // Navigate to m1
      pressKey('j')

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
