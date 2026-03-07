/** Story 3.4 ATDD — ScoreBadge partial state — RED PHASE */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { ScoreBadgeState } from '@/types/finding' // eslint-disable-line @typescript-eslint/no-unused-vars

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

describe('ScoreBadge — partial state (Story 3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion(false)
  })

  // T23
  it('[P0] should render "Partial" label when state=partial', () => {
    render(<ScoreBadge score={85} state="partial" size="md" />)

    // The badge must show "Partial" label
    expect(screen.getByText('Partial')).toBeTruthy()
    // Must NOT show misleading labels
    expect(screen.queryByText('Passed')).toBeNull()
    expect(screen.queryByText('Review')).toBeNull()
    expect(screen.queryByText('Fail')).toBeNull()
  })

  it('[P0] should apply orange styling for partial state', () => {
    render(<ScoreBadge score={85} state="partial" size="sm" />)

    const container = screen.getByTestId('score-badge')
    // Orange/warning color class expected (e.g., text-status-partial, bg-orange, text-warning)
    expect(container.className).toMatch(/partial|orange|warning/i)
    // Must NOT use pass (green), fail (red), or review (yellow/amber) colors
    expect(container.className).not.toMatch(/status-pass|status-fail/)
  })

  // T67
  it('[P0] should show partial (not pass) when score=100 and scoreStatus=partial', () => {
    render(<ScoreBadge score={100} state="partial" size="md" />)

    expect(screen.getByText('Partial')).toBeTruthy()
    // 'Passed' must NOT appear even though score is 100
    expect(screen.queryByText('Passed')).toBeNull()
    // Score value should still display
    expect(screen.getByText('100.0')).toBeTruthy()
  })

  // T68
  it('[P1] should show partial (not review) when score=94.9 and scoreStatus=partial', () => {
    render(<ScoreBadge score={94.9} state="partial" size="md" />)

    expect(screen.getByText('Partial')).toBeTruthy()
    expect(screen.queryByText('Review')).toBeNull()
    expect(screen.getByText('94.9')).toBeTruthy()
  })

  // T69
  it('[P1] should show partial (not fail) when score=69.9 and scoreStatus=partial', () => {
    render(<ScoreBadge score={69.9} state="partial" size="md" />)

    expect(screen.getByText('Partial')).toBeTruthy()
    expect(screen.queryByText('Fail')).toBeNull()
    expect(screen.getByText('69.9')).toBeTruthy()
  })

  // ── TA: BVA Gaps ──

  // F19+B5 [P2]: score=null and score=0 with partial state
  it('[P2] should show Partial label when score is null', () => {
    render(<ScoreBadge score={null} state="partial" size="md" />)

    expect(screen.getByText('Partial')).toBeTruthy()
    expect(screen.queryByText('Passed')).toBeNull()
  })

  it('[P2] should show Partial + "0.0" when score=0 and state=partial', () => {
    render(<ScoreBadge score={0} state="partial" size="md" />)

    expect(screen.getByText('Partial')).toBeTruthy()
    expect(screen.getByText('0.0')).toBeTruthy()
    expect(screen.queryByText('Fail')).toBeNull()
  })
})
