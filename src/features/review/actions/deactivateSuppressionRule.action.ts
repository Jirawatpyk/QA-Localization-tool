'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { suppressionRules } from '@/db/schema/suppressionRules'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

const ruleIdSchema = z.string().uuid()

export async function deactivateSuppressionRule(
  ruleId: string,
): Promise<ActionResult<{ ruleId: string }>> {
  // CR-H7: UUID validation
  const parsed = ruleIdSchema.safeParse(ruleId)
  if (!parsed.success) {
    return { success: false, error: 'Invalid rule ID', code: 'VALIDATION_ERROR' }
  }

  // Auth: admin-only
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('admin')
  } catch {
    return { success: false, error: 'Unauthorized — admin only', code: 'UNAUTHORIZED' }
  }

  const { id: userId, tenantId } = user

  const rows = await db
    .update(suppressionRules)
    .set({ isActive: false })
    .where(and(eq(suppressionRules.id, ruleId), withTenant(suppressionRules.tenantId, tenantId)))
    .returning({ id: suppressionRules.id })

  // Guardrail #4: guard rows[0]
  if (rows.length === 0) {
    return {
      success: false,
      error: 'Suppression rule not found',
      code: 'NOT_FOUND',
    }
  }

  // Best-effort audit log (Guardrail #2)
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'suppression_rule',
      entityId: ruleId,
      action: 'suppression_rule.deactivated',
      oldValue: { isActive: true },
      newValue: { isActive: false },
    })
  } catch (auditErr) {
    logger.error(
      { err: auditErr, ruleId },
      'Audit log write failed for suppression rule deactivation',
    )
  }

  return { success: true, data: { ruleId: rows[0]!.id } }
}
