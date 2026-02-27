'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { projects } from '@/db/schema/projects'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'

type UpdateBudgetAlertThresholdInput = {
  projectId: string
  thresholdPct: number // 1-100
}

type UpdateBudgetAlertThresholdResult =
  | { success: true }
  | { success: false; code: string; error: string }

/**
 * Update budget alert threshold percentage for a project (Admin/PM only).
 *
 * Stored in projects.budget_alert_threshold_pct (default 80%).
 */
export async function updateBudgetAlertThreshold(
  input: UpdateBudgetAlertThresholdInput,
): Promise<UpdateBudgetAlertThresholdResult> {
  // Auth — admin or pm only
  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  const { projectId, thresholdPct } = input

  // Validate range: 1-100 (integer)
  if (!Number.isInteger(thresholdPct) || thresholdPct < 1 || thresholdPct > 100) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Threshold must be an integer between 1 and 100',
    }
  }

  try {
    const [updated] = await db
      .update(projects)
      .set({ budgetAlertThresholdPct: thresholdPct, updatedAt: new Date() })
      .where(and(withTenant(projects.tenantId, currentUser.tenantId), eq(projects.id, projectId)))
      .returning()

    if (!updated) {
      return { success: false, code: 'NOT_FOUND', error: 'Project not found' }
    }

    // Audit log
    try {
      await writeAuditLog({
        tenantId: currentUser.tenantId,
        userId: currentUser.id,
        entityType: 'project',
        entityId: projectId,
        action: 'project.budget_threshold_updated',
        newValue: { budgetAlertThresholdPct: thresholdPct },
      })
    } catch (auditErr) {
      logger.error(
        { err: auditErr, projectId },
        'Audit log failed for budget threshold (non-fatal)',
      )
    }

    return { success: true }
  } catch (err) {
    logger.error({ err, projectId }, 'Failed to update budget alert threshold')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to update threshold' }
  }
}
