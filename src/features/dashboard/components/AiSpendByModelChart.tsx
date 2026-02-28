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

const COST_LABEL = 'Cost (USD)' as const

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
    <div data-testid="ai-model-chart-container" className="space-y-4">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `$${v}`} width={60} />
            <Tooltip
              formatter={(v: number | undefined) => [`$${(v ?? 0).toFixed(4)}`, COST_LABEL]}
            />
            <Legend />
            <Bar dataKey="cost" name={COST_LABEL} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table data-testid="ai-model-breakdown-table" className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">Model</th>
            <th className="pb-2 font-medium">Provider</th>
            <th className="pb-2 font-medium">Total Cost (USD)</th>
            <th className="pb-2 font-medium">Input Tokens</th>
            <th className="pb-2 font-medium">Output Tokens</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr
              key={`${d.provider}/${d.model}-${i}`}
              data-testid={`ai-model-breakdown-row-${i}`}
              className="border-b last:border-0"
            >
              <td className="py-2 font-mono text-xs">{d.model}</td>
              <td className="py-2">{d.provider}</td>
              <td className="py-2">${d.totalCostUsd.toFixed(4)}</td>
              <td className="py-2">{d.inputTokens.toLocaleString()}</td>
              <td className="py-2">{d.outputTokens.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
