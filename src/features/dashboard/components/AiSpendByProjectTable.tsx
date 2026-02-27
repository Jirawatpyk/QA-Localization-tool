import type { AiProjectSpend } from '@/features/dashboard/types'

interface AiSpendByProjectTableProps {
  projects: AiProjectSpend[]
}

function getBudgetStatus(budgetPct: number, alertThreshold: number): 'ok' | 'warning' | 'exceeded' {
  if (budgetPct >= 100) return 'exceeded'
  if (budgetPct >= alertThreshold) return 'warning'
  return 'ok'
}

const STATUS_COLORS: Record<'ok' | 'warning' | 'exceeded', string> = {
  ok: 'bg-success',
  warning: 'bg-warning',
  exceeded: 'bg-error',
}

export function AiSpendByProjectTable({ projects }: AiSpendByProjectTableProps) {
  if (projects.length === 0) {
    return (
      <div
        data-testid="ai-project-table-empty"
        className="py-8 text-center text-sm text-muted-foreground"
      >
        No project usage data for this period.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">Project</th>
            <th className="pb-2 font-medium">Cost (Month)</th>
            <th className="pb-2 font-medium">Files</th>
            <th className="pb-2 font-medium">Budget</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const budgetPct =
              p.monthlyBudgetUsd && p.monthlyBudgetUsd > 0
                ? (p.totalCostUsd / p.monthlyBudgetUsd) * 100
                : 0
            const status = getBudgetStatus(budgetPct, p.budgetAlertThresholdPct)

            return (
              <tr
                key={p.projectId}
                data-testid={`ai-project-row-${p.projectId}`}
                className="border-b last:border-0"
              >
                <td className="py-2 font-medium">{p.projectName}</td>
                <td className="py-2">${p.totalCostUsd.toFixed(2)}</td>
                <td className="py-2">{p.filesProcessed}</td>
                <td className="py-2">
                  {p.monthlyBudgetUsd !== null ? (
                    <div className="flex items-center gap-2">
                      <span
                        data-testid={`ai-budget-indicator-${p.projectId}`}
                        data-status={status}
                        className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[status]}`}
                      />
                      <span>
                        {budgetPct.toFixed(0)}% of ${p.monthlyBudgetUsd}
                      </span>
                    </div>
                  ) : (
                    <span
                      data-testid={`ai-budget-indicator-${p.projectId}`}
                      data-status="ok"
                      className="text-muted-foreground"
                    >
                      Unlimited
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
