import type { AiUsageSummary } from '@/features/dashboard/types'

interface AiUsageSummaryCardsProps {
  summary: AiUsageSummary
}

export function AiUsageSummaryCards({ summary }: AiUsageSummaryCardsProps) {
  const fmtCost = (n: number) => `$${n.toFixed(2)}`

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <div data-testid="ai-usage-total-cost" className="rounded-lg border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">Total Cost (Month)</p>
        <p className="mt-1 text-2xl font-semibold">{fmtCost(summary.totalCostUsd)}</p>
      </div>

      <div
        data-testid="ai-usage-files-processed"
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <p className="text-sm text-muted-foreground">Files Processed</p>
        <p className="mt-1 text-2xl font-semibold">{summary.filesProcessed}</p>
      </div>

      <div data-testid="ai-usage-avg-cost" className="rounded-lg border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">Avg Cost / File</p>
        <p className="mt-1 text-2xl font-semibold">{fmtCost(summary.avgCostPerFileUsd)}</p>
      </div>

      <div
        data-testid="ai-usage-projected-cost"
        className="rounded-lg border bg-card p-4 shadow-sm"
      >
        <p className="text-sm text-muted-foreground">Projected Month</p>
        <p className="mt-1 text-2xl font-semibold">
          {summary.projectedMonthCostUsd !== null ? fmtCost(summary.projectedMonthCostUsd) : '—'}
        </p>
      </div>
    </div>
  )
}
