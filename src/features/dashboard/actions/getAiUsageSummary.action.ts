'use server'

import 'server-only'

import { and, gte, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { aiUsageLogs } from '@/db/schema/aiUsageLogs'
import type { AiUsageSummary } from '@/features/dashboard/types'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'

export type GetAiUsageSummaryResult =
  | { success: true; data: AiUsageSummary }
  | { success: false; code: string; error: string }

export async function getAiUsageSummary(): Promise<GetAiUsageSummaryResult> {
  let currentUser
  try {
    currentUser = await requireRole('admin', 'read')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  try {
    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)

    const [summary] = await db
      .select({
        totalCost: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
        fileCount: sql<string>`COUNT(DISTINCT ${aiUsageLogs.fileId})`,
      })
      .from(aiUsageLogs)
      .where(
        and(
          withTenant(aiUsageLogs.tenantId, currentUser.tenantId),
          gte(aiUsageLogs.createdAt, monthStart),
        ),
      )

    // Aggregate always returns exactly 1 row — cast from string (Drizzle numeric/sql result)
    const totalCostUsd = Number(summary?.totalCost ?? 0)
    const filesProcessed = Number(summary?.fileCount ?? 0)
    const avgCostPerFileUsd = filesProcessed > 0 ? totalCostUsd / filesProcessed : 0

    // Projected spend: (spend/daysElapsed) * daysInMonth — only when ≥ 5 days elapsed
    const now = new Date()
    const daysElapsed = now.getUTCDate() - 1 // days since month start (0-indexed)
    const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate()
    const projectedMonthCostUsd =
      daysElapsed >= 5 && daysElapsed > 0 ? (totalCostUsd / daysElapsed) * daysInMonth : null

    return {
      success: true,
      data: {
        totalCostUsd,
        filesProcessed,
        avgCostPerFileUsd,
        projectedMonthCostUsd,
      },
    }
  } catch (err) {
    logger.error({ err }, 'Failed to get AI usage summary')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to load AI usage summary' }
  }
}
