/**
 * ATDD Tests — Story 4.1a: Finding List Display & Progressive Disclosure
 * AC3: Progressive Loading with Dual-Track ReviewProgress
 *
 * GREEN PHASE: ReviewProgress redesigned with dual-track bars.
 * Replaces old ReviewProgress.test.tsx (Story 3.2c layer-status tests).
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { ReviewProgress } from '@/features/review/components/ReviewProgress'
import type { ProcessingMode, DbFileStatus } from '@/types/pipeline'

describe('ReviewProgress — Dual-Track (Story 4.1a)', () => {
  // ── T3.1 [P0]: Dual-track shows review count + AI status ──

  it('[T3.1][P0] should render dual-track with "Reviewed: X/N" and AI status', () => {
    render(
      <ReviewProgress
        reviewedCount={3}
        totalCount={10}
        fileStatus={'l2_processing' as DbFileStatus}
        processingMode={'economy' as ProcessingMode}
      />,
    )

    // Review track
    expect(screen.getByText(/Reviewed: 3\/10/)).toBeInTheDocument()
    // AI track — some status indicator
    expect(screen.getByTestId('ai-status-track')).toBeInTheDocument()
  })

  // ── T3.2 [P1]: State: Active — both tracks updating ──

  it('[T3.2][P1] should show Active state when fileStatus is processing and review incomplete', () => {
    render(
      <ReviewProgress
        reviewedCount={2}
        totalCount={10}
        fileStatus={'l2_processing' as DbFileStatus}
        processingMode={'economy' as ProcessingMode}
      />,
    )

    // Review bar should show current values
    const reviewBar = screen.getByTestId('review-progress-bar')
    expect(reviewBar).toHaveAttribute('aria-valuenow', '2')
    expect(reviewBar).toHaveAttribute('aria-valuemax', '10')

    // AI bar should NOT be at 100
    const aiBar = screen.getByTestId('ai-progress-bar')
    expect(aiBar).not.toHaveAttribute('aria-valuenow', '100')
  })

  // ── T3.3 [P1]: State: AI Complete — track 2 = 100% ──

  it('[T3.3][P1] should show AI track at 100% when fileStatus is l2_completed (economy)', () => {
    render(
      <ReviewProgress
        reviewedCount={3}
        totalCount={10}
        fileStatus={'l2_completed' as DbFileStatus}
        processingMode={'economy' as ProcessingMode}
      />,
    )

    const aiBar = screen.getByTestId('ai-progress-bar')
    expect(aiBar).toHaveAttribute('aria-valuenow', '100')
  })

  // ── T3.4 [P1]: State: Review Complete — track 1 = 100% ──

  it('[T3.4][P1] should show review track at 100% when reviewedCount equals totalCount', () => {
    render(
      <ReviewProgress
        reviewedCount={10}
        totalCount={10}
        fileStatus={'l2_processing' as DbFileStatus}
        processingMode={'economy' as ProcessingMode}
      />,
    )

    const reviewBar = screen.getByTestId('review-progress-bar')
    expect(reviewBar).toHaveAttribute('aria-valuenow', '10')
    expect(reviewBar).toHaveAttribute('aria-valuemax', '10')
  })

  // ── T3.5 [P1]: State: All Done — both tracks = 100% ──

  it('[T3.5][P1] should show "All Done" state when both review and AI are complete', () => {
    render(
      <ReviewProgress
        reviewedCount={10}
        totalCount={10}
        fileStatus={'l2_completed' as DbFileStatus}
        processingMode={'economy' as ProcessingMode}
      />,
    )

    // Both labels present: "All reviewed" in track + "All Done" summary
    expect(screen.getByText('All reviewed')).toBeInTheDocument()
    expect(screen.getByText('All Done')).toBeInTheDocument()
  })

  // ── T3.6 [P1]: Processing labels ──

  it('[T3.6][P1] should show "Processing L2..." label when fileStatus is l2_processing', () => {
    render(
      <ReviewProgress
        reviewedCount={0}
        totalCount={10}
        fileStatus={'l2_processing' as DbFileStatus}
        processingMode={'economy' as ProcessingMode}
      />,
    )

    expect(screen.getByText(/Processing L2/)).toBeInTheDocument()
  })

  it('[T3.6b][P1] should show "Processing L3..." label when fileStatus is l3_processing', () => {
    render(
      <ReviewProgress
        reviewedCount={0}
        totalCount={10}
        fileStatus={'l3_processing' as DbFileStatus}
        processingMode={'thorough' as ProcessingMode}
      />,
    )

    expect(screen.getByText(/Processing L3/)).toBeInTheDocument()
  })

  // ── T3.7 [P1]: Animations respect prefers-reduced-motion (G#37) ──

  it('[T3.7][P1] should respect prefers-reduced-motion by adding transition-none class (G#37)', () => {
    // Mock matchMedia to indicate reduced motion preference
    const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    vi.stubGlobal('matchMedia', matchMediaMock)

    render(
      <ReviewProgress
        reviewedCount={3}
        totalCount={10}
        fileStatus={'l2_processing' as DbFileStatus}
        processingMode={'economy' as ProcessingMode}
      />,
    )

    // Progress bars should have transition-none class when reduced motion is active
    const progressContainer = screen.getByTestId('review-progress')
    expect(progressContainer.innerHTML).toMatch(/transition-none/)

    vi.unstubAllGlobals()
  })

  // ── T3.8 [P1]: role="progressbar" + ARIA attributes ──

  it('[T3.8][P1] should have role="progressbar" with aria-valuenow/min/max on both wrapper bars', () => {
    render(
      <ReviewProgress
        reviewedCount={5}
        totalCount={20}
        fileStatus={'l2_completed' as DbFileStatus}
        processingMode={'economy' as ProcessingMode}
      />,
    )

    // Check the outer wrapper bars (which have our data-testid)
    const reviewBar = screen.getByTestId('review-progress-bar')
    expect(reviewBar).toHaveAttribute('role', 'progressbar')
    expect(reviewBar).toHaveAttribute('aria-valuenow', '5')
    expect(reviewBar).toHaveAttribute('aria-valuemin', '0')
    expect(reviewBar).toHaveAttribute('aria-valuemax', '20')

    const aiBar = screen.getByTestId('ai-progress-bar')
    expect(aiBar).toHaveAttribute('role', 'progressbar')
    expect(aiBar).toHaveAttribute('aria-valuenow', '100')
    expect(aiBar).toHaveAttribute('aria-valuemin', '0')
    expect(aiBar).toHaveAttribute('aria-valuemax', '100')
  })

  // ── T3.12 [P1]: Error state — fileStatus=failed → error indicator ──

  it('[T3.12][P1] should show AI track error indicator when fileStatus is failed', () => {
    render(
      <ReviewProgress
        reviewedCount={3}
        totalCount={10}
        fileStatus={'failed' as DbFileStatus}
        processingMode={'economy' as ProcessingMode}
      />,
    )

    // Error indicator should be visible
    const aiTrack = screen.getByTestId('ai-status-track')
    expect(aiTrack).toHaveTextContent(/error/i)
  })

  // ── B5 [P1]: Reviewed 0/0 (no findings yet) ──

  it('[B5][P1] should show "Reviewed: 0/0" when no findings exist yet', () => {
    render(
      <ReviewProgress
        reviewedCount={0}
        totalCount={0}
        fileStatus={'l1_processing' as DbFileStatus}
        processingMode={'economy' as ProcessingMode}
      />,
    )

    expect(screen.getByText(/Reviewed: 0\/0/)).toBeInTheDocument()
  })

  // ── B6 [P1]: Reviewed N/N → 100% fill + "All reviewed" ──

  it('[B6][P1] should show 100% fill and "All reviewed" text when reviewedCount equals totalCount', () => {
    render(
      <ReviewProgress
        reviewedCount={15}
        totalCount={15}
        fileStatus={'l2_completed' as DbFileStatus}
        processingMode={'economy' as ProcessingMode}
      />,
    )

    const reviewBar = screen.getByTestId('review-progress-bar')
    expect(reviewBar).toHaveAttribute('aria-valuenow', '15')
    expect(reviewBar).toHaveAttribute('aria-valuemax', '15')
    // Both labels present: "All reviewed" in track + "All Done" summary
    expect(screen.getByText('All reviewed')).toBeInTheDocument()
    expect(screen.getByText('All Done')).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // deriveStatusFromLayer + layerCompleted override (CR R2 M1)
  // ═══════════════════════════════════════════════════════════════════════

  describe('layerCompleted Realtime override', () => {
    it('should use layerCompleted=L1L2 over stale fileStatus=l1_processing (economy)', () => {
      render(
        <ReviewProgress
          reviewedCount={0}
          totalCount={10}
          fileStatus={'l1_processing' as DbFileStatus}
          processingMode={'economy' as ProcessingMode}
          layerCompleted="L1L2"
        />,
      )

      // L1L2 derives to l2_completed → economy = 100% AI progress
      const aiBar = screen.getByTestId('ai-progress-bar')
      expect(aiBar).toHaveAttribute('aria-valuenow', '100')
      expect(screen.getByText(/AI: complete/)).toBeInTheDocument()
    })

    it('should use layerCompleted=L1L2L3 over stale fileStatus (thorough)', () => {
      render(
        <ReviewProgress
          reviewedCount={0}
          totalCount={10}
          fileStatus={'l2_completed' as DbFileStatus}
          processingMode={'thorough' as ProcessingMode}
          layerCompleted="L1L2L3"
        />,
      )

      const aiBar = screen.getByTestId('ai-progress-bar')
      expect(aiBar).toHaveAttribute('aria-valuenow', '100')
      expect(screen.getByText(/AI: complete/)).toBeInTheDocument()
    })

    it('should use layerCompleted=L1 for l1_completed progress', () => {
      render(
        <ReviewProgress
          reviewedCount={0}
          totalCount={10}
          fileStatus={'pending' as DbFileStatus}
          processingMode={'economy' as ProcessingMode}
          layerCompleted="L1"
        />,
      )

      // L1 derives to l1_completed → AI pending label
      expect(screen.getByText(/AI: pending/)).toBeInTheDocument()
    })

    it('should fall back to fileStatus when layerCompleted is null', () => {
      render(
        <ReviewProgress
          reviewedCount={0}
          totalCount={10}
          fileStatus={'l2_processing' as DbFileStatus}
          processingMode={'economy' as ProcessingMode}
          layerCompleted={null}
        />,
      )

      expect(screen.getByText(/Processing L2/)).toBeInTheDocument()
    })

    it('should NOT override failed fileStatus with layerCompleted (H1 bug fix)', () => {
      render(
        <ReviewProgress
          reviewedCount={0}
          totalCount={10}
          fileStatus={'failed' as DbFileStatus}
          processingMode={'economy' as ProcessingMode}
          layerCompleted="L1"
        />,
      )

      // Failed must take priority — user must see error
      expect(screen.getByText(/AI: error/)).toBeInTheDocument()
      const aiBar = screen.getByTestId('ai-progress-bar')
      expect(aiBar).toHaveAttribute('aria-valuenow', '0')
    })

    it('should NOT override ai_partial fileStatus with layerCompleted', () => {
      render(
        <ReviewProgress
          reviewedCount={0}
          totalCount={10}
          fileStatus={'ai_partial' as DbFileStatus}
          processingMode={'economy' as ProcessingMode}
          layerCompleted="L1L2"
        />,
      )

      // ai_partial must take priority
      expect(screen.getByText(/AI: partial/)).toBeInTheDocument()
    })
  })
})
