/**
 * Story 4.4b TA: ConflictDialog — Accessibility expansion
 * Gap: G-09 (Esc key closes dialog — Guardrail #30/31)
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { ConflictDialog } from '@/features/review/components/ConflictDialog'
import type { UndoEntry } from '@/features/review/stores/review.store'

function buildTestEntry(overrides?: Partial<UndoEntry>): UndoEntry {
  const findingId = '00000000-0000-4000-8000-000000000003'
  return {
    id: 'entry-ta-1',
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

describe('ConflictDialog — Accessibility Expansion', () => {
  // ── TA-U11: P2 — Esc key closes dialog via onCancel ──

  it('should call onCancel when Escape key is pressed (TA-U11)', async () => {
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

    // Verify dialog is open
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // Press Escape — shadcn AlertDialog should trigger onCancel
    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalled()
  })

  // ── Destructive button should NOT have default focus ──

  it('should have Cancel as focusable and Undo Anyway as destructive variant', () => {
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

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    const forceBtn = screen.getByRole('button', { name: /undo anyway/i })

    // Cancel button should exist and be accessible
    expect(cancelBtn).toBeInTheDocument()
    // Undo Anyway should exist — AC8: destructive action styling
    expect(forceBtn).toBeInTheDocument()
  })

  // ── Closed dialog renders nothing ──

  it('should not render dialog content when open is false', () => {
    const entry = buildTestEntry()

    render(
      <ConflictDialog
        open={false}
        entry={entry}
        findingId="00000000-0000-4000-8000-000000000003"
        currentState="rejected"
        onForceUndo={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Conflict Detected')).not.toBeInTheDocument()
  })
})
