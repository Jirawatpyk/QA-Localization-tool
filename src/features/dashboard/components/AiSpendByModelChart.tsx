'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { AiModelSpend } from '@/features/dashboard/types'

interface AiSpendByModelChartProps {
  data: AiModelSpend[]
}

export function AiSpendByModelChart({ data }: AiSpendByModelChartProps) {
  if (data.length === 0) {
    return (
      <div
        data-testid="ai-model-chart-empty"
        className="flex h-48 items-center justify-center text-sm text-muted-foreground"
      >
        No model spend data for this period.
      </div>
    )
  }

  const chartData = data.map((d) => ({
    name: `${d.provider}/${d.model}`,
    cost: d.totalCostUsd,
  }))

  return (
    <div data-testid="ai-model-chart-container" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v) => `$${v}`} width={60} />
          <Tooltip formatter={(v: number | undefined) => [`$${(v ?? 0).toFixed(4)}`, 'Cost']} />
          <Legend />
          <Bar dataKey="cost" name="Cost (USD)" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
