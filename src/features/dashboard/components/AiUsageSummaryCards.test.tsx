import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

// ── Test data ──

const ZERO_SUMMARY = {
  totalCostUsd: 0,
  filesProcessed: 0,
  avgCostPerFileUsd: 0,
  projectedMonthCostUsd: null,
}

// filesProcessed=1 but $0 cost — does NOT trigger empty state (only both=0 does)
const ZERO_COST_SUMMARY = {
  totalCostUsd: 0,
  filesProcessed: 1,
  avgCostPerFileUsd: 0,
  projectedMonthCostUsd: null,
}

const FULL_SUMMARY = {
  totalCostUsd: 15.5,
  filesProcessed: 42,
  avgCostPerFileUsd: 0.369,
  projectedMonthCostUsd: 25.75,
}

describe('AiUsageSummaryCards', () => {
  // ── P0: Core rendering ──

  it('should render all 4 metric card sections', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={FULL_SUMMARY} />)

    expect(screen.getByTestId('ai-usage-total-cost')).toBeTruthy()
    expect(screen.getByTestId('ai-usage-files-processed')).toBeTruthy()
    expect(screen.getByTestId('ai-usage-avg-cost')).toBeTruthy()
    expect(screen.getByTestId('ai-usage-projected-cost')).toBeTruthy()
  })

  it('should display $0.00 for cost cards when totalCostUsd is 0 but files exist', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={ZERO_COST_SUMMARY} />)

    const totalCostCard = screen.getByTestId('ai-usage-total-cost')
    expect(totalCostCard.textContent).toContain('0.00')
  })

  it('should display formatted totalCostUsd as $X.XX', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={FULL_SUMMARY} />)

    const totalCostCard = screen.getByTestId('ai-usage-total-cost')
    // $15.50 formatted
    expect(totalCostCard.textContent).toContain('15.50')
  })

  it('should display correct filesProcessed count', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={FULL_SUMMARY} />)

    const filesCard = screen.getByTestId('ai-usage-files-processed')
    expect(filesCard.textContent).toContain('42')
  })

  it('should display avgCostPerFileUsd rounded to $0.37 (2 decimal places)', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={FULL_SUMMARY} />)

    const avgCard = screen.getByTestId('ai-usage-avg-cost')
    // 0.369 formatted as $0.37 (2 decimal places)
    expect(avgCard.textContent).toContain('0.37')
  })

  // ── P1: Projected spend conditional rendering ──

  it('should show em-dash ("—") in projected cost card when projectedMonthCostUsd is null', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={ZERO_COST_SUMMARY} />)

    const projectedCard = screen.getByTestId('ai-usage-projected-cost')
    // null means less than 5 days elapsed — show "—" placeholder
    expect(projectedCard.textContent).toContain('—')
  })

  // ── P1-BV: Boundary values ──

  it('should display projectedMonthCostUsd when not null (≥5 days elapsed)', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={FULL_SUMMARY} />)

    const projectedCard = screen.getByTestId('ai-usage-projected-cost')
    // projectedMonthCostUsd=25.75 → should display $25.75
    expect(projectedCard.textContent).toContain('25.75')
  })

  // ── Story 3.1b — AC1: Empty State + Label Corrections ──

  it('should show empty-state message when filesProcessed===0 AND totalCostUsd===0', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={ZERO_SUMMARY} />)

    expect(screen.getByTestId('ai-usage-empty-state')).toBeTruthy()
    expect(screen.getByText(/No AI processing recorded yet/)).toBeTruthy()
  })

  it('should NOT show empty-state message when data exists (totalCostUsd > 0)', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={FULL_SUMMARY} />)

    expect(screen.queryByTestId('ai-usage-empty-state')).toBeNull()
  })

  it('should display card label "Total AI Cost (MTD)" instead of old label', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={FULL_SUMMARY} />)

    expect(screen.getByText('Total AI Cost (MTD)')).toBeTruthy()
  })

  it('should display card label "Projected Month Cost" instead of old label', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={FULL_SUMMARY} />)

    expect(screen.getByText('Projected Month Cost')).toBeTruthy()
  })

  // ── Story 3.1b — AC1-BV: Empty state boundary (AND condition) ──

  it('should NOT show empty-state when filesProcessed===0 but totalCostUsd===0.01 (BV: only BOTH zero triggers)', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={{ ...ZERO_SUMMARY, totalCostUsd: 0.01 }} />)

    expect(screen.queryByTestId('ai-usage-empty-state')).toBeNull()
  })

  it('should NOT show empty-state when filesProcessed===1 but totalCostUsd===0 (BV: only BOTH zero triggers)', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={ZERO_COST_SUMMARY} />)

    expect(screen.queryByTestId('ai-usage-empty-state')).toBeNull()
  })
})
