/** Story 3.3 ATDD — AC6: ScoreBadge 'deep-analyzed' (gold) State — RED PHASE (TDD) */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { ScoreBadgeState } from '@/types/finding'

import { ScoreBadge } from './ScoreBadge'

// Helper to mock prefers-reduced-motion
function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('ScoreBadge — Story 3.3: Deep Analyzed State', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion(false)
  })

  it('[P0] U25: should render gold "Deep Analyzed" badge when state=deep-analyzed', () => {
    render(<ScoreBadge score={88} state="deep-analyzed" size="md" />)

    const container = screen.getByTestId('score-badge')
    // Should use gold/deep-analyzed color scheme (not ai-screened purple)
    expect(container.className).toMatch(/deep-analyzed/)
    // Should NOT show 'AI Screened' label
    expect(screen.queryByText('AI Screened')).toBeNull()
    // Should show 'Deep Analyzed' label
    expect(screen.getByText('Deep Analyzed')).toBeTruthy()
    // Score should still display correctly
    expect(screen.getByText('88.0')).toBeTruthy()
  })
})
