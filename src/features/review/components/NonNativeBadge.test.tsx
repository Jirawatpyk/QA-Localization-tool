/**
 * ATDD Tests — Story 5.2a: Non-Native Auto-Tag
 * AC4: NonNativeBadge component — icon + text + accessibility
 *
 * TDD RED PHASE — all tests skipped until component implemented.
 * Guardrails: #25 (color not sole info), #36 (severity display: icon + text + color)
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { NonNativeBadge } from '@/features/review/components/NonNativeBadge'

describe('NonNativeBadge (Story 5.2a)', () => {
  // ── AC4: Badge renders with icon + text ──

  it('[P1][AC4] should render Eye icon and "Subject to native audit" text', () => {
    // Arrange & Act
    render(<NonNativeBadge />)

    // Assert: text content
    expect(screen.getByText('Subject to native audit')).toBeInTheDocument()

    // Assert: Eye icon exists (lucide-react renders svg)
    const icon = document.querySelector('svg')
    expect(icon).not.toBeNull()
  })

  // ── AC4: Icon is decorative (aria-hidden) ──

  it('[P1][AC4] should have aria-hidden="true" on icon (text is the accessible label)', () => {
    render(<NonNativeBadge />)

    const icon = document.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
  })

  // ── AC4: Icon meets minimum size (16px = h-4 w-4) ──

  it('[P1][AC4] should render icon with h-4 w-4 class (16px min per Guardrail #36)', () => {
    render(<NonNativeBadge />)

    const icon = document.querySelector('svg')
    expect(icon).not.toBeNull()
    expect(icon?.classList.contains('h-4')).toBe(true)
    expect(icon?.classList.contains('w-4')).toBe(true)
  })

  // ── AC4: Uses muted-foreground color (NOT severity color) ──

  it('[P1][AC4] should use text-muted-foreground (audit tag, not severity indicator)', () => {
    render(<NonNativeBadge />)

    const badge = screen.getByText('Subject to native audit').closest('span, div')
    expect(badge).not.toBeNull()
    // Badge container or text should have muted-foreground styling
    expect(badge?.className).toMatch(/text-muted-foreground/)
  })
})
