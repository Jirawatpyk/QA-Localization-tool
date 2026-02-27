'use server'

import 'server-only'

import { and, eq, gte, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { aiUsageLogs } from '@/db/schema/aiUsageLogs'
import { projects } from '@/db/schema/projects'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'

type GetProjectAiBudgetInput = {
  projectId: string
}

type GetProjectAiBudgetResult =
  | {
      success: true
      data: {
        usedBudgetUsd: number
        monthlyBudgetUsd: number | null
        budgetAlertThresholdPct: number
        remainingBudgetUsd: number
      }
    }
  | { success: false; code: string; error: string }

/**
 * Get current month AI spend vs. project budget for the AiBudgetCard component.
 *
 * Queries project budget settings + ai_usage_logs SUM for current month.
 */
export async function getProjectAiBudget(
  input: GetProjectAiBudgetInput,
): Promise<GetProjectAiBudgetResult> {
  // Auth — all roles can view budget
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'read')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  const { projectId } = input

  try {
    // Step 1: Get project budget + alert threshold
    const [project] = await db
      .select({
        aiBudgetMonthlyUsd: projects.aiBudgetMonthlyUsd,
        budgetAlertThresholdPct: projects.budgetAlertThresholdPct,
      })
      .from(projects)
      .where(and(withTenant(projects.tenantId, currentUser.tenantId), eq(projects.id, projectId)))

    if (!project) {
      return { success: false, code: 'NOT_FOUND', error: 'Project not found' }
    }

    const monthlyBudgetUsd =
      project.aiBudgetMonthlyUsd !== null ? Number(project.aiBudgetMonthlyUsd) : null

    // Step 2: If no budget set, return unlimited
    if (monthlyBudgetUsd === null) {
      return {
        success: true,
        data: {
          usedBudgetUsd: 0,
          monthlyBudgetUsd: null,
          budgetAlertThresholdPct: project.budgetAlertThresholdPct,
          remainingBudgetUsd: Infinity,
        },
      }
    }

    // Step 3: Get current month's total spend
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const [usage] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${aiUsageLogs.estimatedCost}), 0)`,
      })
      .from(aiUsageLogs)
      .where(
        and(
          withTenant(aiUsageLogs.tenantId, currentUser.tenantId),
          eq(aiUsageLogs.projectId, projectId),
          gte(aiUsageLogs.createdAt, monthStart),
        ),
      )

    const usedBudgetUsd = Number(usage?.total ?? 0)

    return {
      success: true,
      data: {
        usedBudgetUsd,
        monthlyBudgetUsd,
        budgetAlertThresholdPct: project.budgetAlertThresholdPct,
        remainingBudgetUsd: Math.max(0, monthlyBudgetUsd - usedBudgetUsd),
      },
    }
  } catch (err) {
    logger.error({ err, projectId }, 'Failed to get project AI budget')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to load budget' }
  }
}
