/**
 * ATDD Tests — Story 3.2c: L2 Results Display & Score Update
 * AC8: Pipeline layer completion status
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { ReviewProgress } from '@/features/review/components/ReviewProgress'
import type { ProcessingMode } from '@/types/pipeline'
import type { DbFileStatus } from '@/types/pipeline'

describe('ReviewProgress', () => {
  // ── P1: L1 always complete ──

  it('[P1] should always show checkmark for L1', () => {
    render(
      <ReviewProgress
        fileStatus={'l1_completed' as DbFileStatus}
        layerCompleted="L1"
        processingMode={'economy' as ProcessingMode}
      />,
    )

    const l1Status = screen.getByTestId('layer-status-L1')
    expect(l1Status).toHaveTextContent(/complete|✓|check/i)
  })

  // ── P0: L2 processing states ──

  it('[P0] should show spinner for L2 during l2_processing', () => {
    render(
      <ReviewProgress
        fileStatus={'l2_processing' as DbFileStatus}
        layerCompleted="L1"
        processingMode={'economy' as ProcessingMode}
      />,
    )

    const l2Status = screen.getByTestId('layer-status-L2')
    expect(l2Status.querySelector('.animate-spin')).not.toBeNull()
  })

  it('[P0] should show checkmark for L2 when layerCompleted includes L2', () => {
    render(
      <ReviewProgress
        fileStatus={'l2_completed' as DbFileStatus}
        layerCompleted="L1L2"
        processingMode={'economy' as ProcessingMode}
      />,
    )

    const l2Status = screen.getByTestId('layer-status-L2')
    expect(l2Status).toHaveTextContent(/complete|✓|check/i)
  })

  // ── P0: L2 pending (T8.7) ──

  it('[P0] should show L2 pending when layerCompleted is L1 only', () => {
    render(
      <ReviewProgress
        fileStatus={'l1_completed' as DbFileStatus}
        layerCompleted="L1"
        processingMode={'economy' as ProcessingMode}
      />,
    )

    const l2Status = screen.getByTestId('layer-status-L2')
    // Pending state renders a circle indicator (not a checkmark, not a spinner)
    expect(l2Status.innerHTML).not.toMatch(/animate-spin/i)
    expect(l2Status).not.toHaveTextContent(/complete|✓|check/i)
    // Should NOT have data-completed attribute
    expect(l2Status.getAttribute('data-completed')).toBeNull()
  })

  // ── P0: L3 economy mode ──

  it('[P0] should show "N/A" for L3 in Economy mode', () => {
    render(
      <ReviewProgress
        fileStatus={'l2_completed' as DbFileStatus}
        layerCompleted="L1L2"
        processingMode={'economy' as ProcessingMode}
      />,
    )

    const l3Status = screen.getByTestId('layer-status-L3')
    expect(l3Status).toHaveTextContent(/N\/A|not applicable/i)
  })

  // ── P1: L3 thorough mode ──

  it('[P1] should show checkmark for L3 when layerCompleted=L1L2L3 (Thorough)', () => {
    render(
      <ReviewProgress
        fileStatus={'l3_completed' as DbFileStatus}
        layerCompleted="L1L2L3"
        processingMode={'thorough' as ProcessingMode}
      />,
    )

    const l3Status = screen.getByTestId('layer-status-L3')
    expect(l3Status).toHaveTextContent(/complete|✓|check/i)
  })

  it('[P1] should show "AI: L2 complete" text when L2 finishes', () => {
    render(
      <ReviewProgress
        fileStatus={'l2_completed' as DbFileStatus}
        layerCompleted="L1L2"
        processingMode={'economy' as ProcessingMode}
      />,
    )

    expect(screen.getByText(/AI.*L2.*complete/i)).toBeTruthy()
  })

  // ── TA: Coverage Gap Tests ──

  it('[P1] should show spinner for L3 during l3_processing in Thorough mode', () => {
    render(
      <ReviewProgress
        fileStatus={'l3_processing' as DbFileStatus}
        layerCompleted="L1L2"
        processingMode={'thorough' as ProcessingMode}
      />,
    )

    const l3Status = screen.getByTestId('layer-status-L3')
    expect(l3Status.querySelector('.animate-spin')).not.toBeNull()
  })

  it('[P1] should render pending circle indicator for L3 in Thorough when not yet started', () => {
    render(
      <ReviewProgress
        fileStatus={'l2_completed' as DbFileStatus}
        layerCompleted="L1L2"
        processingMode={'thorough' as ProcessingMode}
      />,
    )

    const l3Status = screen.getByTestId('layer-status-L3')
    // Pending renders a circle element (rounded-full border)
    const pendingCircle = l3Status.querySelector('.rounded-full')
    expect(pendingCircle).not.toBeNull()
    // Should NOT be a spinner or checkmark
    expect(l3Status.querySelector('.animate-spin')).toBeNull()
    expect(l3Status).not.toHaveTextContent(/complete|✓|check/i)
  })
})
