/**
 * ATDD Tests — Story 4.1b: Keyboard Navigation & Focus Management
 *
 * RED PHASE: All tests use `it.skip()` — feature not implemented yet.
 * Dev removes `it.skip()` and makes tests pass during implementation.
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
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { FindingList } from '@/features/review/components/FindingList'
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

const mockRegister = vi.fn(() => vi.fn()) // returns cleanup fn
const mockUnregister = vi.fn()

vi.mock('@/features/review/hooks/use-keyboard-actions', () => ({
  useKeyboardActions: () => ({
    register: mockRegister,
    unregister: mockUnregister,
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

// ── Mock useReducedMotion ──

let mockReducedMotion = false
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReducedMotion,
}))

describe('FindingList — Keyboard Navigation (Story 4.1b)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion = false
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: J/K/Arrow Navigation with Roving Tabindex
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC1: J/K/Arrow Navigation', () => {
    it.skip('[T1.1][P0] should register J handler that moves activeIndex forward', () => {
      // GIVEN: FindingList rendered with 6 findings (2C + 2M + 2m)
      render(<FindingList {...defaultProps()} />)

      // WHEN: J handler is registered via useKeyboardActions
      // THEN: register called with 'j' key and scope 'review'
      expect(mockRegister).toHaveBeenCalledWith(
        'j',
        expect.any(Function),
        expect.objectContaining({ scope: 'review' }),
      )

      // WHEN: J handler is invoked
      const jCall = mockRegister.mock.calls.find((call: unknown[]) => call[0] === 'j')
      expect(jCall).toBeDefined()
      // After J: active row should move from index 0 to index 1
      // Verified via tabIndex="0" on second row
    })

    it.skip('[T1.2][P0] should register K handler that moves activeIndex backward', () => {
      render(<FindingList {...defaultProps()} />)

      expect(mockRegister).toHaveBeenCalledWith(
        'k',
        expect.any(Function),
        expect.objectContaining({ scope: 'review' }),
      )
    })

    it.skip('[T1.3][P1] should register ArrowDown handler same as J', () => {
      render(<FindingList {...defaultProps()} />)

      expect(mockRegister).toHaveBeenCalledWith(
        'ArrowDown',
        expect.any(Function),
        expect.objectContaining({ scope: 'review' }),
      )
    })

    it.skip('[T1.4][P1] should register ArrowUp handler same as K', () => {
      render(<FindingList {...defaultProps()} />)

      expect(mockRegister).toHaveBeenCalledWith(
        'ArrowUp',
        expect.any(Function),
        expect.objectContaining({ scope: 'review' }),
      )
    })

    it.skip('[T1.5][P0] should navigate across severity groups (Critical → Major → Minor)', () => {
      // GIVEN: 6 findings across 3 severity groups, Minor accordion OPEN
      render(<FindingList {...defaultProps()} />)

      // Open Minor accordion first
      const accordionTrigger = screen.getByText(/Minor \(2\)/)
      fireEvent.click(accordionTrigger)

      const rows = screen.getAllByTestId('finding-compact-row')
      // flattenedIds should be: [c1, c2, m1, m2, n1, n2]
      expect(rows.length).toBe(6)

      // WHEN: Navigate J from c1 through all findings
      // THEN: tabIndex="0" moves through c1→c2→m1→m2→n1→n2 in order
      // First row (c1) should be initially active
      expect(rows[0]!).toHaveAttribute('tabindex', '0')
    })

    it.skip('[T1.6][P1] should wrap J on last finding to first finding', () => {
      // GIVEN: 4 findings (no Minor), active on last finding (m2)
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      // WHEN: Navigate J until past last finding
      // THEN: Active wraps to first finding (c1)
      // Verify via tabIndex="0" on c1 row after wrap
    })

    it.skip('[T1.7][P1] should wrap K on first finding to last finding', () => {
      // GIVEN: 3 findings, active on first finding (c1)
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      // WHEN: K handler invoked at activeIndex=0
      // THEN: Active wraps to last finding (m2)
    })

    it.skip('[T1.8][P1] should suppress J/K in input elements (G#28)', () => {
      render(<FindingList {...defaultProps()} />)

      // THEN: register calls should specify allowInInput: false (default)
      const jCall = mockRegister.mock.calls.find((call: unknown[]) => call[0] === 'j')
      expect(jCall).toBeDefined()
      // allowInInput should be false (default in useKeyboardActions)
    })

    it.skip('[T1.9][P1] should auto-collapse expanded finding before J moves (DD#11)', () => {
      // GIVEN: c1 is expanded, active on c1
      const onToggleExpand = vi.fn()
      const expandedIds = new Set(['c1'])
      render(<FindingList {...defaultProps({ expandedIds, onToggleExpand })} />)

      // WHEN: J handler invoked (navigateNext)
      // THEN: onToggleExpand('c1') called first (auto-collapse)
      // THEN: activeIndex advances to next
    })

    it.skip('[T1.10][P1] should compute flattenedIds from severity groups', () => {
      // GIVEN: 2C + 2M + 2m findings, Minor accordion closed
      render(<FindingList {...defaultProps()} />)

      // THEN: flattenedIds = [c1, c2, m1, m2] (excludes Minor when closed)
      const rows = screen.getAllByTestId('finding-compact-row')
      // Only Critical + Major visible (Minor inside closed accordion)
      expect(rows.filter((r) => r.getAttribute('tabindex') !== null).length).toBeGreaterThanOrEqual(
        4,
      )
    })

    it.skip('[T1.11][P0] should update tabindex via roving tabindex after J navigation', () => {
      // GIVEN: 3 findings, initially active on first
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      // WHEN: After J, activeIndex = 1 (m1)
      // THEN: c1 tabIndex=-1, m1 tabIndex=0, m2 tabIndex=-1
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[0]!).toHaveAttribute('tabindex', '0') // initially c1 active
      expect(rows[1]!).toHaveAttribute('tabindex', '-1')
      expect(rows[2]!).toHaveAttribute('tabindex', '-1')
    })

    it.skip('[T1.12][P2] should call DOM focus() via requestAnimationFrame after navigation', () => {
      // GIVEN: FindingList rendered
      render(<FindingList {...defaultProps()} />)

      // WHEN: J handler invoked
      // THEN: requestAnimationFrame called
      // AND: target row element.focus() called
      // (Requires spy on requestAnimationFrame and document.querySelector)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC2: Enter/Esc Expand/Collapse (additive tests — 4.1a covers per-row)
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC2: Enter/Esc Expand/Collapse (additive)', () => {
    it.skip('[T2.3][P1] should NOT bubble Esc when finding is collapsed (no action)', () => {
      // GIVEN: Finding is NOT expanded, active row focused
      const onToggleExpand = vi.fn()
      const findings = [buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 })]
      render(<FindingList {...defaultProps({ findings, onToggleExpand })} />)

      // WHEN: Esc key pressed on collapsed row
      const row = screen.getByTestId('finding-compact-row')
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      const stopPropSpy = vi.spyOn(event, 'stopPropagation')
      row.dispatchEvent(event)

      // THEN: onToggleExpand NOT called (already collapsed)
      expect(onToggleExpand).not.toHaveBeenCalled()
    })

    it.skip('[T2.4][P1] should keep focus on same row after expand/collapse via Enter', () => {
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

      // THEN: activeFindingId stays 'c1', activeIndex stays 0
      // Focus should remain on c1 row (tabIndex=0 unchanged)
      expect(row).toHaveAttribute('tabindex', '0')
    })

    it.skip('[T2.5][P1] should push/pop escape layer for expanded cards', () => {
      // GIVEN: FindingList with c1 expanded
      const expandedIds = new Set(['c1'])
      render(<FindingList {...defaultProps({ expandedIds })} />)

      // THEN: pushEscapeLayer('expanded', ...) should have been called
      // (Requires mock of useFocusManagement)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC3: Tab Order — Grid Entry/Exit
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC3: Tab Order', () => {
    it.skip('[T3.1][P1] should focus activeIndex row when Tab enters grid', () => {
      // GIVEN: FindingList rendered, activeIndex=2 (from previous navigation)
      render(<FindingList {...defaultProps()} />)

      // WHEN: User Tabs into the grid container (onFocus event)
      // THEN: Row at activeIndex=2 receives focus
    })

    it.skip('[T3.2][P1] should restore previously active row on Shift+Tab re-entry', () => {
      // GIVEN: User navigated to m1, then Tabbed out
      render(<FindingList {...defaultProps()} />)

      // WHEN: User Shift+Tabs back into grid
      // THEN: Focus returns to m1 (activeFindingId persisted)
    })

    it.skip('[T3.3][P0] should NOT auto-focus grid on mount (G#40) — verify unchanged', () => {
      // GIVEN: Fresh render
      render(<FindingList {...defaultProps()} />)

      // THEN: No element inside FindingList is focused
      // document.activeElement === document.body
      expect(document.activeElement).toBe(document.body)
    })

    it.skip('[T3.4][P2] should let Tab exit grid to next landmark (native behavior)', () => {
      // GIVEN: FindingList rendered
      render(<FindingList {...defaultProps()} />)

      // WHEN: Tab pressed on last focusable element in grid
      // THEN: Focus moves out (native Tab behavior, no preventDefault)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC4: Minor Accordion Keyboard Interaction
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC4: Minor Accordion Navigation', () => {
    it.skip('[T4.1][P0] should exclude Minor IDs from flattenedIds when accordion is closed', () => {
      // GIVEN: 2C + 2M + 2m, accordion default CLOSED
      render(<FindingList {...defaultProps()} />)

      // THEN: Only 4 rows should participate in J/K navigation (c1, c2, m1, m2)
      // Minor findings are in DOM but NOT in flattenedIds
      const rows = screen.getAllByTestId('finding-compact-row')
      // Rows with tabindex: only Critical + Major have navigation tabindex
      const navigableRows = rows.filter((r) => {
        const tabindex = r.getAttribute('tabindex')
        return tabindex === '0' || tabindex === '-1'
      })
      // Should be 4 (2C + 2M), not 6
      expect(navigableRows.length).toBe(4)
    })

    it.skip('[T4.2][P0] should include Minor IDs in flattenedIds when accordion is open', () => {
      // GIVEN: 2C + 2M + 2m
      render(<FindingList {...defaultProps()} />)

      // WHEN: Open Minor accordion
      const trigger = screen.getByText(/Minor \(2\)/)
      fireEvent.click(trigger)

      // THEN: All 6 rows participate in J/K navigation
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows.length).toBe(6)
    })

    it.skip('[T4.3][P1] should navigate J from last Major to first Minor when accordion open', () => {
      // GIVEN: Accordion open, active on m2 (last Major)
      render(<FindingList {...defaultProps()} />)
      const trigger = screen.getByText(/Minor \(2\)/)
      fireEvent.click(trigger)

      // WHEN: J pressed on m2
      // THEN: Active moves to n1 (first Minor)
    })

    it.skip('[T4.4][P1] should wrap J from last Major to first Critical when accordion closed', () => {
      // GIVEN: Accordion closed, active on m2 (last visible finding)
      render(<FindingList {...defaultProps()} />)

      // WHEN: J pressed on m2
      // THEN: Active wraps to c1 (first Critical) — Minor skipped
    })

    it.skip('[T4.5][P1] should navigate K from first Minor to last Major', () => {
      // GIVEN: Accordion open, active on n1 (first Minor)
      render(<FindingList {...defaultProps()} />)
      const trigger = screen.getByText(/Minor \(2\)/)
      fireEvent.click(trigger)

      // WHEN: K pressed on n1
      // THEN: Active moves to m2 (last Major)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC5: Focus Stability on Realtime Updates
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC5: Focus Stability', () => {
    it.skip('[T5.1][P0] should retain focus on same finding ID when new finding inserted above', () => {
      // GIVEN: Active on m1 (activeFindingId='m1')
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
      ]
      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

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

    it.skip('[T5.2][P0] should recalculate activeIndex from activeFindingId on list change', () => {
      // GIVEN: Active on m1 at index 1 (flattenedIds = [c1, m1])
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
      ]
      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      // Navigate to m1 (index=1)
      // WHEN: New finding inserted → m1 moves to index 2
      const updatedFindings = [
        buildFindingForUI({ id: 'c-new', severity: 'critical', aiConfidence: 99 }),
        ...findings,
      ]
      rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

      // THEN: activeIndex recalculated to 2 (m1's new position)
      // m1 row should still have tabIndex=0
    })

    it.skip('[T5.3][P1] should advance to nearest when focused finding is removed', () => {
      // GIVEN: Active on m1 (activeFindingId='m1')
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      // WHEN: m1 is removed from findings (Realtime deletion)
      const updatedFindings = findings.filter((f) => f.id !== 'm1')
      rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

      // THEN: activeFindingId changes to nearest available finding
      // Either c1 or m2 should now have tabIndex=0
    })

    it.skip('[T5.4][P1] should NOT reset activeIndex to 0 when findings count changes', () => {
      // GIVEN: Active on m1 (index 1)
      // The existing reset-to-0 logic (lines 110-114 in FindingList.tsx) must be REMOVED
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
      ]
      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

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
    it.skip('[T6.1][P0] should render aria-label with "Finding N of M, severity, category, status"', () => {
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

      // THEN: First row has aria-label "Finding 1 of 3, critical severity, accuracy, pending"
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[0]!).toHaveAttribute('aria-label', expect.stringContaining('Finding 1 of'))
      expect(rows[0]!).toHaveAttribute('aria-label', expect.stringContaining('critical'))
    })

    it.skip('[T6.2][P1] should set aria-rowindex on each row', () => {
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

    it.skip('[T6.3][P1] should set aria-rowcount on grid container', () => {
      // GIVEN: 6 findings
      render(<FindingList {...defaultProps()} />)

      // THEN: Grid container has aria-rowcount=6
      // (Grid container may be on FindingList root or ReviewPageClient wrapper)
    })

    it.skip('[T6.4][P1] should use instant scroll when prefers-reduced-motion is active (G#37)', () => {
      // GIVEN: User prefers reduced motion
      mockReducedMotion = true
      render(<FindingList {...defaultProps()} />)

      // WHEN: J handler triggers scroll to focused row
      // THEN: scrollIntoView called with { behavior: 'instant' }
      // (Requires spy on HTMLElement.scrollIntoView or focus() behavior)
    })

    it.skip('[T6.5][P2] should verify rowgroup aria-label unchanged from 4.1a', () => {
      // GIVEN: Findings spanning 3 severity groups
      render(<FindingList {...defaultProps()} />)

      // THEN: rowgroups have correct labels (verified in 4.1a — confirm unchanged)
      const rowgroups = screen.getAllByRole('rowgroup')
      expect(rowgroups[0]!).toHaveAttribute('aria-label', 'Critical findings')
      expect(rowgroups[1]!).toHaveAttribute('aria-label', 'Major findings')
      expect(rowgroups[2]!).toHaveAttribute('aria-label', 'Minor findings')
    })

    it.skip('[T6.6][P1] should register J/K only with scope "review" (not global)', () => {
      // GIVEN: FindingList rendered
      render(<FindingList {...defaultProps()} />)

      // THEN: All J/K/Arrow registrations use scope='review'
      const calls = mockRegister.mock.calls
      const navCalls = calls.filter((c: unknown[]) =>
        ['j', 'k', 'ArrowDown', 'ArrowUp'].includes(c[0] as string),
      )
      for (const call of navCalls) {
        expect(((call as unknown[])[2] as Record<string, unknown>).scope).toBe('review')
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Boundary Value Tests (MANDATORY — Epic 2 Retro A2)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Boundary Tests', () => {
    it.skip('[B1][P1] should wrap J on last finding (idx=length-1) to first (idx=0)', () => {
      // GIVEN: 3 findings, active on last (m2 at index 2)
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      // WHEN: J at index 2 (last)
      // THEN: wrap to index 0 (c1)
    })

    it.skip('[B2][P1] should wrap K on first finding (idx=0) to last (idx=length-1)', () => {
      // GIVEN: 3 findings, active on first (c1 at index 0)
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
      ]
      render(<FindingList {...defaultProps({ findings })} />)

      // WHEN: K at index 0
      // THEN: wrap to index 2 (m2)
    })

    it.skip('[B3][P1] should handle single finding: J/K stays on same finding', () => {
      // GIVEN: Only 1 finding
      const findings = [buildFindingForUI({ id: 'solo', severity: 'major', aiConfidence: 80 })]
      render(<FindingList {...defaultProps({ findings })} />)

      // WHEN: J or K pressed
      // THEN: Active stays on 'solo' (wrap to self at length=1)
      const row = screen.getByTestId('finding-compact-row')
      expect(row).toHaveAttribute('tabindex', '0')
    })

    it.skip('[B4][P1] should handle empty list: no navigation, no crash', () => {
      // GIVEN: 0 findings
      render(<FindingList {...defaultProps({ findings: [] })} />)

      // THEN: No crash, empty state rendered, no J/K handlers registered
      expect(screen.getByText(/no findings/i)).toBeInTheDocument()
    })

    it.skip('[B5][P1] should handle focused finding removed from empty result', () => {
      // GIVEN: 1 finding active
      const findings = [buildFindingForUI({ id: 'solo', severity: 'major', aiConfidence: 80 })]
      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      // WHEN: Finding removed → empty list
      rerender(<FindingList {...defaultProps({ findings: [] })} />)

      // THEN: Renders empty state, activeFindingId=null, no crash
      expect(screen.getByText(/no findings/i)).toBeInTheDocument()
    })

    it.skip('[B6][P1] should render "Finding 1 of 1" aria-label for single finding', () => {
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
})
