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
  Line: ({ dataKey, name }: { dataKey?: string; name?: string }) => (
    <span data-testid={`line-${dataKey}`} data-name={name} />
  ),
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

    const chartContainer = screen.getByTestId('ai-trend-chart-container')
    expect(chartContainer).toBeTruthy()
    const lineChart = screen.getByTestId('recharts-line-chart')
    expect(lineChart.getAttribute('data-count')).toBe('7')
  })

  it('should show L2/L3 toggle buttons to switch view mode', async () => {
    const user = userEvent.setup()
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={TREND_DATA_7D} />)

    const l2l3Toggle = screen.getByTestId('ai-trend-l2l3-toggle')
    expect(l2l3Toggle).toBeTruthy()

    await user.click(l2l3Toggle)
    expect(screen.getByTestId('recharts-line-chart')).toBeTruthy()
  })

  // ── P1-BV: Zero data handling ──

  it('should render chart (not empty state) when all data points are $0.00', async () => {
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={ZERO_TREND_DATA} />)

    expect(screen.getByTestId('recharts-line-chart')).toBeTruthy()
    expect(screen.queryByTestId('ai-trend-chart-empty')).toBeNull()
  })

  it('should render chart with empty array (0 data points)', async () => {
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={[]} />)

    const lineChart = screen.getByTestId('recharts-line-chart')
    expect(lineChart.getAttribute('data-count')).toBe('0')
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
    await user.click(toggle) // breakdown (true)
    await user.click(toggle) // total (false)
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

  // ── Line dataKey verification ──

  it('should render totalCostUsd line in default (total) view', async () => {
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={TREND_DATA_7D} />)

    expect(screen.getByTestId('line-totalCostUsd')).toBeTruthy()
    expect(screen.queryByTestId('line-l2CostUsd')).toBeNull()
    expect(screen.queryByTestId('line-l3CostUsd')).toBeNull()
  })

  it('should render l2CostUsd and l3CostUsd lines in breakdown view', async () => {
    const user = userEvent.setup()
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={TREND_DATA_7D} />)

    await user.click(screen.getByTestId('ai-trend-l2l3-toggle'))

    expect(screen.queryByTestId('line-totalCostUsd')).toBeNull()
    expect(screen.getByTestId('line-l2CostUsd')).toBeTruthy()
    expect(screen.getByTestId('line-l3CostUsd')).toBeTruthy()
  })

  it('should use correct line names for legend labels', async () => {
    const user = userEvent.setup()
    const { AiSpendTrendChart } = await import('./AiSpendTrendChart')
    render(<AiSpendTrendChart data={TREND_DATA_7D} />)

    expect(screen.getByTestId('line-totalCostUsd').getAttribute('data-name')).toBe('Total Cost')

    await user.click(screen.getByTestId('ai-trend-l2l3-toggle'))
    expect(screen.getByTestId('line-l2CostUsd').getAttribute('data-name')).toBe('L2 (Screening)')
    expect(screen.getByTestId('line-l3CostUsd').getAttribute('data-name')).toBe(
      'L3 (Deep Analysis)',
    )
  })
})
