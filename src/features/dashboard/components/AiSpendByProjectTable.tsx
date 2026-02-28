'use client'

import { useState } from 'react'

import type { AiProjectSpend } from '@/features/dashboard/types'

interface AiSpendByProjectTableProps {
  projects: AiProjectSpend[]
}

type SortCol = 'cost' | 'budget'
type SortDir = 'asc' | 'desc'

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

function getBudgetPct(p: AiProjectSpend): number {
  return p.monthlyBudgetUsd && p.monthlyBudgetUsd > 0
    ? (p.totalCostUsd / p.monthlyBudgetUsd) * 100
    : 0
}

export function AiSpendByProjectTable({ projects }: AiSpendByProjectTableProps) {
  const [prevProjects, setPrevProjects] = useState<AiProjectSpend[]>(projects)
  const [sortCol, setSortCol] = useState<SortCol>('cost')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Guardrail #12: reset sort to default when projects prop changes (period/filter change)
  // Pattern: store-prev-compare (React docs recommended over useEffect for derived state)
  if (prevProjects !== projects) {
    setPrevProjects(projects)
    setSortCol('cost')
    setSortDir('desc')
  }

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

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const sorted = [...projects].sort((a, b) => {
    const aVal = sortCol === 'cost' ? a.totalCostUsd : getBudgetPct(a)
    const bVal = sortCol === 'cost' ? b.totalCostUsd : getBudgetPct(b)
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal
  })

  function ariaSort(col: SortCol): 'ascending' | 'descending' | 'none' {
    if (col !== sortCol) return 'none'
    return sortDir === 'asc' ? 'ascending' : 'descending'
  }

  function sortIndicator(col: SortCol): string {
    if (col !== sortCol) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">Project</th>
            <th
              data-testid="ai-project-sort-cost"
              aria-sort={ariaSort('cost')}
              className="cursor-pointer select-none pb-2 font-medium hover:text-foreground"
              onClick={() => handleSort('cost')}
            >
              Cost (Month){sortIndicator('cost')}
            </th>
            <th className="pb-2 font-medium">Files</th>
            <th
              data-testid="ai-project-sort-budget"
              aria-sort={ariaSort('budget')}
              className="cursor-pointer select-none pb-2 font-medium hover:text-foreground"
              onClick={() => handleSort('budget')}
            >
              Budget %{sortIndicator('budget')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const budgetPct = getBudgetPct(p)
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
                        {budgetPct.toFixed(0)}% of ${p.monthlyBudgetUsd.toFixed(2)}
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
