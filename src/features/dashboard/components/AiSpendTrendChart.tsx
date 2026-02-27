'use client'

import { useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { AiSpendTrendPoint } from '@/features/dashboard/types'

interface AiSpendTrendChartProps {
  data: AiSpendTrendPoint[]
}

export function AiSpendTrendChart({ data }: AiSpendTrendChartProps) {
  const [showL2L3, setShowL2L3] = useState(false)

  return (
    <div data-testid="ai-trend-chart-container" className="space-y-2">
      <div className="flex justify-end">
        <button
          data-testid="ai-trend-l2l3-toggle"
          type="button"
          onClick={() => setShowL2L3((prev) => !prev)}
          className="rounded border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          {showL2L3 ? 'Show Total' : 'Show L2/L3 Breakdown'}
        </button>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `$${v}`} width={60} />
            <Tooltip formatter={(v: number | undefined) => [`$${(v ?? 0).toFixed(4)}`, '']} />
            <Legend />
            {showL2L3 ? (
              <>
                <Line
                  type="monotone"
                  dataKey="l2CostUsd"
                  name="L2 (Screening)"
                  stroke="var(--chart-2)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="l3CostUsd"
                  name="L3 (Deep Analysis)"
                  stroke="var(--chart-3)"
                  dot={false}
                  strokeWidth={2}
                />
              </>
            ) : (
              <Line
                type="monotone"
                dataKey="totalCostUsd"
                name="Total Cost (USD)"
                stroke="var(--chart-1)"
                dot={false}
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
