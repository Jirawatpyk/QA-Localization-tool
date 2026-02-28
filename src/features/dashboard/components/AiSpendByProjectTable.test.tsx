import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

const UNLIMITED_PROJECT = {
  projectId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  projectName: 'Unlimited Project',
  totalCostUsd: 50.0,
  filesProcessed: 10,
  monthlyBudgetUsd: null,
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

  // ── Story 3.1b — AC2: Sortable Table + aria-sort ──

  it('should default to Cost (Month) descending sort order (highest first)', async () => {
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[ZERO_SPEND_PROJECT, ACTIVE_PROJECT]} />)

    // ACTIVE_PROJECT ($75.50) must appear before ZERO_SPEND_PROJECT ($0.00)
    const rows = screen.getAllByTestId(/^ai-project-row-/)
    expect(rows[0]?.textContent).toContain('75.50')
    expect(rows[1]?.textContent).toContain('0.00')
  })

  it('should sort Cost ascending on first Cost column header click', async () => {
    const user = userEvent.setup()
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[ZERO_SPEND_PROJECT, ACTIVE_PROJECT]} />)

    const costHeader = screen.getByTestId('ai-project-sort-cost')
    await user.click(costHeader)

    // ascending: $0.00 first, $75.50 second
    const rows = screen.getAllByTestId(/^ai-project-row-/)
    expect(rows[0]?.textContent).toContain('0.00')
    expect(rows[1]?.textContent).toContain('75.50')
  })

  it('should sort Cost descending on second Cost column header click', async () => {
    const user = userEvent.setup()
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[ZERO_SPEND_PROJECT, ACTIVE_PROJECT]} />)

    const costHeader = screen.getByTestId('ai-project-sort-cost')
    await user.click(costHeader) // 1st click → ascending
    await user.click(costHeader) // 2nd click → back to descending

    const rows = screen.getAllByTestId(/^ai-project-row-/)
    expect(rows[0]?.textContent).toContain('75.50')
    expect(rows[1]?.textContent).toContain('0.00')
  })

  it('should sort Budget % ascending on Budget % column header click', async () => {
    const user = userEvent.setup()
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    // EXCEEDED (105%) vs ZERO_SPEND (0%) — ascending: zero first
    render(<AiSpendByProjectTable projects={[EXCEEDED_PROJECT, ZERO_SPEND_PROJECT]} />)

    const budgetHeader = screen.getByTestId('ai-project-sort-budget')
    await user.click(budgetHeader)

    const rows = screen.getAllByTestId(/^ai-project-row-/)
    expect(rows[0]?.textContent).toContain('Zero Spend Project')
  })

  it('should show ↓ indicator on Cost header by default (descending); ↑ after first click', async () => {
    const user = userEvent.setup()
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[ACTIVE_PROJECT]} />)

    const costHeader = screen.getByTestId('ai-project-sort-cost')
    expect(costHeader.textContent).toContain('↓')

    await user.click(costHeader)
    expect(costHeader.textContent).toContain('↑')
  })

  it('should have aria-sort="descending" on Cost header by default', async () => {
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[ACTIVE_PROJECT]} />)

    const costHeader = screen.getByTestId('ai-project-sort-cost')
    expect(costHeader.getAttribute('aria-sort')).toBe('descending')
  })

  it('should have aria-sort="none" on Budget % header by default (not the active sort)', async () => {
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[ACTIVE_PROJECT]} />)

    const budgetHeader = screen.getByTestId('ai-project-sort-budget')
    expect(budgetHeader.getAttribute('aria-sort')).toBe('none')
  })

  // ── Story 3.1b — M2 fix: unlimited budget (null) case ──

  it('should show "Unlimited" text and data-status="ok" for projects with null monthlyBudgetUsd', async () => {
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[UNLIMITED_PROJECT]} />)

    const row = screen.getByTestId(`ai-project-row-${UNLIMITED_PROJECT.projectId}`)
    expect(row.textContent).toContain('Unlimited')

    const indicator = screen.getByTestId(`ai-budget-indicator-${UNLIMITED_PROJECT.projectId}`)
    expect(indicator.getAttribute('data-status')).toBe('ok')
  })

  it('should include unlimited budget projects in cost sort (cost desc: higher cost first)', async () => {
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[UNLIMITED_PROJECT, EXCEEDED_PROJECT]} />)

    // default: cost desc — EXCEEDED($105) first, UNLIMITED($50) second
    const rows = screen.getAllByTestId(/^ai-project-row-/)
    expect(rows[0]?.textContent).toContain('105')
    expect(rows[1]?.textContent).toContain('50')
  })

  // ── Story 3.1b CR R1 — H2: aria-sort transitions after column switch ──

  it('should set aria-sort="ascending" on Budget header and "none" on Cost after clicking Budget', async () => {
    const user = userEvent.setup()
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[ACTIVE_PROJECT]} />)

    await user.click(screen.getByTestId('ai-project-sort-budget'))

    expect(screen.getByTestId('ai-project-sort-budget').getAttribute('aria-sort')).toBe('ascending')
    expect(screen.getByTestId('ai-project-sort-cost').getAttribute('aria-sort')).toBe('none')
  })

  // ── Story 3.1b CR R1 — M3: Guardrail #12 sort reset on projects prop change ──

  it('should reset sort to default (cost desc) when projects prop changes', async () => {
    const user = userEvent.setup()
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    const { rerender } = render(<AiSpendByProjectTable projects={[ACTIVE_PROJECT]} />)

    // Change sort to ascending
    await user.click(screen.getByTestId('ai-project-sort-cost'))
    expect(screen.getByTestId('ai-project-sort-cost').getAttribute('aria-sort')).toBe('ascending')

    // Simulate period/filter change — new projects array reference resets sort
    rerender(<AiSpendByProjectTable projects={[ZERO_SPEND_PROJECT, ACTIVE_PROJECT]} />)

    // Sort must reset to default: cost descending
    expect(screen.getByTestId('ai-project-sort-cost').getAttribute('aria-sort')).toBe('descending')
  })

  // ── Story 3.1b CR R1 — M4: Budget % sort toggle cycle (second click → descending) ──

  it('should sort Budget % descending on second Budget % column header click', async () => {
    const user = userEvent.setup()
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[EXCEEDED_PROJECT, ZERO_SPEND_PROJECT]} />)

    const budgetHeader = screen.getByTestId('ai-project-sort-budget')
    await user.click(budgetHeader) // 1st click → ascending (zero first)
    await user.click(budgetHeader) // 2nd click → descending (exceeded first)

    const rows = screen.getAllByTestId(/^ai-project-row-/)
    expect(rows[0]?.textContent).toContain('Exceeded Project')
  })

  // ── Story 3.1b CR R1 — L3: Unlimited budget (null) in Budget % sort ──

  it('should treat unlimited budget (null) as 0% in Budget % ascending sort (unlimited appears first)', async () => {
    const user = userEvent.setup()
    const { AiSpendByProjectTable } = await import('./AiSpendByProjectTable')
    render(<AiSpendByProjectTable projects={[EXCEEDED_PROJECT, UNLIMITED_PROJECT]} />)

    await user.click(screen.getByTestId('ai-project-sort-budget'))

    // ascending budget %: UNLIMITED_PROJECT (null → 0%) before EXCEEDED_PROJECT (105%)
    const rows = screen.getAllByTestId(/^ai-project-row-/)
    expect(rows[0]?.textContent).toContain('Unlimited Project')
    expect(rows[1]?.textContent).toContain('Exceeded Project')
  })
})
