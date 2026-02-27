import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-bar-chart">{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

// ── Test data ──

const MODEL_SPEND_DATA = [
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    totalCostUsd: 5.0,
    inputTokens: 100_000,
    outputTokens: 20_000,
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    totalCostUsd: 12.5,
    inputTokens: 50_000,
    outputTokens: 15_000,
  },
]

describe('AiSpendByModelChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P0: Core rendering ──

  it('should render BarChart container when data is provided', async () => {
    const { AiSpendByModelChart } = await import('./AiSpendByModelChart')
    render(<AiSpendByModelChart data={MODEL_SPEND_DATA} />)

    expect(screen.getByTestId('recharts-bar-chart')).toBeTruthy()
  })

  it('should render empty state message when data array is empty', async () => {
    const { AiSpendByModelChart } = await import('./AiSpendByModelChart')
    render(<AiSpendByModelChart data={[]} />)

    expect(screen.getByTestId('ai-model-chart-empty')).toBeTruthy()
  })

  // ── P1: Legend / model labels ──

  it('should display chart container (not empty state) when data is provided', async () => {
    const { AiSpendByModelChart } = await import('./AiSpendByModelChart')
    render(<AiSpendByModelChart data={MODEL_SPEND_DATA} />)

    // Chart container must be present
    expect(screen.getByTestId('ai-model-chart-container')).toBeTruthy()
    // And empty-state message must NOT be rendered
    expect(screen.queryByTestId('ai-model-chart-empty')).toBeNull()
  })
})
