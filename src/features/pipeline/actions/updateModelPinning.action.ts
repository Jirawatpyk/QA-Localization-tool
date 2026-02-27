'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { projects } from '@/db/schema/projects'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { ALL_AVAILABLE_MODELS } from '@/lib/ai/models'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'

type UpdateModelPinningInput = {
  projectId: string
  layer: 'L2' | 'L3'
  model: string | null // null = clear pin, use system default
}

type UpdateModelPinningResult = { success: true } | { success: false; code: string; error: string }

/**
 * Update pinned AI model version for a project (Admin only).
 *
 * Validates model ID against AVAILABLE_MODELS allowlist,
 * updates projects.l2_pinned_model or l3_pinned_model, writes audit log.
 */
export async function updateModelPinning(
  input: UpdateModelPinningInput,
): Promise<UpdateModelPinningResult> {
  // Auth — admin-only
  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  const { projectId, layer, model } = input

  // Validate model against allowlist (null = clear)
  if (model !== null && !ALL_AVAILABLE_MODELS.has(model)) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: `Model '${model}' is not in the allowlist`,
    }
  }

  try {
    // Determine which column to update
    const setClause =
      layer === 'L2'
        ? { l2PinnedModel: model, updatedAt: new Date() }
        : { l3PinnedModel: model, updatedAt: new Date() }

    const [updated] = await db
      .update(projects)
      .set(setClause)
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
        action: 'project.model_pinned',
        newValue: { layer, model },
      })
    } catch (auditErr) {
      logger.error({ err: auditErr, projectId }, 'Audit log failed for model pin (non-fatal)')
    }

    return { success: true }
  } catch (err) {
    logger.error({ err, projectId }, 'Failed to update model pinning')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to update model' }
  }
}
