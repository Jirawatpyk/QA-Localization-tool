/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ScoreBadge } from './ScoreBadge'

describe('ScoreBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P2: Score threshold styles ──

  it.skip('[P2] should render green/success style when score >= 95', () => {
    // EXPECTED: Badge shows score "98.0" with success variant styling
    // (e.g., bg-success, text-success-foreground, or data-variant="success")
    render(<ScoreBadge score={98.0} />)

    const badge = screen.getByText('98.0')
    expect(badge).toBeTruthy()
    // Should use success/green semantic class — NOT hex values
    expect(badge.className).toMatch(/success|green/)
  })

  it.skip('[P2] should render yellow/warning style when score is 80-94', () => {
    // EXPECTED: Badge shows score "87.3" with warning variant styling
    render(<ScoreBadge score={87.3} />)

    const badge = screen.getByText('87.3')
    expect(badge).toBeTruthy()
    expect(badge.className).toMatch(/warning|yellow/)
  })

  it.skip('[P2] should render red/destructive style when score < 80', () => {
    // EXPECTED: Badge shows score "65.2" with destructive variant styling
    render(<ScoreBadge score={65.2} />)

    const badge = screen.getByText('65.2')
    expect(badge).toBeTruthy()
    expect(badge.className).toMatch(/destructive|red/)
  })

  it.skip('[P2] should render gray/muted style when score is null', () => {
    // EXPECTED: Badge shows "N/A" or "—" with muted/gray variant styling
    render(<ScoreBadge score={null} />)

    // Should display a placeholder text, not a number
    const badge = screen.getByText(/N\/A|—/)
    expect(badge).toBeTruthy()
    expect(badge.className).toMatch(/muted|gray|secondary/)
  })

  it.skip('[P2] should display score value rounded to 1 decimal place', () => {
    // EXPECTED: 92.456 → "92.5" (rounded to 1dp, not raw float)
    render(<ScoreBadge score={92.456} />)

    expect(screen.getByText('92.5')).toBeTruthy()
    expect(screen.queryByText('92.456')).toBeNull()
  })

  // ── P2: Boundary value tests ──

  it.skip('[P2] should render green at exactly 95.0', () => {
    // EXPECTED: 95.0 is the threshold for success — should be green
    render(<ScoreBadge score={95.0} />)

    const badge = screen.getByText('95.0')
    expect(badge.className).toMatch(/success|green/)
  })

  it.skip('[P2] should render yellow at exactly 94.9', () => {
    // EXPECTED: 94.9 is just below success threshold — should be warning
    render(<ScoreBadge score={94.9} />)

    const badge = screen.getByText('94.9')
    expect(badge.className).toMatch(/warning|yellow/)
  })

  it.skip('[P2] should render yellow at exactly 80.0', () => {
    // EXPECTED: 80.0 is the lower boundary of warning — should be yellow
    render(<ScoreBadge score={80.0} />)

    const badge = screen.getByText('80.0')
    expect(badge.className).toMatch(/warning|yellow/)
  })

  it.skip('[P2] should render red at exactly 79.9', () => {
    // EXPECTED: 79.9 is just below warning threshold — should be destructive/red
    render(<ScoreBadge score={79.9} />)

    const badge = screen.getByText('79.9')
    expect(badge.className).toMatch(/destructive|red/)
  })
})
