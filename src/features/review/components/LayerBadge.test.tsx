/**
 * ATDD Tests — Story 3.2c: L2 Results Display & Score Update
 * AC9: Layer indicator (Rule vs AI)
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { LayerBadge } from '@/features/review/components/LayerBadge'

describe('LayerBadge', () => {
  // ── P1: Layer display variants ──

  it('[P1] should render "Rule" blue badge for layer=L1', () => {
    render(<LayerBadge layer="L1" />)

    const badge = screen.getByTestId('layer-badge')
    expect(badge).toHaveTextContent('Rule')
    expect(badge.className).toMatch(/info|rule/i)
  })

  it('[P1] should render "AI" purple badge for layer=L2', () => {
    render(<LayerBadge layer="L2" />)

    const badge = screen.getByTestId('layer-badge')
    expect(badge).toHaveTextContent('AI')
    expect(badge.className).toMatch(/purple|ai/i)
  })

  it('[P1] should render "AI" purple badge for layer=L3', () => {
    render(<LayerBadge layer="L3" />)

    const badge = screen.getByTestId('layer-badge')
    expect(badge).toHaveTextContent('AI')
    expect(badge.className).toMatch(/purple|ai/i)
  })

  it('[P1] should use design token color (status-ai-screened) for AI badge', () => {
    render(<LayerBadge layer="L2" />)

    const badge = screen.getByTestId('layer-badge')
    // Class should reference the design token (--color-status-ai-screened) via utility class
    expect(badge.className).toMatch(/status-ai-screened/)
  })
})
