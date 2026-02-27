'use server'

import 'server-only'

import { and, gte, lte, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { aiUsageLogs } from '@/db/schema/aiUsageLogs'
import type { AiSpendTrendPoint } from '@/features/dashboard/types'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'

const MAX_DAYS = 90

type GetAiSpendTrendInput = {
  days: 7 | 30 | 90
}

export type GetAiSpendTrendResult =
  | { success: true; data: AiSpendTrendPoint[] }
  | { success: false; code: string; error: string }

export async function getAiSpendTrend(input: GetAiSpendTrendInput): Promise<GetAiSpendTrendResult> {
  let currentUser
  try {
    currentUser = await requireRole('admin', 'read')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  // M5: runtime guard — TS union is compile-time only; reject clearly bad values
  if (!Number.isInteger(input.days) || input.days <= 0) {
    return { success: false, code: 'INVALID_INPUT', error: 'days must be a positive integer' }
  }

  try {
    const cappedDays = Math.min(input.days, MAX_DAYS)

    const rangeEnd = new Date()
    rangeEnd.setUTCHours(23, 59, 59, 999)

    // cappedDays - 1 so the loop yields exactly cappedDays points (rangeStart..rangeEnd inclusive)
    const rangeStart = new Date()
    rangeStart.setUTCDate(rangeStart.getUTCDate() - cappedDays + 1)
    rangeStart.setUTCHours(0, 0, 0, 0)

    const rows = await db
      .select({
        day: sql<string>`DATE(${aiUsageLogs.createdAt} AT TIME ZONE 'UTC')`,
        totalCost: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
        l2Cost: sql<string>`COALESCE(SUM(CASE WHEN ${aiUsageLogs.layer} = 'L2' THEN ${aiUsageLogs.estimatedCost} ELSE 0 END), 0)`,
        l3Cost: sql<string>`COALESCE(SUM(CASE WHEN ${aiUsageLogs.layer} = 'L3' THEN ${aiUsageLogs.estimatedCost} ELSE 0 END), 0)`,
      })
      .from(aiUsageLogs)
      .where(
        and(
          withTenant(aiUsageLogs.tenantId, currentUser.tenantId),
          gte(aiUsageLogs.createdAt, rangeStart),
          lte(aiUsageLogs.createdAt, rangeEnd),
        ),
      )
      .groupBy(sql`DATE(${aiUsageLogs.createdAt} AT TIME ZONE 'UTC')`)

    // Scaffold all dates — fill missing days with $0.00 (never sparse)
    const rowMap = new Map(rows.map((r) => [r.day, r]))
    const result: AiSpendTrendPoint[] = []

    for (let d = new Date(rangeStart); d <= rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0] ?? ''
      const row = rowMap.get(dateStr)
      result.push({
        date: dateStr,
        totalCostUsd: Number(row?.totalCost ?? 0),
        l2CostUsd: Number(row?.l2Cost ?? 0),
        l3CostUsd: Number(row?.l3Cost ?? 0),
      })
    }

    return { success: true, data: result }
  } catch (err) {
    logger.error({ err, days: input.days }, 'Failed to get AI spend trend')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to load trend data' }
  }
}
