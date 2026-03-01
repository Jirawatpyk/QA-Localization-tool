/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('ScoreBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion(false)
  })

  // -- AC1: Size Variants (4 tests, P1) --

  describe('AC1: Size Variants', () => {
    it('[P1] should render sm size with text-xs class by default', () => {
      render(<ScoreBadge score={90} />)

      const badge = screen.getByText('90.0')
      expect(badge.className).toMatch(/text-xs/)
    })

    it('[P1] should render md size with text-2xl class', () => {
      render(<ScoreBadge score={90} size="md" />)

      const badge = screen.getByText('90.0')
      expect(badge.className).toMatch(/text-2xl/)
    })

    it('[P1] should render lg size with text-5xl class', () => {
      render(<ScoreBadge score={90} size="lg" />)

      const badge = screen.getByText('90.0')
      expect(badge.className).toMatch(/text-5xl/)
    })

    it('[P1] should default to sm when size prop is not provided', () => {
      render(<ScoreBadge score={88} />)

      const badge = screen.getByText('88.0')
      // sm size should use text-xs — same as explicit size="sm"
      expect(badge.className).toMatch(/text-xs/)
      expect(badge.className).not.toMatch(/text-2xl|text-5xl/)
    })
  })

  // -- AC2: State Values (5 tests, P0) --

  describe('AC2: State Values', () => {
    it('[P0] should render pass state with status-pass color and "Passed" label', () => {
      render(<ScoreBadge score={98} state="pass" size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pass/)
      expect(screen.getByText('Passed')).toBeTruthy()
    })

    it('[P0] should render review state with status-pending color and "Review" label', () => {
      render(<ScoreBadge score={85} state="review" size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pending/)
      expect(screen.getByText('Review')).toBeTruthy()
    })

    it('[P0] should render fail state with status-fail color and "Fail" label', () => {
      render(<ScoreBadge score={55} state="fail" size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-fail/)
      expect(screen.getByText('Fail')).toBeTruthy()
    })

    it('[P0] should render analyzing state with status-analyzing color and "Analyzing..." label', () => {
      render(<ScoreBadge score={75} state="analyzing" size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-analyzing/)
      expect(screen.getByText('Analyzing...')).toBeTruthy()
    })

    it('[P0] should render rule-only state with info color and "Rule-based" label', () => {
      render(<ScoreBadge score={92} state="rule-only" size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/bg-info\/10/)
      expect(container.className).toMatch(/text-info/)
      expect(screen.getByText('Rule-based')).toBeTruthy()
    })
  })

  // -- AC2: Auto-derivation (5 tests, P0) --

  describe('AC2: Auto-derivation', () => {
    it('[P0] should auto-derive pass when score=96 and criticalCount=0', () => {
      render(<ScoreBadge score={96} criticalCount={0} size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pass/)
      expect(screen.getByText('Passed')).toBeTruthy()
    })

    it('[P0] should auto-derive review when score=96 and criticalCount=1', () => {
      render(<ScoreBadge score={96} criticalCount={1} size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pending/)
      expect(screen.getByText('Review')).toBeTruthy()
    })

    it('[P0] should auto-derive review when score=85 (no criticalCount)', () => {
      render(<ScoreBadge score={85} size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pending/)
      expect(screen.getByText('Review')).toBeTruthy()
    })

    it('[P0] should auto-derive fail when score=65', () => {
      render(<ScoreBadge score={65} size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-fail/)
      expect(screen.getByText('Fail')).toBeTruthy()
    })

    it('[P0] should auto-derive muted/N-A when score=null', () => {
      render(<ScoreBadge score={null} />)

      const naBadge = screen.getByText('N/A')
      expect(naBadge).toBeTruthy()
      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/muted/)
    })
  })

  // -- AC2: State Display (3 tests, P1) --

  describe('AC2: State Display', () => {
    it('[P1] should use explicit state even when score would derive differently', () => {
      render(<ScoreBadge score={50} state="pass" size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pass/)
      expect(container.className).not.toMatch(/status-fail/)
    })

    it('[P1] should show label below score for lg variant', () => {
      render(<ScoreBadge score={98} state="pass" size="lg" />)

      expect(screen.getByText('98.0')).toBeTruthy()
      const label = screen.getByText('Passed')
      expect(label).toBeTruthy()
      // Label should NOT be visually hidden (sr-only)
      expect(label.className).not.toMatch(/sr-only/)
    })

    it('[P1] should show label below score for md variant', () => {
      render(<ScoreBadge score={98} state="pass" size="md" />)

      expect(screen.getByText('98.0')).toBeTruthy()
      const label = screen.getByText('Passed')
      expect(label).toBeTruthy()
      expect(label.className).not.toMatch(/sr-only/)
    })

    it('[P1] should show label as tooltip only for sm variant', () => {
      render(<ScoreBadge score={98} state="pass" size="sm" />)

      const badge = screen.getByText('98.0')
      // Label should be in title or aria-label, not as a separate visible element
      const container = badge.closest('[title]') ?? badge.closest('[aria-label]')
      expect(container).toBeTruthy()
      expect(container?.getAttribute('title') ?? container?.getAttribute('aria-label')).toBe(
        'Passed',
      )
      // Label must NOT be rendered as a standalone visible text node for sm
      expect(screen.queryByText('Passed')).toBeNull()
    })
  })

  // -- AC2: Boundary Values (8 tests, P0 -- MANDATORY) --

  describe('AC2: Boundary Values', () => {
    it('[P0] B1: should render Passed at score=95.0 with criticalCount=0 (at pass threshold)', () => {
      render(<ScoreBadge score={95.0} criticalCount={0} size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pass/)
      expect(screen.getByText('Passed')).toBeTruthy()
    })

    it('[P0] B2: should render Review at score=94.9 (below pass threshold)', () => {
      render(<ScoreBadge score={94.9} size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pending/)
      expect(screen.getByText('Review')).toBeTruthy()
    })

    it('[P0] B3: should render Review at score=70.0 (at fail boundary -- above it)', () => {
      render(<ScoreBadge score={70.0} size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pending/)
      expect(screen.getByText('Review')).toBeTruthy()
    })

    it('[P0] B4: should render Fail at score=69.9 (below fail boundary)', () => {
      render(<ScoreBadge score={69.9} size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-fail/)
      expect(screen.getByText('Fail')).toBeTruthy()
    })

    it('[P0] B5: should render N/A muted when score is null', () => {
      render(<ScoreBadge score={null} />)

      const naBadge = screen.getByText('N/A')
      expect(naBadge).toBeTruthy()
      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/muted/)
    })

    it('[P0] B6: should render Passed when criticalCount=0 at score=95', () => {
      render(<ScoreBadge score={95} criticalCount={0} size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pass/)
      expect(screen.getByText('Passed')).toBeTruthy()
    })

    it('[P0] B7: should render Review when criticalCount=1 at score=95', () => {
      render(<ScoreBadge score={95} criticalCount={1} size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pending/)
      expect(screen.getByText('Review')).toBeTruthy()
    })

    it('[P0] B8: should render Passed when criticalCount=undefined at score=96 (backward compat)', () => {
      render(<ScoreBadge score={96} size="md" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pass/)
      expect(screen.getByText('Passed')).toBeTruthy()
    })
  })

  // -- AC3: Analyzing Animation (3 tests, P1) --

  describe('AC3: Analyzing Animation', () => {
    it('[P1] should apply pulse animation class when state is analyzing', () => {
      render(<ScoreBadge score={75} state="analyzing" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/animate-pulse/)
    })

    it('[P1] should show reduced opacity (0.6) on score when analyzing', () => {
      render(<ScoreBadge score={75} state="analyzing" />)

      const badge = screen.getByText('75.0')
      expect(badge.className).toMatch(/opacity-60/)
    })

    it('[P1] should disable pulse animation when prefers-reduced-motion is enabled', () => {
      mockReducedMotion(true)

      render(<ScoreBadge score={75} state="analyzing" />)

      const container = screen.getByTestId('score-badge')
      expect(container.className).not.toMatch(/animate-pulse/)
    })
  })

  // -- AC4: Score Change Animation (3 tests, P2) --

  describe('AC4: Score Change Animation', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('[P2] should apply slide-up animation class when score increases', async () => {
      const { rerender } = render(<ScoreBadge score={80} />)

      rerender(<ScoreBadge score={90} />)

      const badge = screen.getByText('90.0')
      expect(badge.className).toMatch(/animate-slide-up/)

      // Verify class removed after 300ms timeout
      await vi.advanceTimersByTimeAsync(300)
      expect(badge.className).not.toMatch(/animate-slide-up/)
    })

    it('[P2] should apply slide-down animation class when score decreases', async () => {
      const { rerender } = render(<ScoreBadge score={90} />)

      rerender(<ScoreBadge score={75} />)

      const badge = screen.getByText('75.0')
      expect(badge.className).toMatch(/animate-slide-down/)

      // Verify class removed after 300ms timeout
      await vi.advanceTimersByTimeAsync(300)
      expect(badge.className).not.toMatch(/animate-slide-down/)
    })

    it('[P2] should disable slide animation when prefers-reduced-motion is enabled', () => {
      mockReducedMotion(true)

      const { rerender } = render(<ScoreBadge score={80} />)

      rerender(<ScoreBadge score={90} />)

      const badge = screen.getByText('90.0')
      expect(badge.className).not.toMatch(/animate-slide-up/)
      expect(badge.className).not.toMatch(/animate-slide-down/)
    })
  })

  // -- Backward Compat (1 test, P0) --

  describe('Backward Compatibility', () => {
    it('[P0] BC1: should render correctly with only score prop (backward compat with FileStatusCard)', () => {
      render(<ScoreBadge score={88} />)

      const badge = screen.getByText('88.0')
      expect(badge).toBeTruthy()
      // Should auto-derive review state (70 <= 88 < 95)
      const container = screen.getByTestId('score-badge')
      expect(container.className).toMatch(/status-pending/)
    })
  })
})
