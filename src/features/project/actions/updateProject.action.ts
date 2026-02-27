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
import type { ActionResult } from '@/types/actionResult'

type ProjectResult = {
  id: string
  name: string
  processingMode: string
  autoPassThreshold: number
}

export async function updateProject(
  projectId: string,
  input: unknown,
): Promise<ActionResult<ProjectResult>> {
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
  const setData: Record<string, unknown> = { ...rest, updatedAt: new Date() }
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

  revalidatePath('/projects')
  revalidatePath(`/projects/${projectId}/settings`)

  return {
    success: true,
    data: {
      id: updated.id,
      name: updated.name,
      processingMode: updated.processingMode,
      autoPassThreshold: updated.autoPassThreshold,
    },
  }
}
