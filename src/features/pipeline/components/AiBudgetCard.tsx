type AiBudgetCardProps = {
  usedBudgetUsd: number
  monthlyBudgetUsd: number | null // null = unlimited
  budgetAlertThresholdPct?: number // default 80
}

function getProgressColor(
  pct: number,
  thresholdPct: number,
): { fill: string; marker: string; status: string } {
  if (pct >= 100) return { fill: 'bg-error', marker: 'text-error', status: 'exceeded' }
  if (pct >= thresholdPct) return { fill: 'bg-warning', marker: 'text-warning', status: 'warning' }
  return { fill: 'bg-success', marker: 'text-success', status: 'ok' }
}

export function AiBudgetCard({
  usedBudgetUsd,
  monthlyBudgetUsd,
  budgetAlertThresholdPct = 80,
}: AiBudgetCardProps) {
  // Unlimited budget
  if (monthlyBudgetUsd === null) {
    return (
      <div data-testid="ai-budget-card" className="rounded-lg border p-4">
        <h3 className="text-sm font-medium">AI Budget</h3>
        <div data-testid="ai-budget-unlimited" className="mt-2 text-sm text-muted-foreground">
          No budget limit set
        </div>
      </div>
    )
  }

  const pct =
    monthlyBudgetUsd > 0 ? Math.min(100, Math.round((usedBudgetUsd / monthlyBudgetUsd) * 100)) : 0
  const {
    fill: fillColor,
    marker: markerColor,
    status,
  } = getProgressColor(pct, budgetAlertThresholdPct)
  const isExceeded = usedBudgetUsd >= monthlyBudgetUsd

  return (
    <div data-testid="ai-budget-card" className="rounded-lg border p-4">
      <h3 className="text-sm font-medium">AI Budget</h3>

      <div data-testid="ai-budget-spend" className="mt-2 text-sm">
        ${usedBudgetUsd.toFixed(2)} / ${monthlyBudgetUsd.toFixed(2)} used
      </div>

      <div
        data-testid="ai-budget-progress"
        data-status={status}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`mt-2 h-2 w-full overflow-hidden rounded-full bg-muted ${markerColor}`}
      >
        <div className={`h-full ${fillColor}`} style={{ width: `${pct}%` }} />
      </div>

      {isExceeded && (
        <div data-testid="ai-budget-status" className="mt-2 text-sm font-medium text-error">
          Budget exceeded — AI processing paused
        </div>
      )}
    </div>
  )
}
