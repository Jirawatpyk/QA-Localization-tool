'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { exportAiUsage } from '@/features/dashboard/actions/exportAiUsage.action'
import type {
  AiModelSpend,
  AiProjectSpend,
  AiSpendTrendPoint,
  AiUsageSummary,
} from '@/features/dashboard/types'

import { AiSpendByModelChart } from './AiSpendByModelChart'
import { AiSpendByProjectTable } from './AiSpendByProjectTable'
import { AiSpendTrendChart } from './AiSpendTrendChart'
import { AiUsageSummaryCards } from './AiUsageSummaryCards'

const PERIOD_OPTIONS = [7, 30, 90] as const
type Period = (typeof PERIOD_OPTIONS)[number]

interface AiUsageDashboardProps {
  summary: AiUsageSummary
  projects: AiProjectSpend[]
  modelSpend: AiModelSpend[]
  trend: AiSpendTrendPoint[]
  selectedDays: Period
}

export function AiUsageDashboard({
  summary,
  projects,
  modelSpend,
  trend,
  selectedDays,
}: AiUsageDashboardProps) {
  const router = useRouter()
  const [activePeriod, setActivePeriod] = useState<Period>(selectedDays)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    setActivePeriod(selectedDays)
  }, [selectedDays])

  function handlePeriodClick(days: Period) {
    setActivePeriod(days)
    // H2: navigate to new URL — RSC page re-fetches all data with the new period
    startTransition(() => {
      router.push(`?days=${days}`, { scroll: false })
    })
  }

  async function handleExport() {
    setExporting(true)
    try {
      const result = await exportAiUsage()
      if (!result.success) {
        toast.error(result.error ?? 'Export failed')
        return
      }
      const blob = new Blob([result.data.csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.data.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // H3: surface unexpected errors to the user
      toast.error('Export failed — please try again')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border p-1">
          {PERIOD_OPTIONS.map((days) => (
            <button
              key={days}
              data-testid={`period-selector-${days}`}
              type="button"
              aria-pressed={activePeriod === days}
              onClick={() => handlePeriodClick(days)}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                activePeriod === days ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {days}d
            </button>
          ))}
        </div>

        <button
          data-testid="export-ai-usage-btn"
          type="button"
          disabled={exporting}
          onClick={() => {
            void handleExport().catch(() => {
              /* caught in handleExport */
            })
          }}
          className="rounded border px-4 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {/* Summary cards */}
      <AiUsageSummaryCards summary={summary} />

      {/* Spend trend chart */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-medium">Spend Trend</h3>
        <AiSpendTrendChart data={trend} />
      </div>

      {/* By project table */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-medium">Spend by Project</h3>
        <AiSpendByProjectTable projects={projects} />
      </div>

      {/* By model chart */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-medium">Spend by Model</h3>
        <AiSpendByModelChart data={modelSpend} />
      </div>
    </div>
  )
}
