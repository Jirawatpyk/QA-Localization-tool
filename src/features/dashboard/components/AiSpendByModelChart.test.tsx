import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children, data }: { children: React.ReactNode; data?: Array<{ name: string }> }) => (
    <div data-testid="recharts-bar-chart">
      {data?.map((d, i) => (
        <span key={i} data-testid={`bar-label-${i}`}>
          {d.name}
        </span>
      ))}
      {children}
    </div>
  ),
  Bar: ({ name }: { name?: string }) => <span data-testid="bar-name-prop">{name}</span>,
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

  it('should display provider and model labels for each data entry', async () => {
    const { AiSpendByModelChart } = await import('./AiSpendByModelChart')
    render(<AiSpendByModelChart data={MODEL_SPEND_DATA} />)

    // Chart container must be present, empty-state must NOT be rendered
    expect(screen.getByTestId('ai-model-chart-container')).toBeTruthy()
    expect(screen.queryByTestId('ai-model-chart-empty')).toBeNull()
    // Provider/model label strings must appear in chart data (ATDD P1)
    expect(screen.getByText('openai/gpt-4o-mini')).toBeTruthy()
    expect(screen.getByText('anthropic/claude-sonnet-4-5-20250929')).toBeTruthy()
  })

  // ── Story 3.1b — AC3: Per-Model Breakdown Table ──

  it('should render model breakdown table below chart when data is provided', async () => {
    const { AiSpendByModelChart } = await import('./AiSpendByModelChart')
    render(<AiSpendByModelChart data={MODEL_SPEND_DATA} />)

    expect(screen.getByTestId('ai-model-breakdown-table')).toBeTruthy()
  })

  it('should render table with 5 columns: Model, Provider, Total Cost (USD), Input Tokens, Output Tokens', async () => {
    const { AiSpendByModelChart } = await import('./AiSpendByModelChart')
    render(<AiSpendByModelChart data={MODEL_SPEND_DATA} />)

    const table = screen.getByTestId('ai-model-breakdown-table')
    expect(table.textContent).toContain('Model')
    expect(table.textContent).toContain('Provider')
    expect(table.textContent).toContain('Total Cost (USD)')
    expect(table.textContent).toContain('Input Tokens')
    expect(table.textContent).toContain('Output Tokens')
  })

  it('should render one row per model entry with correct data values', async () => {
    const { AiSpendByModelChart } = await import('./AiSpendByModelChart')
    render(<AiSpendByModelChart data={MODEL_SPEND_DATA} />)

    const row0 = screen.getByTestId('ai-model-breakdown-row-0')
    const row1 = screen.getByTestId('ai-model-breakdown-row-1')
    expect(row0.textContent).toContain('gpt-4o-mini')
    expect(row0.textContent).toContain('openai')
    expect(row1.textContent).toContain('claude-sonnet-4-5-20250929')
    expect(row1.textContent).toContain('anthropic')
  })

  it('should NOT render breakdown table when data is empty (empty state shown instead)', async () => {
    const { AiSpendByModelChart } = await import('./AiSpendByModelChart')
    render(<AiSpendByModelChart data={[]} />)

    expect(screen.queryByTestId('ai-model-breakdown-table')).toBeNull()
    expect(screen.getByTestId('ai-model-chart-empty')).toBeTruthy()
  })

  // ── Story 3.1b — AC4: Tooltip label 'Cost (USD)' ──

  it('should use "Cost (USD)" as Bar name prop — matches tooltip and legend label', async () => {
    const { AiSpendByModelChart } = await import('./AiSpendByModelChart')
    render(<AiSpendByModelChart data={MODEL_SPEND_DATA} />)

    // Bar mock renders name prop as testid span — verifies name="Cost (USD)" in source
    expect(screen.getByTestId('bar-name-prop').textContent).toBe('Cost (USD)')
  })
})
