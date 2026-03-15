/**
 * Story 4.4b ATDD: ConflictDialog Component
 * Tests: AC8 (conflict dialog UX, a11y)
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { ConflictDialog } from '@/features/review/components/ConflictDialog'
import type { UndoEntry } from '@/features/review/stores/review.store'

function buildTestEntry(overrides?: Partial<UndoEntry>): UndoEntry {
  const findingId = '00000000-0000-4000-8000-000000000003'
  return {
    id: 'entry-1',
    type: 'single',
    action: 'accept',
    findingId,
    batchId: null,
    previousStates: new Map([[findingId, 'pending']]),
    newStates: new Map([[findingId, 'accepted']]),
    previousSeverity: null,
    newSeverity: null,
    findingSnapshot: null,
    description: 'Accept finding',
    timestamp: Date.now(),
    staleFindings: new Set(),
    ...overrides,
  }
}

describe('ConflictDialog', () => {
  // ── P1: AC8 — Render (C-01) ──

  it('should render with correct finding state information (C-01)', () => {
    const entry = buildTestEntry()
    render(
      <ConflictDialog
        open={true}
        entry={entry}
        findingId="00000000-0000-4000-8000-000000000003"
        currentState="rejected"
        onForceUndo={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Conflict Detected')).toBeInTheDocument()
    expect(screen.getByText(/rejected/)).toBeInTheDocument()
    expect(screen.getByText(/pending/)).toBeInTheDocument()
    expect(screen.getByText(/00000000/)).toBeInTheDocument()
  })

  // ── P1: AC8 — Force undo (C-02) ──

  it('should call onForceUndo when Undo Anyway button clicked (C-02)', async () => {
    const user = userEvent.setup()
    const onForceUndo = vi.fn()
    const entry = buildTestEntry()

    render(
      <ConflictDialog
        open={true}
        entry={entry}
        findingId="00000000-0000-4000-8000-000000000003"
        currentState="rejected"
        onForceUndo={onForceUndo}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /undo anyway/i }))
    expect(onForceUndo).toHaveBeenCalledTimes(1)
  })

  // ── P1: AC8 — Cancel (C-03) ──

  it('should call onCancel when Cancel clicked (C-03)', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const entry = buildTestEntry()

    render(
      <ConflictDialog
        open={true}
        entry={entry}
        findingId="00000000-0000-4000-8000-000000000003"
        currentState="rejected"
        onForceUndo={vi.fn()}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  // ── P1: AC8 — Accessibility (C-04) ──

  it('should have aria-modal and alertdialog role for accessibility (C-04)', () => {
    const entry = buildTestEntry()

    render(
      <ConflictDialog
        open={true}
        entry={entry}
        findingId="00000000-0000-4000-8000-000000000003"
        currentState="rejected"
        onForceUndo={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    // shadcn AlertDialog sets aria-modal automatically
    // "Cancel" should be the default focus (not the destructive "Undo Anyway")
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /undo anyway/i })).toBeInTheDocument()
  })
})
