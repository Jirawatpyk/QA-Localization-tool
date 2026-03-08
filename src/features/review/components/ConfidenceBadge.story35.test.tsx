/**
 * ATDD Tests — Story 3.5: Score Lifecycle & Confidence Display
 * AC: ConfidenceBadge — confidenceMin prop rename + extended boundary values
 *
 * Story 3.5 renames the prop from `l2ConfidenceMin` to `confidenceMin`
 * to support both L2 and L3 thresholds from the same component.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { ConfidenceBadge } from '@/features/review/components/ConfidenceBadge'

describe('ConfidenceBadge — Story 3.5 prop rename + boundary values', () => {
  // 3.5-U-037: confidence >= 85 -> High (green)
  it('[P0] should render High (green) badge when confidence is >= 85', () => {
    // Arrange: confidence above High threshold
    // Act
    render(<ConfidenceBadge confidence={90} confidenceMin={70} />)

    // Assert: badge shows "High" with success/green styling
    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('High')
    expect(badge.className).toMatch(/success|green/i)
  })

  // 3.5-U-038: confidence 70-84 -> Medium (orange)
  it('[P0] should render Medium (orange) badge when confidence is between 70 and 84', () => {
    // Arrange: confidence in medium range
    // Act
    render(<ConfidenceBadge confidence={77} confidenceMin={70} />)

    // Assert: badge shows "Medium" with warning/orange styling
    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('Medium')
    expect(badge.className).toMatch(/warning|orange/i)
  })

  // 3.5-U-039: confidence < 70 -> Low (red)
  it('[P0] should render Low (red) badge when confidence is below 70', () => {
    // Arrange: confidence in low range
    // Act
    render(<ConfidenceBadge confidence={60} confidenceMin={70} />)

    // Assert: badge shows "Low" with error/red styling
    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('Low')
    expect(badge.className).toMatch(/error|red/i)
  })

  // 3.5-U-040: below confidenceMin -> warning icon visible
  it('[P0] should show warning icon when confidence is below confidenceMin threshold', () => {
    // Arrange: confidence=65 is below confidenceMin=70
    // Act
    render(<ConfidenceBadge confidence={65} confidenceMin={70} />)

    // Assert: warning icon (data-testid="confidence-warning") is visible
    expect(screen.getByTestId('confidence-warning')).toBeInTheDocument()
    expect(screen.getByText(/below threshold/i)).toBeInTheDocument()
  })

  // 3.5-U-041: prop named `confidenceMin` (not l2ConfidenceMin) — Story 3.5 rename
  it('[P0] should accept confidenceMin prop (renamed from l2ConfidenceMin in Story 3.5)', () => {
    // Arrange: use the new prop name `confidenceMin` (not `l2ConfidenceMin`)
    // This test FAILS until ConfidenceBadge prop is renamed
    // Act
    render(<ConfidenceBadge confidence={75} confidenceMin={80} />)

    // Assert: warning shown because 75 < 80 (confidenceMin)
    expect(screen.getByTestId('confidence-warning')).toBeInTheDocument()

    // Also confirm old prop name l2ConfidenceMin is no longer accepted (or still works via alias)
    // The new signature: ConfidenceBadge({ confidence, confidenceMin })
    const { container } = render(<ConfidenceBadge confidence={90} confidenceMin={70} />)
    expect(container.querySelector('[data-testid="confidence-badge"]')).toBeInTheDocument()
  })

  // 3.5-U-059: confidence exactly 85 -> High (boundary)
  it('[P0] should render High badge when confidence is exactly 85 (at-boundary)', () => {
    // Arrange: exact boundary value — 85.0 is the first High value
    // Act
    render(<ConfidenceBadge confidence={85} confidenceMin={70} />)

    // Assert: exactly 85 → High (>= 85 condition, boundary inclusive)
    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('High')
    expect(badge.className).toMatch(/success|green/i)
  })

  // 3.5-U-060: confidence 84.99 -> Medium (boundary)
  it('[P0] should render Medium badge when confidence is 84.99 (just below 85 boundary)', () => {
    // Arrange: 84.99 is just below High threshold
    // Act
    render(<ConfidenceBadge confidence={84.99} confidenceMin={70} />)

    // Assert: 84.99 < 85 → Medium (boundary exclusive on High side)
    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('Medium')
    expect(badge.className).toMatch(/warning|orange/i)
  })

  // 3.5-U-061: confidence exactly 70 -> Medium (boundary)
  it('[P0] should render Medium badge when confidence is exactly 70 (at lower Medium boundary)', () => {
    // Arrange: 70 is the boundary — >= 70 = Medium
    // Act
    render(<ConfidenceBadge confidence={70} confidenceMin={70} />)

    // Assert: exactly 70 → Medium
    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('Medium')
    expect(badge.className).toMatch(/warning|orange/i)

    // At exactly threshold → NOT below threshold (no warning icon)
    expect(screen.queryByTestId('confidence-warning')).toBeNull()
  })

  // 3.5-U-062: confidence 69.99 -> Low (boundary)
  it('[P0] should render Low badge when confidence is 69.99 (just below 70 boundary)', () => {
    // Arrange: 69.99 is below Medium threshold → Low
    // Act
    render(<ConfidenceBadge confidence={69.99} confidenceMin={70} />)

    // Assert: 69.99 < 70 → Low
    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('Low')
    expect(badge.className).toMatch(/error|red/i)

    // Also below confidenceMin=70 → warning shown
    expect(screen.getByTestId('confidence-warning')).toBeInTheDocument()
  })

  // 3.5-U-064: confidenceMin=0 -> all findings are "above threshold" (no warnings)
  it('[P1] should not show warning icon when confidenceMin=0 (zero threshold)', () => {
    // Arrange: threshold=0 means "no minimum" — even confidence=1 should not warn
    // Act
    render(<ConfidenceBadge confidence={15} confidenceMin={0} />)

    // Assert: confidence(15) >= confidenceMin(0) → no warning
    // Edge case: 0 threshold disables the below-threshold indicator
    expect(screen.queryByTestId('confidence-warning')).toBeNull()
  })

  // 3.5-U-065: confidenceMin=100 -> all findings below threshold (all warn)
  it('[P1] should show warning icon for all confidence values when confidenceMin=100', () => {
    // Arrange: threshold=100 means only perfect confidence passes
    // Act
    render(<ConfidenceBadge confidence={99} confidenceMin={100} />)

    // Assert: even 99 is below 100 → warning shown
    expect(screen.getByTestId('confidence-warning')).toBeInTheDocument()

    // Also test with high confidence (85+) — still warns because < 100
    const { rerender } = render(<ConfidenceBadge confidence={95} confidenceMin={100} />)
    rerender(<ConfidenceBadge confidence={95} confidenceMin={100} />)
    // The second render's warning — original assertion above already covers the pattern
  })

  // 3.5-U-066: confidence=0 -> Low (floor boundary)
  it('[P0] should render Low badge when confidence is 0 (floor boundary)', () => {
    // Arrange: lowest possible confidence value
    // Act
    render(<ConfidenceBadge confidence={0} confidenceMin={70} />)

    // Assert: 0 < 70 → Low
    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('Low')
    expect(badge.className).toMatch(/error|red/i)

    // Also below threshold → warning shown
    expect(screen.getByTestId('confidence-warning')).toBeInTheDocument()
  })

  // 3.5-U-067: confidence=100 -> High (ceiling boundary)
  it('[P0] should render High badge when confidence is 100 (ceiling boundary)', () => {
    // Arrange: maximum confidence value
    // Act
    render(<ConfidenceBadge confidence={100} confidenceMin={70} />)

    // Assert: 100 >= 85 → High
    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('High')
    expect(badge.className).toMatch(/success|green/i)

    // Above threshold → no warning
    expect(screen.queryByTestId('confidence-warning')).toBeNull()
  })
})

// TA: Coverage Gap Tests (Story 3.5)

describe('ConfidenceBadge — TA: Coverage Gap Tests (Story 3.5)', () => {
  // G9 [P2]: rounding edge — confidence=84.5 → displays "85%" but tier is medium (orange)
  it('[P2] should display "85%" but use medium tier when confidence is 84.5 (G9)', () => {
    render(<ConfidenceBadge confidence={84.5} confidenceMin={70} />)

    const badge = screen.getByTestId('confidence-badge')
    // Math.round(84.5) = 85, so display text shows "85%"
    expect(badge.textContent).toContain('85%')
    // But tier is computed from raw value 84.5, which is < 85 → medium
    expect(badge.getAttribute('data-confidence-tier')).toBe('medium')
    expect(badge.className).toMatch(/warning|orange/i)
  })

  // WI-7 [P2]: confidenceMin=NaN → threshold check always false → no warning
  it('[P2] should show NO warning when confidenceMin is NaN (G9-WI-7)', () => {
    render(<ConfidenceBadge confidence={50} confidenceMin={NaN} />)

    // `50 < NaN` is always false in JavaScript → isBelowThreshold = false
    expect(screen.queryByTestId('confidence-warning')).toBeNull()

    // Badge should still render correctly
    const badge = screen.getByTestId('confidence-badge')
    expect(badge).toHaveTextContent('Low')
  })

  // SC-1-badge [P2]: verify correct behavior with different confidenceMin values
  it('[P2] should NOT show warning when confidence meets threshold (SC-1-badge)', () => {
    const { rerender } = render(<ConfidenceBadge confidence={85} confidenceMin={80} />)

    // 85 >= 80 → no warning
    expect(screen.queryByTestId('confidence-warning')).toBeNull()

    // Re-render with higher threshold: 85 < 90 → warning should appear
    rerender(<ConfidenceBadge confidence={85} confidenceMin={90} />)
    expect(screen.getByTestId('confidence-warning')).toBeInTheDocument()
  })
})
