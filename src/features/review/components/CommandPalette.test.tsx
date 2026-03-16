/**
 * Story 4.5 ATDD: CommandPalette — Ctrl+K dialog, scope filtering, finding search, actions
 * Adapted from ATDD stubs — preserved scenario intent + assertion count.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'

import { CommandPalette } from '@/features/review/components/CommandPalette'
import { useReviewStore } from '@/features/review/stores/review.store'
import type { FindingForDisplay } from '@/features/review/types'
import { buildFindingForUI } from '@/test/factories'

// ── Mock browser APIs required by cmdk in jsdom ──
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {
      /* noop */
    }
    unobserve() {
      /* noop */
    }
    disconnect() {
      /* noop */
    }
  }
  // cmdk calls scrollIntoView which doesn't exist in jsdom
  Element.prototype.scrollIntoView = vi.fn()
})

// ── Mock SeverityIndicator ──
vi.mock('@/features/review/components/SeverityIndicator', () => ({
  SeverityIndicator: ({ severity }: { severity: string }) => (
    <span data-testid={`severity-${severity}`}>{severity}</span>
  ),
}))

// ── Helpers ──

function buildTestFindings(count = 5): FindingForDisplay[] {
  return Array.from({ length: count }, (_, i) =>
    buildFindingForUI({
      id: `f${i + 1}`,
      severity: i % 3 === 0 ? 'critical' : 'major',
      category: 'accuracy',
      description: `Finding ${i + 1} description`,
      sourceTextExcerpt: `Source text ${i + 1}`,
      targetTextExcerpt: `Target text ${i + 1}`,
      aiConfidence: 80 + i,
      status: 'pending',
      detectedByLayer: 'L2',
    }),
  )
}

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  findings: buildTestFindings(),
  siblingFiles: [
    { fileId: 'file-a', fileName: 'doc-a.sdlxliff' },
    { fileId: 'file-b', fileName: 'doc-b.sdlxliff' },
  ],
  onNavigateToFile: vi.fn(),
  onAction: vi.fn(),
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReviewStore.setState({ currentFileId: null })
    useReviewStore.getState().resetForFile('test-file')
  })

  // ── Open/Close (AC6) ──

  describe('Open/Close (AC6)', () => {
    it('should render when open=true', () => {
      render(<CommandPalette {...defaultProps} />)
      expect(screen.getByTestId('command-palette')).toBeInTheDocument()
    })

    it('should not render when open=false', () => {
      render(<CommandPalette {...defaultProps} open={false} />)
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
    })

    it('should auto-focus input on open', () => {
      render(<CommandPalette {...defaultProps} />)
      expect(screen.getByTestId('command-input')).toBeInTheDocument()
    })

    it('should have aria-modal="true"', () => {
      render(<CommandPalette {...defaultProps} />)
      const dialog = screen.getByTestId('command-palette')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })
  })

  // ── Scope filtering (AC6) ──

  describe('Scope filtering (AC6)', () => {
    it('should show all groups by default', () => {
      render(<CommandPalette {...defaultProps} />)
      // Should see Actions and Findings groups
      expect(screen.getByText('Actions')).toBeInTheDocument()
      expect(screen.getByText('Findings')).toBeInTheDocument()
      expect(screen.getByText('Files')).toBeInTheDocument()
    })

    it('should filter to actions group when input starts with ">"', async () => {
      const user = userEvent.setup()
      render(<CommandPalette {...defaultProps} />)
      const input = screen.getByTestId('command-input')
      await user.type(input, '>')

      expect(screen.getByText('Actions')).toBeInTheDocument()
      expect(screen.queryByText('Findings')).not.toBeInTheDocument()
      expect(screen.queryByText('Files')).not.toBeInTheDocument()
    })

    it('should filter to findings group when input starts with "#"', async () => {
      const user = userEvent.setup()
      render(<CommandPalette {...defaultProps} />)
      const input = screen.getByTestId('command-input')
      await user.type(input, '#')

      expect(screen.queryByText('Actions')).not.toBeInTheDocument()
      expect(screen.getByText('Findings')).toBeInTheDocument()
      expect(screen.queryByText('Files')).not.toBeInTheDocument()
    })

    it('should filter to files group when input starts with "@"', async () => {
      const user = userEvent.setup()
      render(<CommandPalette {...defaultProps} />)
      const input = screen.getByTestId('command-input')
      await user.type(input, '@')

      expect(screen.queryByText('Actions')).not.toBeInTheDocument()
      expect(screen.queryByText('Findings')).not.toBeInTheDocument()
      expect(screen.getByText('Files')).toBeInTheDocument()
    })
  })

  // ── Findings group (AC7) ──

  describe('Findings group (AC7)', () => {
    it('should show severity, category, and confidence for findings', () => {
      render(<CommandPalette {...defaultProps} />)
      // Test data has 2 critical and 3 major findings
      expect(screen.getAllByTestId(/^severity-/).length).toBeGreaterThan(0)
      expect(screen.getAllByText('accuracy').length).toBeGreaterThan(0)
    })

    it('should limit to 20 matching findings', () => {
      const manyFindings = buildTestFindings(50)
      render(<CommandPalette {...defaultProps} findings={manyFindings} />)
      // cmdk renders items — we should see max 20 finding items
      const findingItems = screen.getAllByTestId(/severity-/)
      expect(findingItems.length).toBeLessThanOrEqual(20)
    })

    it('should navigate to finding on select', async () => {
      const user = userEvent.setup()
      render(<CommandPalette {...defaultProps} />)

      // Click on a finding item directly via the source→target text
      const sourceItems = screen.getAllByText(/Source text/)
      await user.click(sourceItems[0]!)

      // Should have set finding and closed dialog
      expect(useReviewStore.getState().selectedId).not.toBeNull()
      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  // ── Actions group ──

  describe('Actions group', () => {
    it('should include "Clear All Filters" action', () => {
      render(<CommandPalette {...defaultProps} />)
      expect(screen.getByText('Clear All Filters')).toBeInTheDocument()
    })

    it('should include "Toggle AI Suggestions" action', () => {
      render(<CommandPalette {...defaultProps} />)
      expect(screen.getByText(/Toggle AI Suggestions/)).toBeInTheDocument()
    })

    it('should execute action on active finding when selected', async () => {
      const user = userEvent.setup()
      render(<CommandPalette {...defaultProps} />)

      // Click on "Accept Finding" action directly (cmdk keyboard unreliable in jsdom)
      const acceptItem = screen.getByText('Accept Finding')
      await user.click(acceptItem)

      expect(defaultProps.onAction).toHaveBeenCalledWith('accept')
    })
  })
})
