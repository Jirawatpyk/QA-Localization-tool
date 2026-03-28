import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type {
  AiModelSpend,
  AiProjectSpend,
  AiSpendTrendPoint,
  AiUsageSummary,
} from '@/features/dashboard/types'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
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

const MOCK_SUMMARY: AiUsageSummary = {
  totalCostUsd: 15.5,
  filesProcessed: 42,
  avgCostPerFileUsd: 0.37,
  projectedMonthCostUsd: 25.75,
}

const MOCK_PROJECTS: AiProjectSpend[] = [
  {
    projectId: 'c3d4e5f6-a7b8-4c3d-ae4f-5a6b7c8d9e0f',
    projectName: 'Test Project',
    totalCostUsd: 10.0,
    filesProcessed: 5,
    monthlyBudgetUsd: 100,
    budgetAlertThresholdPct: 80,
  },
]

const MOCK_MODEL_SPEND: AiModelSpend[] = [
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    totalCostUsd: 5.0,
    inputTokens: 100_000,
    outputTokens: 20_000,
  },
]

const MOCK_TREND: AiSpendTrendPoint[] = Array.from({ length: 7 }, (_, i) => ({
  date: `2026-02-${String(21 + i).padStart(2, '0')}`,
  totalCostUsd: 0,
  l2CostUsd: 0,
  l3CostUsd: 0,
}))

const DEFAULT_PROPS = {
  summary: MOCK_SUMMARY,
  projects: MOCK_PROJECTS,
  modelSpend: MOCK_MODEL_SPEND,
  trend: MOCK_TREND,
}

describe('AiUsageDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P0: Core rendering ──

  it('should render period selector with 7d, 30d, and 90d buttons', async () => {
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    expect(screen.getByTestId('period-selector-7')).toBeTruthy()
    expect(screen.getByTestId('period-selector-30')).toBeTruthy()
    expect(screen.getByTestId('period-selector-90')).toBeTruthy()
  })

  it('should render correct button labels (7d, 30d, 90d)', async () => {
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    expect(screen.getByTestId('period-selector-7').textContent).toBe('7d')
    expect(screen.getByTestId('period-selector-30').textContent).toBe('30d')
    expect(screen.getByTestId('period-selector-90').textContent).toBe('90d')
  })

  it('should render export CSV button', async () => {
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    const btn = screen.getByTestId('export-ai-usage-btn')
    expect(btn).toBeTruthy()
    expect(btn.textContent).toBe('Export CSV')
  })

  it('should render all dashboard sections (summary, trend, project, model)', async () => {
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    expect(screen.getByText('Spend Trend')).toBeTruthy()
    expect(screen.getByText('Spend by Project')).toBeTruthy()
    expect(screen.getByText('Spend by Model')).toBeTruthy()
  })

  // ── P1: Period selection ──

  it('should mark the active period button as selected (aria-pressed=true)', async () => {
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    expect(screen.getByTestId('period-selector-30').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('period-selector-7').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('period-selector-90').getAttribute('aria-pressed')).toBe('false')
  })

  it('should update aria-pressed when a different period is clicked', async () => {
    const user = userEvent.setup()
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    await user.click(screen.getByTestId('period-selector-7'))
    expect(screen.getByTestId('period-selector-7').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('period-selector-30').getAttribute('aria-pressed')).toBe('false')
  })

  it('should call router.push with correct days param when period is changed', async () => {
    const user = userEvent.setup()
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    await user.click(screen.getByTestId('period-selector-7'))
    expect(mockPush).toHaveBeenCalledWith('?days=7', { scroll: false })
  })

  it('should call router.push with days=90 when 90d is clicked', async () => {
    const user = userEvent.setup()
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    await user.click(screen.getByTestId('period-selector-90'))
    expect(mockPush).toHaveBeenCalledWith('?days=90', { scroll: false })
  })

  it('should sync activePeriod when selectedDays prop changes', async () => {
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    const { rerender } = render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    expect(screen.getByTestId('period-selector-30').getAttribute('aria-pressed')).toBe('true')

    rerender(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={7} />)

    expect(screen.getByTestId('period-selector-7').getAttribute('aria-pressed')).toBe('true')
  })

  // ── P1: Export ──

  it('should call exportAiUsage and trigger download on success', async () => {
    const { exportAiUsage } = await import('../actions/exportAiUsage.action')
    vi.mocked(exportAiUsage).mockResolvedValue({
      success: true,
      data: { csv: 'date,cost\n2026-01-01,1.00', filename: 'ai-usage-2026-01.csv' },
    })

    const mockCreateObjectURL = vi.fn(() => 'blob:test-url')
    const mockRevokeObjectURL = vi.fn()
    global.URL.createObjectURL = mockCreateObjectURL
    global.URL.revokeObjectURL = mockRevokeObjectURL

    const user = userEvent.setup()
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    await user.click(screen.getByTestId('export-ai-usage-btn'))

    await waitFor(() => {
      expect(exportAiUsage).toHaveBeenCalledOnce()
    })

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalled()
      expect(mockRevokeObjectURL).toHaveBeenCalled()
    })
  })

  it('should show toast.error when export returns success=false', async () => {
    const { toast } = await import('sonner')
    const { exportAiUsage } = await import('../actions/exportAiUsage.action')
    vi.mocked(exportAiUsage).mockResolvedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Insufficient permissions',
    })

    const user = userEvent.setup()
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    await user.click(screen.getByTestId('export-ai-usage-btn'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Insufficient permissions')
    })
  })

  it('should show generic toast.error when export throws', async () => {
    const { toast } = await import('sonner')
    const { exportAiUsage } = await import('../actions/exportAiUsage.action')
    vi.mocked(exportAiUsage).mockRejectedValue(new Error('Network error'))

    const user = userEvent.setup()
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    await user.click(screen.getByTestId('export-ai-usage-btn'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Export failed — please try again')
    })
  })

  it('should show fallback toast when export result has no error message', async () => {
    const { toast } = await import('sonner')
    const { exportAiUsage } = await import('../actions/exportAiUsage.action')
    vi.mocked(exportAiUsage).mockResolvedValue({
      success: false,
      code: 'INTERNAL_ERROR',
    } as ReturnType<typeof exportAiUsage> extends Promise<infer R> ? R : never)

    const user = userEvent.setup()
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    await user.click(screen.getByTestId('export-ai-usage-btn'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Export failed')
    })
  })

  it('should show "Exporting…" text and disable button while exporting', async () => {
    const { exportAiUsage } = await import('../actions/exportAiUsage.action')
    let resolveExport!: (v: unknown) => void
    vi.mocked(exportAiUsage).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve as (v: unknown) => void
        }),
    )

    const user = userEvent.setup()
    const { AiUsageDashboard } = await import('./AiUsageDashboard')
    render(<AiUsageDashboard {...DEFAULT_PROPS} selectedDays={30} />)

    const exportBtn = screen.getByTestId('export-ai-usage-btn')
    await user.click(exportBtn)

    await waitFor(() => {
      expect(exportBtn.textContent).toBe('Exporting…')
      expect(exportBtn).toBeDisabled()
    })

    resolveExport({ success: true, data: { csv: '', filename: 'test.csv' } })

    await waitFor(() => {
      expect(exportBtn.textContent).toBe('Export CSV')
      expect(exportBtn).not.toBeDisabled()
    })
  })
})
