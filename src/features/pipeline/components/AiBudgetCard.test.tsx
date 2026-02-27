import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// ── Test data helpers ──

type _AiBudgetCardProps = {
  usedBudgetUsd: number
  monthlyBudgetUsd: number | null
  budgetAlertThresholdPct?: number // default 80
}

describe('AiBudgetCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P0: Core rendering ──

  it('should render green progress bar when usage is below alert threshold', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={50} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    // 50% usage — below 80% threshold → green
    expect(progressBar.getAttribute('aria-valuenow')).toBe('50')
    expect(progressBar.className).toMatch(/green/)
    // RED: AiBudgetCard.tsx not yet created
  })

  it('should render yellow progress bar when usage equals alert threshold (80%)', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={80} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    // 80% — at threshold → yellow
    expect(progressBar.getAttribute('aria-valuenow')).toBe('80')
    expect(progressBar.className).toMatch(/yellow|orange/)
    // RED: threshold color logic not yet implemented
  })

  it('should render red progress bar when usage is at or above 100%', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={100} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    // 100% — exceeded → red
    expect(progressBar.getAttribute('aria-valuenow')).toBe('100')
    expect(progressBar.className).toMatch(/red/)
    // RED: exceeded color logic not yet implemented
  })

  it("should display spend text: '$X.XX / $Y.YY used'", async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={12.4} monthlyBudgetUsd={50} budgetAlertThresholdPct={80} />)

    const spendText = screen.getByTestId('ai-budget-spend')
    expect(spendText.textContent).toContain('12.40')
    expect(spendText.textContent).toContain('50.00')
    // RED: formatted spend display not yet created
  })

  it("should show 'No budget limit set' text when budget is null (unlimited)", async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={25} monthlyBudgetUsd={null} budgetAlertThresholdPct={80} />)

    expect(screen.getByTestId('ai-budget-unlimited')).toBeTruthy()
    expect(screen.getByText(/No budget limit set/i)).toBeTruthy()
    // Progress bar should NOT be shown when unlimited
    expect(screen.queryByTestId('ai-budget-progress')).toBeNull()
    // RED: unlimited state not yet implemented
  })

  // ── P1: Additional states ──

  it("should show 'Budget exceeded — AI processing paused' when over 100%", async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={101} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const statusBadge = screen.getByTestId('ai-budget-status')
    expect(statusBadge.textContent).toContain('Budget exceeded')
    // RED: over-budget status text not yet implemented
  })

  // ── P1-BV: Boundary value tests (Epic 2 retro A2 mandate) ──

  it('should render green at 79% usage (below 80% threshold)', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={79} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    // 79% — below threshold → green
    expect(progressBar.className).toMatch(/green/)
    expect(progressBar.className).not.toMatch(/yellow|orange|red/)
    // RED: boundary — 79% must be green
  })

  it('should render yellow at exactly 80% usage (at threshold)', async () => {
    const { AiBudgetCard } = await import('./AiBudgetCard')
    render(<AiBudgetCard usedBudgetUsd={80} monthlyBudgetUsd={100} budgetAlertThresholdPct={80} />)

    const progressBar = screen.getByTestId('ai-budget-progress')
    // 80% — exactly at threshold → yellow (not green)
    expect(progressBar.className).toMatch(/yellow|orange/)
    expect(progressBar.className).not.toMatch(/green/)
    // RED: boundary — 80% must flip to yellow
  })
})
