/**
 * Story 4.7 CR-R1 H2: AddToGlossaryDialog unit tests
 *
 * Covers: AC1 (pre-fill), AC3 (duplicate + update existing), AC5 (future QA note),
 * Guardrail #11 (form reset on re-open)
 */
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import type React from 'react'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

vi.mock('server-only', () => ({}))

// Mock Radix Dialog to render inline (no portal/ResizeObserver in jsdom)
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog-root">{children}</div> : null,
  DialogContent: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    [key: string]: unknown
  }) => <div data-testid={props['data-testid'] as string}>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockAddToGlossary = vi.fn()
const mockUpdateGlossaryTerm = vi.fn()

vi.mock('@/features/review/actions/addToGlossary.action', () => ({
  addToGlossary: (...args: unknown[]) => mockAddToGlossary(...args),
}))
vi.mock('@/features/review/actions/updateGlossaryTerm.action', () => ({
  updateGlossaryTerm: (...args: unknown[]) => mockUpdateGlossaryTerm(...args),
}))

// Mock sonner toast
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

import { AddToGlossaryDialog } from '@/features/review/components/AddToGlossaryDialog'
import type { FindingForDisplay } from '@/features/review/types'

// ResizeObserver polyfill for jsdom
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

const baseFinding: FindingForDisplay = {
  id: '00000000-0000-4000-8000-000000000001',
  segmentId: '00000000-0000-4000-8000-000000000002',
  severity: 'major',
  originalSeverity: null,
  category: 'Terminology',
  description: 'Incorrect term',
  status: 'pending',
  detectedByLayer: 'L1',
  aiConfidence: null,
  sourceTextExcerpt: 'financial institution',
  targetTextExcerpt: 'สถาบันทางการเงิน',
  suggestedFix: 'สถาบันการเงิน',
  aiModel: null,
}

function defaultProps(overrides?: Partial<Parameters<typeof AddToGlossaryDialog>[0]>) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    finding: baseFinding,
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    projectId: '00000000-0000-4000-8000-000000000100',
    ...overrides,
  }
}

