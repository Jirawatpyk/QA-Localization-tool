/**
 * ATDD Tests — Story 3.2c: L2 Results Display & Score Update
 * AC2: Confidence badge with color-coded levels
 *
 * TDD RED PHASE — all tests are `it.skip()`.
 * Dev removes `.skip` and makes tests pass during implementation.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { ConfidenceBadge } from '@/features/review/components/ConfidenceBadge'

describe('ConfidenceBadge', () => {
  // ── P0: Color-coded confidence levels ──

  it('[P0] should render green "High" badge when confidence >= 85 (at boundary)', () => {
    render(<ConfidenceBadge confidence={85} />)

    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('High')
    expect(badge.className).toMatch(/success|high/i)
  })

  it('[P0] should render orange "Medium" badge when confidence is 84.9 (below 85 boundary)', () => {
    render(<ConfidenceBadge confidence={84.9} />)

    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('Medium')
    expect(badge.className).toMatch(/warning|medium/i)
  })

  it('[P0] should render orange "Medium" badge when confidence is 70 (at lower boundary)', () => {
    render(<ConfidenceBadge confidence={70} />)

    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('Medium')
    expect(badge.className).toMatch(/warning|medium/i)
  })

  it('[P0] should render red "Low" badge when confidence is 69.9 (below 70 boundary)', () => {
    render(<ConfidenceBadge confidence={69.9} />)

    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('Low')
    expect(badge.className).toMatch(/error|low/i)
  })

  it('[P0] should render nothing when confidence is null (L1 finding)', () => {
    const { container } = render(<ConfidenceBadge confidence={null} />)

    expect(container.innerHTML).toBe('')
    expect(screen.queryByTestId('confidence-badge')).toBeNull()
  })

  it('[P0] should show "Below threshold" warning when confidence < l2ConfidenceMin', () => {
    render(<ConfidenceBadge confidence={60} l2ConfidenceMin={70} />)

    expect(screen.getByText(/below threshold/i)).toBeTruthy()
  })

  // ── P1: Edge cases and threshold validation ──

  it('[P1] should not show warning when confidence >= l2ConfidenceMin (at threshold)', () => {
    render(<ConfidenceBadge confidence={70} l2ConfidenceMin={70} />)

    expect(screen.queryByText(/below threshold/i)).toBeNull()
  })

  it('[P1] should render High for confidence=100 (max edge)', () => {
    render(<ConfidenceBadge confidence={100} />)

    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('High')
    expect(badge.className).toMatch(/success|high/i)
  })

  it('[P1] should render Low for confidence=0 (zero edge)', () => {
    render(<ConfidenceBadge confidence={0} />)

    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('Low')
    expect(badge.className).toMatch(/error|low/i)
  })
})
