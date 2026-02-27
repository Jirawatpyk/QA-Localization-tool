import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

// Mock server actions called from the dashboard orchestrator
vi.mock('../actions/getAiUsageSummary.action', () => ({
  getAiUsageSummary: vi.fn(),
}))

vi.mock('../actions/getAiUsageByProject.action', () => ({
  getAiUsageByProject: vi.fn(),
}))

vi.mock('../actions/getAiSpendByModel.action', () => ({
  getAiSpendByModel: vi.fn(),
}))

vi.mock('../actions/getAiSpendTrend.action', () => ({
  getAiSpendTrend: vi.fn(),
}))

vi.mock('../actions/exportAiUsage.action', () => ({
  exportAiUsage: vi.fn(),
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-bar-chart">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-line-chart">{children}</div>
  ),
  Bar: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

// ── Test data ──

const MOCK_SUMMARY = {
  totalCostUsd: 15.5,
  filesProcessed: 42,
  avgCostPerFileUsd: 0.37,
  projectedMonthCostUsd: 25.75,
}

const MOCK_PROJECTS = [
  {
    projectId: 'c3d4e5f6-a7b8-4c3d-ae4f-5a6b7c8d9e0f',
    projectName: 'Test Project',
    totalCostUsd: 10.0,
    filesProcessed: 5,
    monthlyBudgetUsd: 100,
    budgetAlertThresholdPct: 80,
  },
]

const MOCK_MODEL_SPEND = [
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    totalCostUsd: 5.0,
    inputTokens: 100_000,
    outputTokens: 20_000,
  },
]

const MOCK_TREND = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-02-${String(21 + i).padStart(2, '0')}`,
  totalCostUsd: 0,
  l2CostUsd: 0,
  l3CostUsd: 0,
}))

describe('AiUsageDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P0: Core rendering ──

  it('should render period selector with 7d, 30d, and 90d buttons', async () => {
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(
      <AiUsageDashboard
        summary={MOCK_SUMMARY}
        projects={MOCK_PROJECTS}
        modelSpend={MOCK_MODEL_SPEND}
        trend={MOCK_TREND}
        selectedDays={30}
      />,
    )

    // Period selector buttons must all be present
    expect(screen.getByTestId('period-selector-7')).toBeTruthy()
    expect(screen.getByTestId('period-selector-30')).toBeTruthy()
    expect(screen.getByTestId('period-selector-90')).toBeTruthy()
  })

  it('should render export CSV button visible to admin', async () => {
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(
      <AiUsageDashboard
        summary={MOCK_SUMMARY}
        projects={MOCK_PROJECTS}
        modelSpend={MOCK_MODEL_SPEND}
        trend={MOCK_TREND}
        selectedDays={30}
      />,
    )

    expect(screen.getByTestId('export-ai-usage-btn')).toBeTruthy()
  })

  // ── P1: Period selection ──

  it('should mark the active period button as selected (aria-pressed=true)', async () => {
    const user = userEvent.setup()
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(
      <AiUsageDashboard
        summary={MOCK_SUMMARY}
        projects={MOCK_PROJECTS}
        modelSpend={MOCK_MODEL_SPEND}
        trend={MOCK_TREND}
        selectedDays={30}
      />,
    )

    // Default selected is 30d
    const btn30 = screen.getByTestId('period-selector-30')
    expect(btn30.getAttribute('aria-pressed')).toBe('true')

    // After clicking 7d, it should become selected
    await user.click(screen.getByTestId('period-selector-7'))
    expect(screen.getByTestId('period-selector-7').getAttribute('aria-pressed')).toBe('true')
  })

  it('should call router.push with correct days param when period is changed', async () => {
    const { useRouter } = await import('next/navigation')
    const mockPush = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<
      typeof useRouter
    >)

    const user = userEvent.setup()
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(
      <AiUsageDashboard
        summary={MOCK_SUMMARY}
        projects={MOCK_PROJECTS}
        modelSpend={MOCK_MODEL_SPEND}
        trend={MOCK_TREND}
        selectedDays={30}
      />,
    )

    await user.click(screen.getByTestId('period-selector-7'))
    expect(mockPush).toHaveBeenCalledWith('?days=7', { scroll: false })
  })
})
