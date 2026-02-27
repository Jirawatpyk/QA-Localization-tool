import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// ── Test data ──

const ZERO_SPEND_PROJECT = {
  projectId: 'c3d4e5f6-a7b8-4c3d-ae4f-5a6b7c8d9e0f',
  projectName: 'Zero Spend Project',
  totalCostUsd: 0,
  filesProcessed: 0,
  monthlyBudgetUsd: 100,
  budgetAlertThresholdPct: 80,
}

const ACTIVE_PROJECT = {
  projectId: 'd4e5f6a7-b8c9-4d4e-bf50-6a7b8c9d0e1f',
  projectName: 'Active Project',
  totalCostUsd: 75.5,
  filesProcessed: 15,
  monthlyBudgetUsd: 100,
  budgetAlertThresholdPct: 80,
}

const WARNING_PROJECT = {
  projectId: 'e5f6a7b8-c9d0-4e5f-c061-7b8c9d0e1f2a',
  projectName: 'Warning Project',
  totalCostUsd: 85.0,
  filesProcessed: 20,
  monthlyBudgetUsd: 100,
  budgetAlertThresholdPct: 80,
}

const EXCEEDED_PROJECT = {
  projectId: 'f6a7b8c9-d0e1-4f6a-d172-8c9d0e1f2a3b',
  projectName: 'Exceeded Project',
  totalCostUsd: 105.0,
  filesProcessed: 30,
  monthlyBudgetUsd: 100,
  budgetAlertThresholdPct: 80,
}

describe('AiSpendByProjectTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P0: Core rendering ──

  it('should render empty state when projects array is empty', async () => {
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[]} />)

    expect(screen.getByTestId('ai-project-table-empty')).toBeTruthy()
  })

  it('should render a row for each project in the data', async () => {
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[ZERO_SPEND_PROJECT, ACTIVE_PROJECT]} />)

    expect(screen.getByText('Zero Spend Project')).toBeTruthy()
    expect(screen.getByText('Active Project')).toBeTruthy()
  })

  it('should show $0.00 for zero-spend projects and not exclude them', async () => {
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[ZERO_SPEND_PROJECT]} />)

    const row = screen.getByTestId(`ai-project-row-${ZERO_SPEND_PROJECT.projectId}`)
    expect(row.textContent).toContain('0.00')
  })

  it('should display formatted totalCostUsd for active project', async () => {
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[ACTIVE_PROJECT]} />)

    const row = screen.getByTestId(`ai-project-row-${ACTIVE_PROJECT.projectId}`)
    expect(row.textContent).toContain('75.50')
  })

  // ── P1: Budget color coding ──

  it('should show green budget indicator when spend is below alert threshold', async () => {
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[ACTIVE_PROJECT]} />)

    // 75.5% — below 80% threshold → ok (green)
    const indicator = screen.getByTestId(`ai-budget-indicator-${ACTIVE_PROJECT.projectId}`)
    expect(indicator.getAttribute('data-status')).toBe('ok')
  })

  it('should show yellow budget indicator when spend is at or above alert threshold', async () => {
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[WARNING_PROJECT]} />)

    // 85% — above 80% threshold → warning (yellow)
    const indicator = screen.getByTestId(`ai-budget-indicator-${WARNING_PROJECT.projectId}`)
    expect(indicator.getAttribute('data-status')).toBe('warning')
  })

  // ── P1-BV: Budget exceeded boundary ──

  it('should show red budget indicator when spend is at or above 100% (exceeded)', async () => {
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[EXCEEDED_PROJECT]} />)

    // 105% — over 100% → exceeded (red)
    const indicator = screen.getByTestId(`ai-budget-indicator-${EXCEEDED_PROJECT.projectId}`)
    expect(indicator.getAttribute('data-status')).toBe('exceeded')
  })
})
