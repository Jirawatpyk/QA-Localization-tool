'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { projects } from '@/db/schema/projects'
import { checkProjectBudget } from '@/lib/ai/budget'
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
 * Delegates to checkProjectBudget (DRY) + adds budgetAlertThresholdPct from project.
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
