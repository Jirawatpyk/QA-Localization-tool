'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { projects } from '@/db/schema/projects'
import { getProjectAiBudgetSchema } from '@/features/pipeline/validation/pipelineSchema'
import { checkProjectBudget } from '@/lib/ai/budget'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

type AiBudgetData = {
  usedBudgetUsd: number
  monthlyBudgetUsd: number | null
  budgetAlertThresholdPct: number
  remainingBudgetUsd: number
}

/**
 * Get current month AI spend vs. project budget for the AiBudgetCard component.
 *
 * Delegates to checkProjectBudget (DRY) + adds budgetAlertThresholdPct from project.
 */
export async function getProjectAiBudget(input: unknown): Promise<ActionResult<AiBudgetData>> {
  // Validate input
  const parsed = getProjectAiBudgetSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'INVALID_INPUT', error: parsed.error.message }
  }
  const { projectId } = parsed.data

  // Auth — all roles can view budget
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'read')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  try {
    // Step 1: Get project alert threshold (only field not in checkProjectBudget)
    const [project] = await db
      .select({
        budgetAlertThresholdPct: projects.budgetAlertThresholdPct,
      })
      .from(projects)
      .where(and(withTenant(projects.tenantId, currentUser.tenantId), eq(projects.id, projectId)))

    if (!project) {
      return { success: false, code: 'NOT_FOUND', error: 'Project not found' }
    }

    // Step 2: Delegate budget calculation to shared checkProjectBudget (DRY)
    const budget = await checkProjectBudget(projectId, currentUser.tenantId)

    return {
      success: true,
      data: {
        usedBudgetUsd: budget.usedBudgetUsd,
        monthlyBudgetUsd: budget.monthlyBudgetUsd,
        budgetAlertThresholdPct: project.budgetAlertThresholdPct,
        remainingBudgetUsd: budget.remainingBudgetUsd,
      },
    }
  } catch (err) {
    logger.error({ err, projectId }, 'Failed to get project AI budget')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to load budget' }
  }
}
