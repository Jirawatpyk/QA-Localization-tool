'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { projects } from '@/db/schema/projects'
import { uploadBatches } from '@/db/schema/uploadBatches'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

import type { BatchRecord } from '../types'
import { createBatchSchema } from '../validation/uploadSchemas'

export async function createBatch(input: unknown): Promise<ActionResult<BatchRecord>> {
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return { success: false, code: 'UNAUTHORIZED', error: 'Authentication required' }
  }

  const parsed = createBatchSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { projectId, fileCount } = parsed.data

  // verify projectId belongs to the authenticated tenant (cross-tenant FK injection guard)
  const [ownedProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(withTenant(projects.tenantId, currentUser.tenantId), eq(projects.id, projectId)))
    .limit(1)

  if (!ownedProject) {
    return { success: false, code: 'PROJECT_NOT_FOUND', error: 'Project not found' }
  }

  const [batch] = await db
    .insert(uploadBatches)
    .values({
      tenantId: currentUser.tenantId,
      projectId,
      fileCount,
      createdBy: currentUser.id,
    })
    .returning()

  if (!batch) {
    return { success: false, code: 'CREATE_FAILED', error: 'Failed to create upload batch' }
  }

  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'upload_batch',
    entityId: batch.id,
    action: 'upload_batch.created',
    newValue: { projectId, fileCount },
  })

  return {
    success: true,
    data: {
      id: batch.id,
      projectId: batch.projectId,
      tenantId: batch.tenantId,
      fileCount: batch.fileCount,
      createdAt: batch.createdAt.toISOString(),
    },
  }
}