describe('AddToGlossaryDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddToGlossary.mockResolvedValue({
      success: true,
      data: {
        created: true,
        termId: 't-1',
        glossaryId: 'g-1',
        sourceTerm: 'financial institution',
        targetTerm: 'สถาบันการเงิน',
      },
    })
    mockUpdateGlossaryTerm.mockResolvedValue({
      success: true,
      data: { termId: 't-1', targetTerm: 'สถาบันการเงิน' },
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // AC1: Pre-fill from finding props
  // ═══════════════════════════════════════════════════════════════

  it('[P0][AC1] should pre-fill sourceTerm from finding.sourceTextExcerpt', () => {
    render(<AddToGlossaryDialog {...defaultProps()} />)

    const sourceInput = screen.getByLabelText(/Source Term/i) as HTMLInputElement
    expect(sourceInput.value).toBe('financial institution')
  })

  it('[P0][AC1] should pre-fill targetTerm from finding.suggestedFix', () => {
    render(<AddToGlossaryDialog {...defaultProps()} />)

    const targetInput = screen.getByLabelText(/Target Term/i) as HTMLInputElement
    expect(targetInput.value).toBe('สถาบันการเงิน')
  })

  it('[P1][AC1] should default targetTerm to empty when suggestedFix is null', () => {
    const finding: FindingForDisplay = { ...baseFinding, suggestedFix: null }
    render(<AddToGlossaryDialog {...defaultProps({ finding })} />)

    const targetInput = screen.getByLabelText(/Target Term/i) as HTMLInputElement
    expect(targetInput.value).toBe('')
  })

  it('[P1][AC1] should display language pair as read-only', () => {
    render(<AddToGlossaryDialog {...defaultProps()} />)

    expect(screen.getByText('en-US → th-TH')).toBeInTheDocument()
  })

  it('[P1][AC1] should render notes textarea', () => {
    render(<AddToGlossaryDialog {...defaultProps()} />)

    expect(screen.getByLabelText(/Notes/i)).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════
  // AC3: Duplicate detection + "Update existing"
  // ═══════════════════════════════════════════════════════════════

  it('[P0][AC3] should show duplicate warning when server returns duplicate', async () => {
    mockAddToGlossary.mockResolvedValue({
      success: true,
      data: { created: false, duplicate: true, existingTermId: 't-2', existingTarget: 'ธนาคาร' },
    })

    render(<AddToGlossaryDialog {...defaultProps()} />)

    // Submit form via button click
    const submitBtn = screen.getByRole('button', { name: /Add Term/i })
    await act(async () => {
      fireEvent.click(submitBtn)
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
      expect(screen.getByText(/ธนาคาร/)).toBeInTheDocument()
    })

    // "Update existing" button should be visible
    expect(screen.getByRole('button', { name: /Update existing/i })).toBeInTheDocument()
  })

  it('[P1][AC3] should call updateGlossaryTerm when "Update existing" is clicked', async () => {
    mockAddToGlossary.mockResolvedValue({
      success: true,
      data: { created: false, duplicate: true, existingTermId: 't-2', existingTarget: 'ธนาคาร' },
    })

    render(<AddToGlossaryDialog {...defaultProps()} />)

    // Submit to trigger duplicate
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Term/i }))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Update existing/i })).toBeInTheDocument()
    })

    // Click "Update existing"
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Update existing/i }))
    })

    await waitFor(() => {
      expect(mockUpdateGlossaryTerm).toHaveBeenCalledWith(
        expect.objectContaining({
          termId: 't-2',
          projectId: '00000000-0000-4000-8000-000000000100',
        }),
      )
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // AC5: "Future QA runs" info note
  // ═══════════════════════════════════════════════════════════════

  it('[P0][AC5] should show "future QA runs" note after successful add', async () => {
    render(<AddToGlossaryDialog {...defaultProps()} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Term/i }))
    })

    await waitFor(() => {
      expect(screen.getByText(/future QA runs/i)).toBeInTheDocument()
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Guardrail #11: Form reset on re-open
  // ═══════════════════════════════════════════════════════════════

  it('[P1][G#11] should reset form state when dialog re-opens', async () => {
    // First: open dialog, trigger duplicate state
    mockAddToGlossary.mockResolvedValue({
      success: true,
      data: { created: false, duplicate: true, existingTermId: 't-2', existingTarget: 'ธนาคาร' },
    })

    const { rerender } = render(<AddToGlossaryDialog {...defaultProps()} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Term/i }))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // Close dialog
    rerender(<AddToGlossaryDialog {...defaultProps({ open: false })} />)

    // Re-open — should reset: no duplicate warning, no success state
    rerender(<AddToGlossaryDialog {...defaultProps({ open: true })} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/future QA runs/i)).not.toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════
  // Error handling
  // ═══════════════════════════════════════════════════════════════

  it('[P1] should call toast.error when server action fails', async () => {
    mockAddToGlossary.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Source term is required',
    })

    render(<AddToGlossaryDialog {...defaultProps()} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Term/i }))
    })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Source term is required')
    })

    // Should NOT show success or duplicate state
    expect(screen.queryByText(/future QA runs/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('[P2][CR-R2-L2] should call toast.error when updateGlossaryTerm fails', async () => {
    // First trigger duplicate state
    mockAddToGlossary.mockResolvedValue({
      success: true,
      data: { created: false, duplicate: true, existingTermId: 't-2', existingTarget: 'ธนาคาร' },
    })

    render(<AddToGlossaryDialog {...defaultProps()} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Term/i }))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Update existing/i })).toBeInTheDocument()
    })

    // Now make updateGlossaryTerm fail
    mockUpdateGlossaryTerm.mockResolvedValue({
      success: false,
      code: 'UPDATE_FAILED',
      error: 'Failed to update term',
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Update existing/i }))
    })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to update term')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // CR-R2: caseSensitive checkbox + stale duplicate clear
  // ═══════════════════════════════════════════════════════════════

  it('[P2][CR-R2-L1] should render caseSensitive checkbox', () => {
    render(<AddToGlossaryDialog {...defaultProps()} />)

    expect(screen.getByText('Case sensitive')).toBeInTheDocument()
  })

  it('[P1][CR-R2-M1] should clear duplicate warning when sourceTerm input changes', async () => {
    // Trigger duplicate state
    mockAddToGlossary.mockResolvedValue({
      success: true,
      data: { created: false, duplicate: true, existingTermId: 't-2', existingTarget: 'ธนาคาร' },
    })

    render(<AddToGlossaryDialog {...defaultProps()} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Term/i }))
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // Edit sourceTerm — should clear duplicate warning
    const sourceInput = screen.getByLabelText(/Source Term/i)
    fireEvent.change(sourceInput, { target: { value: 'different term' } })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
