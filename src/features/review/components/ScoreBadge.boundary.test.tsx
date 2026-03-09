/**
 * ATDD Tests — Story 3.2c: L2 Results Display & Score Update
 * AC11: Score threshold boundaries — integration-style boundary tests
 *
 * These tests verify the ScoreBadge deriveState behavior at critical
 * score thresholds and the interaction between L1/L2 scoring states.
 *
 * GREEN PHASE — all tests activated (Story 3.2c implementation).
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ScoreBadge } from '@/features/batch/components/ScoreBadge'
import { ReviewProgress } from '@/features/review/components/ReviewProgress'
import type { ProcessingMode, DbFileStatus } from '@/types/pipeline'

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

describe('ScoreBadge Boundary Tests (Story 3.2c AC11)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion(false)
  })

  // ── P0: Score threshold at fail boundary ──

  it('[P0] should derive "review" state for score=70 (at fail boundary, NOT fail)', () => {
    render(<ScoreBadge score={70} size="md" />)

    const container = screen.getByTestId('score-badge')
    expect(container.className).toMatch(/status-pending/)
    expect(screen.getByText('Review')).toBeTruthy()
    // Must NOT be fail
    expect(container.className).not.toMatch(/status-fail/)
  })

  it('[P0] should derive "fail" state for score=69.9 (below fail boundary)', () => {
    render(<ScoreBadge score={69.9} size="md" />)

    const container = screen.getByTestId('score-badge')
    expect(container.className).toMatch(/status-fail/)
    expect(screen.getByText('Fail')).toBeTruthy()
    // Must NOT be review
    expect(container.className).not.toMatch(/status-pending/)
  })

  // ── P0: Pass threshold with critical count interaction ──

  it('[P0] should derive "pass" for score=95 + 0 criticals', () => {
    render(<ScoreBadge score={95} criticalCount={0} size="md" />)

    const container = screen.getByTestId('score-badge')
    expect(container.className).toMatch(/status-pass/)
    expect(screen.getByText('Passed')).toBeTruthy()
  })

  it('[P0] should derive "review" for score=95 + 1 critical (critical blocks pass)', () => {
    render(<ScoreBadge score={95} criticalCount={1} size="md" />)

    const container = screen.getByTestId('score-badge')
    expect(container.className).toMatch(/status-pending/)
    expect(screen.getByText('Review')).toBeTruthy()
    // Must NOT be pass despite score >= 95
    expect(container.className).not.toMatch(/status-pass/)
  })

  // ── P0: Zero L2 findings — score unchanged, AI complete still shows ──

  it('[P0] should show AI complete even when zero L2 findings (score unchanged from L1)', () => {
    // L2 completed with no new findings — score stays the same, but AI processing is done
    render(
      <ReviewProgress
        reviewedCount={0}
        totalCount={0}
        fileStatus={'l2_completed' as DbFileStatus}
        processingMode={'economy' as ProcessingMode}
      />,
    )

    // AI track should show complete status with checkmark
    const aiTrack = screen.getByTestId('ai-status-track')
    expect(aiTrack).toHaveTextContent(/AI: complete/i)
    expect(aiTrack).toHaveTextContent(/✓/)
  })

  // ── P0: File with only L1 findings — rule-only state, no confidence badges ──

  it('[P0] should show "rule-only" state for file with only L1 findings', () => {
    render(<ScoreBadge score={85} state="rule-only" size="md" />)

    const container = screen.getByTestId('score-badge')
    expect(container.className).toMatch(/bg-info\/10/)
    expect(screen.getByText('Rule-based')).toBeTruthy()
  })
})
