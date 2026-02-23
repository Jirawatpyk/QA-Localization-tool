'use server'

import 'server-only'

import { db } from '@/db/client'
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
