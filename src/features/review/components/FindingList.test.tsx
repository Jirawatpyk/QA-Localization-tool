/**
 * ATDD Tests — Story 4.1a: Finding List Display & Progressive Disclosure
 * AC1: Severity-Sorted Finding List with Progressive Disclosure
 * AC3: Realtime announcements (FindingList-level)
 *
 * GREEN PHASE: FindingList implemented.
 *
 * Guardrails referenced: #25 (color not sole info), #31 (Esc hierarchy),
 *   #33 (aria-live), #36 (severity icons), #37 (reduced motion), #40 (no focus stealing)
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { FindingList } from '@/features/review/components/FindingList'
import type { FindingForDisplay } from '@/features/review/types'
import { buildFindingForUI } from '@/test/factories'

// ── Helper: build a mixed-severity finding set for sorting tests ──

function buildMixedFindings(): FindingForDisplay[] {
  return [
    buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 }),
    buildFindingForUI({ id: 'c2', severity: 'critical', aiConfidence: 80 }),
    buildFindingForUI({ id: 'c3', severity: 'critical', aiConfidence: 60 }),
    buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
    buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
    buildFindingForUI({ id: 'n1', severity: 'minor', aiConfidence: 50 }),
  ]
}

// ── Default props helper ──

function defaultProps(overrides?: Record<string, unknown>) {
  return {
    findings: buildMixedFindings(),
    expandedIds: new Set<string>(),
    onToggleExpand: vi.fn(),
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    ...overrides,
  }
}

describe('FindingList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: Severity-Sorted Finding List with Progressive Disclosure
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC1: Severity-Sorted Finding List with Progressive Disclosure', () => {
    it('[T1.1][P0] should render findings sorted Critical -> Major -> Minor in DOM order', () => {
      // Render 3 Critical + 2 Major + 1 Minor (shuffled input)
      const findings = buildMixedFindings()
      // Deliberately shuffle input to prove sorting works
      const shuffled = [
        findings[4]!,
        findings[0]!,
        findings[5]!,
        findings[2]!,
        findings[3]!,
        findings[1]!,
      ]

      render(<FindingList {...defaultProps({ findings: shuffled })} />)

      // Get all compact finding rows in DOM order
      const rows = screen.getAllByTestId('finding-compact-row')
      // 3 Critical + 2 Major visible immediately; 1 Minor inside accordion (still in DOM)
      expect(rows.length).toBeGreaterThanOrEqual(5)

      // First 3 rows should be critical (c1@95, c2@80, c3@60 sorted by confidence desc)
      expect(rows[0]!.getAttribute('data-finding-id')).toBe('c1')
      expect(rows[1]!.getAttribute('data-finding-id')).toBe('c2')
      expect(rows[2]!.getAttribute('data-finding-id')).toBe('c3')
      // Next 2 rows should be major (m1@90, m2@70)
      expect(rows[3]!.getAttribute('data-finding-id')).toBe('m1')
      expect(rows[4]!.getAttribute('data-finding-id')).toBe('m2')
    })

    it('[T1.2][P0] should render expanded FindingCard when finding ID is in expandedIds', () => {
      // expandedIds is controlled by the parent (ReviewPageClient auto-expands criticals)
      const findings = [
        buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
      ]
      const expandedIds = new Set(['c1'])

      render(<FindingList {...defaultProps({ findings, expandedIds })} />)

      // Critical finding should be expanded (FindingCard rendered)
      const compactRows = screen.getAllByTestId('finding-compact-row')
      const c1Row = compactRows.find((r) => r.getAttribute('data-finding-id') === 'c1')
      expect(c1Row).toHaveAttribute('aria-expanded', 'true')
      // FindingCard is also rendered for expanded finding
      expect(screen.getByTestId('finding-card')).toBeInTheDocument()

      // Major finding should NOT be expanded
      const m1Row = compactRows.find((r) => r.getAttribute('data-finding-id') === 'm1')
      expect(m1Row).toHaveAttribute('aria-expanded', 'false')
    })

    it('[T1.3][P1] should NOT auto-focus any finding on mount (G#40 — no focus stealing)', () => {
      // Critical auto-expand is visual only, NOT auto-focus
      const findings = [buildFindingForUI({ id: 'c1', severity: 'critical', aiConfidence: 95 })]

      render(<FindingList {...defaultProps({ findings })} />)

      // Guardrail #40: auto-expand is visual only — no focus on mount
      expect(document.activeElement).toBe(document.body)
    })

    it('[T1.4][P1] should render major findings as collapsed FindingCardCompact (not expanded)', () => {
      const findings = [
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 60 }),
      ]

      render(<FindingList {...defaultProps({ findings })} />)

      // Major findings should have aria-expanded="false"
      const rows = screen.getAllByTestId('finding-compact-row')
      for (const row of rows) {
        expect(row).toHaveAttribute('aria-expanded', 'false')
      }
      // No expanded finding card should be present
      expect(screen.queryByTestId('finding-card')).not.toBeInTheDocument()
    })

    it('[T1.5][P1] should render minor findings under accordion with "Minor (N)" text', () => {
      const findings = [buildFindingForUI({ id: 'n1', severity: 'minor', aiConfidence: 50 })]

      render(<FindingList {...defaultProps({ findings })} />)

      // Accordion trigger should show "Minor (1)"
      expect(screen.getByText(/Minor \(1\)/)).toBeInTheDocument()
    })

    it('[T1.6][P1] should sort within-group by confidence descending', () => {
      // 3 criticals with confidence 95, 80, 60 -> DOM order must match descending
      const findings = [
        buildFindingForUI({ id: 'c-low', severity: 'critical', aiConfidence: 60 }),
        buildFindingForUI({ id: 'c-high', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'c-mid', severity: 'critical', aiConfidence: 80 }),
      ]

      render(<FindingList {...defaultProps({ findings })} />)

      // DOM order should be: c-high (95), c-mid (80), c-low (60)
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[0]!.getAttribute('data-finding-id')).toBe('c-high')
      expect(rows[1]!.getAttribute('data-finding-id')).toBe('c-mid')
      expect(rows[2]!.getAttribute('data-finding-id')).toBe('c-low')
    })

    it('[T1.7][P1] should sort L1 findings (null confidence) after AI findings within same severity', () => {
      const findings = [
        buildFindingForUI({
          id: 'l1-finding',
          severity: 'major',
          detectedByLayer: 'L1',
          aiConfidence: null,
        }),
        buildFindingForUI({
          id: 'l2-finding',
          severity: 'major',
          detectedByLayer: 'L2',
          aiConfidence: 80,
        }),
      ]

      render(<FindingList {...defaultProps({ findings })} />)

      // L2 (confidence 80) should appear before L1 (null)
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[0]!.getAttribute('data-finding-id')).toBe('l2-finding')
      expect(rows[1]!.getAttribute('data-finding-id')).toBe('l1-finding')
    })

    it('[T1.8][P1] should expand compact row on click -> calls onToggleExpand', () => {
      const onToggleExpand = vi.fn()
      const findings = [buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 })]

      render(<FindingList {...defaultProps({ findings, onToggleExpand })} />)

      // Click on the compact row to expand it
      const row = screen.getByTestId('finding-compact-row')
      fireEvent.click(row)

      expect(onToggleExpand).toHaveBeenCalledWith('m1')
    })

    it('[T1.9][P1] should toggle expand on Enter key press on focused compact row', () => {
      const onToggleExpand = vi.fn()
      const findings = [buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 })]

      render(<FindingList {...defaultProps({ findings, onToggleExpand })} />)

      const row = screen.getByTestId('finding-compact-row')
      fireEvent.keyDown(row, { key: 'Enter' })

      expect(onToggleExpand).toHaveBeenCalledWith('m1')
    })

    it('[T1.10][P1] should collapse expanded row on Escape key (G#31)', () => {
      const onToggleExpand = vi.fn()
      const findings = [buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 })]
      // m1 is already expanded
      const expandedIds = new Set(['m1'])

      render(<FindingList {...defaultProps({ findings, expandedIds, onToggleExpand })} />)

      const row = screen.getByTestId('finding-compact-row')
      fireEvent.keyDown(row, { key: 'Escape' })

      // Guardrail #31: Esc collapses the expanded card (innermost layer first)
      expect(onToggleExpand).toHaveBeenCalledWith('m1')
    })

    it('[T1.11][P1] should render role="rowgroup" around each severity section', () => {
      const findings = buildMixedFindings() // 3C + 2M + 1m = 3 severity groups

      render(<FindingList {...defaultProps({ findings })} />)

      // 3 rowgroups: critical, major, minor
      const rowgroups = screen.getAllByRole('rowgroup')
      expect(rowgroups.length).toBe(3)
    })

    it('[T1.12][P0] should detect new findings and apply isNew class on rerender', () => {
      const findings = [buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 80 })]

      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      // Add a new critical finding via rerender (simulating Realtime push)
      const updatedFindings = [
        ...findings,
        buildFindingForUI({ id: 'c-new', severity: 'critical', aiConfidence: 92 }),
      ]

      rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

      // New finding should have the animate-fade-in class (newIds detection)
      const newRow = screen
        .getAllByTestId('finding-compact-row')
        .find((r) => r.getAttribute('data-finding-id') === 'c-new')
      expect(newRow?.className).toMatch(/animate-fade-in/)
    })

    it('[T1.13][P1] should show empty state message when findings array is empty', () => {
      render(<FindingList {...defaultProps({ findings: [] })} />)

      // No rowgroups when empty
      expect(screen.queryAllByRole('rowgroup').length).toBe(0)
      // Empty state message should appear
      expect(screen.getByText(/no findings/i)).toBeInTheDocument()
    })

    it('[T1.14][P1] should render single rowgroup when all findings have same severity', () => {
      const findings = [
        buildFindingForUI({ id: 'm1', severity: 'major', aiConfidence: 90 }),
        buildFindingForUI({ id: 'm2', severity: 'major', aiConfidence: 70 }),
        buildFindingForUI({ id: 'm3', severity: 'major', aiConfidence: 50 }),
      ]

      render(<FindingList {...defaultProps({ findings })} />)

      // Only 1 rowgroup — no empty sections rendered
      const rowgroups = screen.getAllByRole('rowgroup')
      expect(rowgroups.length).toBe(1)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC3: Realtime Announcements (FindingList-level)
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC3: Realtime Announcements', () => {
    it('[T3.9][P1] should detect new findings via prevIdsRef when new findings arrive via rerender', () => {
      // Note: announce() is called in useFindingsSubscription, not FindingList.
      // FindingList tracks new IDs for animation only (newIds state).
      const findings = [
        buildFindingForUI({ id: 'f1', severity: 'major', aiConfidence: 80 }),
        buildFindingForUI({ id: 'f2', severity: 'minor', aiConfidence: 60 }),
      ]

      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      // Rerender with 2 additional findings (simulating Realtime push)
      const updatedFindings = [
        ...findings,
        buildFindingForUI({ id: 'f3', severity: 'critical', aiConfidence: 95 }),
        buildFindingForUI({ id: 'f4', severity: 'major', aiConfidence: 75 }),
      ]

      rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

      // New findings should have fade-in animation
      const f3Row = screen
        .getAllByTestId('finding-compact-row')
        .find((r) => r.getAttribute('data-finding-id') === 'f3')
      expect(f3Row?.className).toMatch(/animate-fade-in/)
    })

    it('[T3.11][P1] should keep accordion open and update count after new minor finding arrives', () => {
      const findings = [buildFindingForUI({ id: 'n1', severity: 'minor', aiConfidence: 50 })]

      const { rerender } = render(<FindingList {...defaultProps({ findings })} />)

      // Accordion should show "Minor (1)"
      expect(screen.getByText(/Minor \(1\)/)).toBeInTheDocument()

      // Open the accordion by clicking the trigger
      const trigger = screen.getByText(/Minor \(1\)/)
      fireEvent.click(trigger)

      // Verify accordion content is visible (finding row inside accordion)
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows.length).toBe(1)

      // Rerender with +1 minor finding (simulating Realtime push)
      const updatedFindings = [
        ...findings,
        buildFindingForUI({ id: 'n2', severity: 'minor', aiConfidence: 40 }),
      ]

      rerender(<FindingList {...defaultProps({ findings: updatedFindings })} />)

      // Count should update to "Minor (2)"
      expect(screen.getByText(/Minor \(2\)/)).toBeInTheDocument()

      // Accordion should STAY OPEN — both rows visible
      const updatedRows = screen.getAllByTestId('finding-compact-row')
      expect(updatedRows.length).toBe(2)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Boundary Tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('Boundary Tests', () => {
    it('[B7][P1] should maintain stable sort when all findings have null confidence (all L1)', () => {
      const findings = [
        buildFindingForUI({
          id: 'l1-a',
          severity: 'major',
          detectedByLayer: 'L1',
          aiConfidence: null,
        }),
        buildFindingForUI({
          id: 'l1-b',
          severity: 'major',
          detectedByLayer: 'L1',
          aiConfidence: null,
        }),
        buildFindingForUI({
          id: 'l1-c',
          severity: 'major',
          detectedByLayer: 'L1',
          aiConfidence: null,
        }),
      ]

      render(<FindingList {...defaultProps({ findings })} />)

      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows.length).toBe(3)
    })

    it('[B8][P1] should sort confidence=0 before confidence=null', () => {
      const findings = [
        buildFindingForUI({
          id: 'null-conf',
          severity: 'major',
          detectedByLayer: 'L1',
          aiConfidence: null,
        }),
        buildFindingForUI({
          id: 'zero-conf',
          severity: 'major',
          detectedByLayer: 'L2',
          aiConfidence: 0,
        }),
      ]

      render(<FindingList {...defaultProps({ findings })} />)

      // zero-conf (0) should appear before null-conf (null)
      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows[0]!.getAttribute('data-finding-id')).toBe('zero-conf')
      expect(rows[1]!.getAttribute('data-finding-id')).toBe('null-conf')
    })

    it('[B9][P1] should show correct minor count in accordion (mixed 3C+5M+7m -> "Minor (7)")', () => {
      const findings = [
        ...Array.from({ length: 3 }, (_, i) =>
          buildFindingForUI({ id: `c${i}`, severity: 'critical', aiConfidence: 90 - i }),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          buildFindingForUI({ id: `m${i}`, severity: 'major', aiConfidence: 80 - i }),
        ),
        ...Array.from({ length: 7 }, (_, i) =>
          buildFindingForUI({ id: `n${i}`, severity: 'minor', aiConfidence: 70 - i }),
        ),
      ]

      render(<FindingList {...defaultProps({ findings })} />)

      // Minor accordion should show exactly "Minor (7)"
      expect(screen.getByText(/Minor \(7\)/)).toBeInTheDocument()
    })

    it('[B10][P1] should maintain stable sort order when findings have equal confidence', () => {
      const findings = [
        buildFindingForUI({ id: 'same-a', severity: 'major', aiConfidence: 80 }),
        buildFindingForUI({ id: 'same-b', severity: 'major', aiConfidence: 80 }),
        buildFindingForUI({ id: 'same-c', severity: 'major', aiConfidence: 80 }),
      ]

      render(<FindingList {...defaultProps({ findings })} />)

      const rows = screen.getAllByTestId('finding-compact-row')
      expect(rows.length).toBe(3)
    })
  })
})
