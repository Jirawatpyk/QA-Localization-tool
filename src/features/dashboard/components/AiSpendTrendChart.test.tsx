import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children, data }: { children: React.ReactNode; data?: unknown[] }) => (
    <div data-testid="recharts-line-chart" data-count={data?.length ?? 0}>
      {children}
    </div>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

// ── Test data: 7 pre-scaffolded points ──

const TREND_DATA_7D = Array.from({ length: 7 }, (_, i) => {
  const d = new Date('2026-02-21T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + i)
  return {
    date: d.toISOString().split('T')[0] as string,
    totalCostUsd: i === 3 ? 2.5 : 0,
    l2CostUsd: i === 3 ? 1.0 : 0,
    l3CostUsd: i === 3 ? 1.5 : 0,
  }
})

const ZERO_TREND_DATA = Array.from({ length: 7 }, (_, i) => {
  const d = new Date('2026-02-21T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + i)
  return {
    date: d.toISOString().split('T')[0] as string,
    totalCostUsd: 0,
    l2CostUsd: 0,
    l3CostUsd: 0,
  }
})

describe('AiSpendTrendChart', () => {
  // ── P0: Core rendering ──

  it('should render LineChart container when data is provided', async () => {
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={TREND_DATA_7D} />)

    expect(screen.getByTestId('recharts-line-chart')).toBeTruthy()
  })

  it('should render all data points (no sparse gaps — all 7 present)', async () => {
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={TREND_DATA_7D} />)

    // Container exists
    const chartContainer = screen.getByTestId('ai-trend-chart-container')
    expect(chartContainer).toBeTruthy()
    // All 7 data points must be passed to the chart (no sparse filtering)
    const lineChart = screen.getByTestId('recharts-line-chart')
    expect(lineChart.getAttribute('data-count')).toBe('7')
  })

  it('should show L2/L3 toggle buttons to switch view mode', async () => {
    const user = userEvent.setup()
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={TREND_DATA_7D} />)

    const l2l3Toggle = screen.getByTestId('ai-trend-l2l3-toggle')
    expect(l2l3Toggle).toBeTruthy()

    // Clicking toggle should change the view (no error thrown)
    await user.click(l2l3Toggle)
    // Component still renders after toggle
    expect(screen.getByTestId('recharts-line-chart')).toBeTruthy()
  })

  // ── P1-BV: Zero data handling ──

  it('should render chart (not empty state) when all data points are $0.00', async () => {
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={ZERO_TREND_DATA} />)

    // Action guarantees 7 points even when all $0 — chart still renders
    expect(screen.getByTestId('recharts-line-chart')).toBeTruthy()
    expect(screen.queryByTestId('ai-trend-chart-empty')).toBeNull()
  })

  // ── Story 3.1b — AC4: aria-pressed on L2/L3 toggle ──

  it('should have aria-pressed="false" on L2/L3 toggle by default (total view)', async () => {
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={TREND_DATA_7D} />)

    const toggle = screen.getByTestId('ai-trend-l2l3-toggle')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('should have aria-pressed="true" on L2/L3 toggle after clicking (breakdown view)', async () => {
    const user = userEvent.setup()
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={TREND_DATA_7D} />)

    const toggle = screen.getByTestId('ai-trend-l2l3-toggle')
    await user.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('should toggle aria-pressed back to "false" on second click (back to total view)', async () => {
    const user = userEvent.setup()
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={TREND_DATA_7D} />)

    const toggle = screen.getByTestId('ai-trend-l2l3-toggle')
    await user.click(toggle) // → breakdown (true)
    await user.click(toggle) // → total (false)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  // ── Story 3.1b CR R2 — M4: Toggle button label text change ──

  it('should show "Show L2/L3 Breakdown" by default and "Show Total" after click', async () => {
    const user = userEvent.setup()
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={TREND_DATA_7D} />)

    const toggle = screen.getByTestId('ai-trend-l2l3-toggle')
    expect(toggle.textContent).toBe('Show L2/L3 Breakdown')

    await user.click(toggle)
    expect(toggle.textContent).toBe('Show Total')
  })
})
