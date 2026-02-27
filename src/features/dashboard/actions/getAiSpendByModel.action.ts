'use server'

import 'server-only'

import { and, gte, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { aiUsageLogs } from '@/db/schema/aiUsageLogs'
import type { AiModelSpend } from '@/features/dashboard/types'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'

const MAX_DAYS = 90

type GetAiSpendByModelInput = {
  days: 7 | 30 | 90
}

export type GetAiSpendByModelResult =
  | { success: true; data: AiModelSpend[] }
  | { success: false; code: string; error: string }

export async function getAiSpendByModel(
  input: GetAiSpendByModelInput,
): Promise<GetAiSpendByModelResult> {
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
    const rangeStart = new Date()
    rangeStart.setUTCDate(rangeStart.getUTCDate() - cappedDays)
    rangeStart.setUTCHours(0, 0, 0, 0)

    const rows = await db
      .select({
        provider: aiUsageLogs.provider,
        model: aiUsageLogs.model,
        totalCost: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
        inputTokens: sql<string>`COALESCE(SUM(${aiUsageLogs.inputTokens}), 0)`,
        outputTokens: sql<string>`COALESCE(SUM(${aiUsageLogs.outputTokens}), 0)`,
      })
      .from(aiUsageLogs)
      .where(
        and(
          withTenant(aiUsageLogs.tenantId, currentUser.tenantId),
          gte(aiUsageLogs.createdAt, rangeStart),
        ),
      )
      .groupBy(aiUsageLogs.provider, aiUsageLogs.model)

    const data: AiModelSpend[] = rows.map((row) => ({
      provider: row.provider,
      model: row.model,
      totalCostUsd: Number(row.totalCost),
      inputTokens: Number(row.inputTokens),
      outputTokens: Number(row.outputTokens),
    }))

    return { success: true, data }
  } catch (err) {
    logger.error({ err, days: input.days }, 'Failed to get AI spend by model')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to load model spend data' }
  }
}
