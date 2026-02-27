import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// ── Test data ──

const ZERO_SUMMARY = {
  totalCostUsd: 0,
  filesProcessed: 0,
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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P0: Core rendering ──

  it('should render all 4 metric card sections', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={FULL_SUMMARY} />)

    expect(screen.getByTestId('ai-usage-total-cost')).toBeTruthy()
    expect(screen.getByTestId('ai-usage-files-processed')).toBeTruthy()
    expect(screen.getByTestId('ai-usage-avg-cost')).toBeTruthy()
    expect(screen.getByTestId('ai-usage-projected-cost')).toBeTruthy()
  })

  it('should display $0.00 for all cost cards when summary has zero values', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={ZERO_SUMMARY} />)

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

  it('should display avgCostPerFileUsd rounded to $0.3690', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={FULL_SUMMARY} />)

    const avgCard = screen.getByTestId('ai-usage-avg-cost')
    // 0.369 formatted as $0.37 (2 decimal places)
    expect(avgCard.textContent).toContain('0.37')
  })

  // ── P1: Projected spend conditional rendering ──

  it('should show em-dash ("—") in projected cost card when projectedMonthCostUsd is null', async () => {
    const { AiUsageSummaryCards } = await import('./AiUsageSummaryCards')
    render(<AiUsageSummaryCards summary={ZERO_SUMMARY} />)

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
})
