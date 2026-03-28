'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { projects } from '@/db/schema/projects'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { updateProjectSchema } from '@/features/project/validation/projectSchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type { ProcessingMode } from '@/types/pipeline'

type ProjectResult = {
  id: string
  name: string
  processingMode: ProcessingMode
  autoPassThreshold: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function updateProject(
  projectId: string,
  input: unknown,
): Promise<ActionResult<ProjectResult>> {
  if (!UUID_RE.test(projectId)) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Invalid project ID' }
  }

  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  const parsed = updateProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const [existing] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), withTenant(projects.tenantId, currentUser.tenantId)))

  if (!existing) {
    return { success: false, code: 'NOT_FOUND', error: 'Project not found' }
  }

  // Convert aiBudgetMonthlyUsd from number to string for decimal column
  const { aiBudgetMonthlyUsd, ...rest } = parsed.data
  const setData: typeof rest & { updatedAt: Date; aiBudgetMonthlyUsd?: string | null } = {
    ...rest,
    updatedAt: new Date(),
  }
  if (aiBudgetMonthlyUsd !== undefined) {
    setData.aiBudgetMonthlyUsd = aiBudgetMonthlyUsd === null ? null : String(aiBudgetMonthlyUsd)
  }

  const [updated] = await db
    .update(projects)
    .set(setData)
    .where(and(eq(projects.id, projectId), withTenant(projects.tenantId, currentUser.tenantId)))
    .returning()

  if (!updated) {
    return { success: false, code: 'UPDATE_FAILED', error: 'Failed to update project' }
  }

  try {
    await writeAuditLog({
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
      entityType: 'project',
      entityId: projectId,
      action: 'project.updated',
      oldValue: {
        name: existing.name,
        description: existing.description,
        processingMode: existing.processingMode,
        autoPassThreshold: existing.autoPassThreshold,
      },
      newValue: { ...parsed.data },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr, projectId }, 'Audit log failed for project update (non-fatal)')
  }

  revalidatePath('/projects')
  revalidatePath(`/projects/${projectId}/settings`)

  return {
    success: true,
    data: {
      id: updated.id,
      name: updated.name,
      processingMode: updated.processingMode as ProcessingMode,
      autoPassThreshold: updated.autoPassThreshold,
    },
  }
}
