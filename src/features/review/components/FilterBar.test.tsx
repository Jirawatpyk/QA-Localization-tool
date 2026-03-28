/**
 * Story 4.5 ATDD: FilterBar — Filter toolbar UI, badge chips, empty state, keyboard
 * Adapted from ATDD stubs — preserved scenario intent + assertion count.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'

import { FilterBar } from '@/features/review/components/FilterBar'
import { useReviewStore, getStoreFileState } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import { buildFindingForUI } from '@/test/factories'

// ── Helpers ──

function buildFindings(): FindingForDisplay[] {
  return [
    buildFindingForUI({
      id: 'f1',
      severity: 'critical',
      detectedByLayer: 'L1',
      status: 'pending',
      category: 'accuracy',
      aiConfidence: 95,
    }),
    buildFindingForUI({
      id: 'f2',
      severity: 'major',
      detectedByLayer: 'L2',
      status: 'pending',
      category: 'terminology',
      aiConfidence: 80,
    }),
    buildFindingForUI({
      id: 'f3',
      severity: 'major',
      detectedByLayer: 'L2',
      status: 'accepted',
      category: 'accuracy',
      aiConfidence: 60,
    }),
    buildFindingForUI({
      id: 'f4',
      severity: 'minor',
      detectedByLayer: 'L1',
      status: 'rejected',
      category: 'style',
      aiConfidence: null,
    }),
  ]
}

function renderFilterBar(findings?: FindingForDisplay[], filteredCount?: number) {
  const f = findings ?? buildFindings()
  return render(<FilterBar findings={f} filteredCount={filteredCount ?? f.length} />)
}

// ── Tests ──

describe('FilterBar', () => {
  beforeEach(() => {
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('test-file')
  })

  // ── Rendering (AC1) ──

  describe('Rendering (AC1)', () => {
    it('should render with role="toolbar" and aria-label="Filter findings"', () => {
      renderFilterBar()
      expect(screen.getByRole('toolbar', { name: 'Filter findings' })).toBeInTheDocument()
    })

    it('should render severity filter buttons: All, Critical, Major, Minor', () => {
      renderFilterBar()
      const toolbar = screen.getByRole('toolbar')
      expect(within(toolbar).getByTestId('filter-severity-all')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-severity-critical')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-severity-major')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-severity-minor')).toBeInTheDocument()
    })

    it('should render layer filter buttons: All, Rule-based, AI', () => {
      renderFilterBar()
      const toolbar = screen.getByRole('toolbar')
      expect(within(toolbar).getByTestId('filter-layer-all')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-layer-l1')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-layer-l2')).toBeInTheDocument()
    })

    it('should render status filter buttons: All, Pending, Accepted, Rejected, Flagged', () => {
      renderFilterBar()
      const toolbar = screen.getByRole('toolbar')
      expect(within(toolbar).getByTestId('filter-status-all')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-status-pending')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-status-accepted')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-status-rejected')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-status-flagged')).toBeInTheDocument()
    })

    it('should render dynamic category options from findings data', () => {
      renderFilterBar()
      const toolbar = screen.getByRole('toolbar')
      // Categories from test data: accuracy, terminology, style (sorted)
      expect(within(toolbar).getByTestId('filter-category-accuracy')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-category-style')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-category-terminology')).toBeInTheDocument()
    })

    it('should render confidence filter buttons: All, High, Medium, Low', () => {
      renderFilterBar()
      const toolbar = screen.getByRole('toolbar')
      expect(within(toolbar).getByTestId('filter-confidence-all')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-confidence-high')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-confidence-medium')).toBeInTheDocument()
      expect(within(toolbar).getByTestId('filter-confidence-low')).toBeInTheDocument()
    })

    it('should default status filter to Pending', () => {
      renderFilterBar()
      const pendingBtn = screen.getByTestId('filter-status-pending')
      expect(pendingBtn).toHaveAttribute('aria-pressed', 'true')
    })
  })

  // ── Filter interaction (AC2) ──

  describe('Filter interaction (AC2)', () => {
    it('should show active badge chip when severity filter selected', async () => {
      renderFilterBar()
      const user = userEvent.setup()
      await user.click(screen.getByTestId('filter-severity-critical'))
      expect(screen.getByTestId('filter-chip-severity-critical')).toBeInTheDocument()
    })

    it('should show multiple badge chips for multiple active filters', async () => {
      renderFilterBar()
      const user = userEvent.setup()
      await user.click(screen.getByTestId('filter-severity-critical'))
      await user.click(screen.getByTestId('filter-confidence-high'))
      expect(screen.getByTestId('filter-chip-severity-critical')).toBeInTheDocument()
      expect(screen.getByTestId('filter-chip-confidence-high')).toBeInTheDocument()
    })

    it('should remove filter when badge chip X button clicked', async () => {
      renderFilterBar()
      const user = userEvent.setup()
      await user.click(screen.getByTestId('filter-severity-critical'))
      expect(screen.getByTestId('filter-chip-severity-critical')).toBeInTheDocument()

      // Click X on the chip
      const chip = screen.getByTestId('filter-chip-severity-critical')
      const removeBtn = within(chip).getByTestId('filter-chip-remove')
      await user.click(removeBtn)

      expect(screen.queryByTestId('filter-chip-severity-critical')).not.toBeInTheDocument()
    })

    it('should show "Clear all" link when any filter active', async () => {
      renderFilterBar()
      const user = userEvent.setup()
      // No non-default filters initially
      expect(screen.queryByTestId('filter-clear-all')).not.toBeInTheDocument()

      await user.click(screen.getByTestId('filter-severity-critical'))
      expect(screen.getByTestId('filter-clear-all')).toBeInTheDocument()
    })

    it('should clear all filters when "Clear all" clicked', async () => {
      renderFilterBar()
      const user = userEvent.setup()
      await user.click(screen.getByTestId('filter-severity-critical'))
      await user.click(screen.getByTestId('filter-confidence-high'))

      await user.click(screen.getByTestId('filter-clear-all'))

      // All severity buttons → All is active (none pressed), no chips
      expect(screen.queryByTestId('filter-chip-severity-critical')).not.toBeInTheDocument()
      expect(screen.queryByTestId('filter-chip-confidence-high')).not.toBeInTheDocument()
      expect(screen.queryByTestId('filter-clear-all')).not.toBeInTheDocument()
    })

    it('should update "Showing X of Y findings" count on filter change', () => {
      renderFilterBar(buildFindings(), 2)
      expect(screen.getByTestId('filter-count')).toHaveTextContent('Showing 2 of 4 findings')
    })
  })

  // ── Per-button match counts (AC9) ──

  describe('Per-button match counts (AC9)', () => {
    it('should show per-button aria-label with match count', () => {
      renderFilterBar()
      const criticalBtn = screen.getByTestId('filter-severity-critical')
      expect(criticalBtn).toHaveAttribute('aria-label', expect.stringContaining('findings match'))
    })

    it('should compute match counts accurately', () => {
      renderFilterBar()
      // 1 critical, 2 major, 1 minor in test data
      const criticalBtn = screen.getByTestId('filter-severity-critical')
      expect(criticalBtn.getAttribute('aria-label')).toContain('1 of 4')
    })

    it('should update match counts when findings data changes', () => {
      const { rerender } = render(<FilterBar findings={buildFindings()} filteredCount={4} />)
      const criticalBefore = screen
        .getByTestId('filter-severity-critical')
        .getAttribute('aria-label')

      // Add more critical findings
      const moreFindings = [
        ...buildFindings(),
        buildFindingForUI({
          id: 'f5',
          severity: 'critical',
          status: 'pending',
          category: 'accuracy',
          aiConfidence: 90,
          detectedByLayer: 'L1',
        }),
      ]
      rerender(<FilterBar findings={moreFindings} filteredCount={5} />)

      const criticalAfter = screen
        .getByTestId('filter-severity-critical')
        .getAttribute('aria-label')
      expect(criticalBefore).not.toBe(criticalAfter)
    })
  })

  // ── Empty state ──

  describe('Empty state', () => {
    it('should show "No findings match your filters" when filtered count is 0', () => {
      renderFilterBar(buildFindings(), 0)
      expect(screen.getByTestId('filter-empty-state')).toBeInTheDocument()
      expect(screen.getByText(/no findings match your filters/i)).toBeInTheDocument()
    })

    it('should show Clear Filters link in empty state', () => {
      renderFilterBar(buildFindings(), 0)
      const emptyState = screen.getByTestId('filter-empty-state')
      expect(within(emptyState).getByText(/clear filters/i)).toBeInTheDocument()
    })
  })

  // ── Keyboard navigation (AC9) ──

  describe('Keyboard navigation (AC9)', () => {
    it('should navigate filter buttons via Tab', async () => {
      renderFilterBar()
      const user = userEvent.setup()
      const firstBtn = screen.getByTestId('filter-severity-all')
      firstBtn.focus()
      await user.tab()
      // Focus should move to next button
      expect(document.activeElement).not.toBe(firstBtn)
    })

    it('should toggle filter via Enter/Space', async () => {
      renderFilterBar()
      const user = userEvent.setup()
      const criticalBtn = screen.getByTestId('filter-severity-critical')
      criticalBtn.focus()
      await user.keyboard('{Enter}')
      expect(getStoreFileState().filterState.severity).toBe('critical')
    })

    it('should have accessible badge chip remove button with aria-label', async () => {
      renderFilterBar()
      const user = userEvent.setup()
      await user.click(screen.getByTestId('filter-severity-critical'))
      const chip = screen.getByTestId('filter-chip-severity-critical')
      const removeBtn = within(chip).getByTestId('filter-chip-remove')
      expect(removeBtn).toHaveAttribute('aria-label', expect.stringContaining('Remove'))
    })
  })
})
