'use client'

import { type KeyboardEvent, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { updateBudgetAlertThreshold } from '@/features/pipeline/actions/updateBudgetAlertThreshold.action'

type AiBudgetCardBaseProps = {
  usedBudgetUsd: number
  monthlyBudgetUsd: number | null
  budgetAlertThresholdPct?: number
}

type AiBudgetCardProps = AiBudgetCardBaseProps &
  ({ canEditThreshold: true; projectId: string } | { canEditThreshold?: false; projectId?: string })

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
  projectId,
  canEditThreshold = false,
}: AiBudgetCardProps) {
  const [thresholdValue, setThresholdValue] = useState(budgetAlertThresholdPct)
  const [savedValue, setSavedValue] = useState(budgetAlertThresholdPct)
  const [isPending, startTransition] = useTransition()

  // Sync state when prop changes (e.g., parent re-fetch, Realtime update)
  useEffect(() => {
    setThresholdValue(budgetAlertThresholdPct)
    setSavedValue(budgetAlertThresholdPct)
  }, [budgetAlertThresholdPct])

  // Unlimited budget — no threshold editing or display
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
  const { fill: fillColor, marker: markerColor, status } = getProgressColor(pct, thresholdValue)
  const isExceeded = usedBudgetUsd >= monthlyBudgetUsd

  function isValidThreshold(value: number): boolean {
    return Number.isInteger(value) && value >= 1 && value <= 100
  }

  function handleSave() {
    if (!isValidThreshold(thresholdValue)) {
      setThresholdValue(savedValue) // Revert UI when invalid (NaN, out of range)
      return
    }
    if (thresholdValue === savedValue) return
    if (!projectId) return

    const pId = projectId
    const newValue = thresholdValue
    const prevValue = savedValue

    startTransition(async () => {
      const result = await updateBudgetAlertThreshold({
        projectId: pId,
        thresholdPct: newValue,
      })
      if (result.success) {
        toast.success('Threshold updated')
        setSavedValue(newValue)
      } else {
        toast.error(result.error)
        setThresholdValue(prevValue)
      }
    })
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

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

      {canEditThreshold ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Alert at</span>
          <Input
            data-testid="threshold-input"
            type="number"
            min={1}
            max={100}
            value={thresholdValue}
            onChange={(e) => setThresholdValue(Number(e.target.value))}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            aria-label="Alert threshold percentage"
            className="w-16"
          />
          <span className="text-muted-foreground">% of budget</span>
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">Alert at {thresholdValue}%</div>
      )}
    </div>
  )
}
