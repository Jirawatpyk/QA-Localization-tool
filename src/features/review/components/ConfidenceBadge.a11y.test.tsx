/**
 * P2-04 (R3-023): Confidence badge accessibility — distinct indicator per tier
 * Verifies color is NOT the sole information carrier (NFR27, SC 1.4.1).
 * Each tier must have a text label + data-confidence-tier attribute.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { ConfidenceBadge } from '@/features/review/components/ConfidenceBadge'

describe('ConfidenceBadge a11y (P2-04)', () => {
  it('[P2] should render data-confidence-tier="high" with text label "High" for high tier', () => {
    render(<ConfidenceBadge confidence={90} />)

    const badge = screen.getByTestId('confidence-badge')
    expect(badge.getAttribute('data-confidence-tier')).toBe('high')
    expect(badge).toHaveTextContent('High')
    // Text content includes percentage for screen readers
    expect(badge).toHaveTextContent('90%')
  })

  it('[P2] should render data-confidence-tier="medium" distinct from "high" for medium tier', () => {
    render(<ConfidenceBadge confidence={75} />)

    const badge = screen.getByTestId('confidence-badge')
    const tier = badge.getAttribute('data-confidence-tier')
    expect(tier).toBe('medium')
    expect(tier).not.toBe('high')
    expect(badge).toHaveTextContent('Medium')
    expect(badge).toHaveTextContent('75%')
  })

  it('[P2] should render data-confidence-tier="low" distinct from "medium" for low tier', () => {
    render(<ConfidenceBadge confidence={50} />)

    const badge = screen.getByTestId('confidence-badge')
    const tier = badge.getAttribute('data-confidence-tier')
    expect(tier).toBe('low')
    expect(tier).not.toBe('medium')
    expect(badge).toHaveTextContent('Low')
    expect(badge).toHaveTextContent('50%')
  })
})
