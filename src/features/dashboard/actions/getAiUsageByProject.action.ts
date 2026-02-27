'use server'

import 'server-only'

import { and, eq, gte, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { aiUsageLogs } from '@/db/schema/aiUsageLogs'
import { projects } from '@/db/schema/projects'
import type { AiProjectSpend } from '@/features/dashboard/types'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'

export type GetAiUsageByProjectResult =
  | { success: true; data: AiProjectSpend[] }
  | { success: false; code: string; error: string }

export async function getAiUsageByProject(): Promise<GetAiUsageByProjectResult> {
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

    const tenantId = currentUser.tenantId

    // Drive from projects so zero-spend projects still appear (LEFT JOIN).
    // Date filter MUST be in JOIN condition (not WHERE) — putting it in WHERE
    // converts LEFT JOIN to effective INNER JOIN and drops zero-spend rows.
    // withTenant() applied TWICE (Guardrail #14): projects (WHERE) + ai_usage_logs (JOIN).
    const rows = await db
      .select({
        projectId: projects.id,
        projectName: projects.name,
        monthlyBudgetUsd: projects.aiBudgetMonthlyUsd,
        budgetAlertThresholdPct: projects.budgetAlertThresholdPct,
        totalCost: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
        fileCount: sql<string>`COUNT(DISTINCT ${aiUsageLogs.fileId})`,
      })
      .from(projects)
      .leftJoin(
        aiUsageLogs,
        and(
          eq(aiUsageLogs.projectId, projects.id),
          withTenant(aiUsageLogs.tenantId, tenantId), // defense-in-depth
          gte(aiUsageLogs.createdAt, monthStart), // in JOIN so zero-spend rows survive
        ),
      )
      .where(withTenant(projects.tenantId, tenantId))
      .groupBy(
        projects.id,
        projects.name,
        projects.aiBudgetMonthlyUsd,
        projects.budgetAlertThresholdPct,
      )

    const data: AiProjectSpend[] = rows
      .map((row) => ({
        projectId: row.projectId,
        projectName: row.projectName,
        totalCostUsd: Number(row.totalCost),
        filesProcessed: Number(row.fileCount),
        // aiBudgetMonthlyUsd is numeric → Drizzle returns string | null
        monthlyBudgetUsd: row.monthlyBudgetUsd !== null ? Number(row.monthlyBudgetUsd) : null,
        budgetAlertThresholdPct: row.budgetAlertThresholdPct,
      }))
      // AC3: default sort — highest spend first
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd)

    return { success: true, data }
  } catch (err) {
    logger.error({ err }, 'Failed to get AI usage by project')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to load project AI usage' }
  }
}
