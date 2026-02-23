'use server'

import 'server-only'

import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { scores } from '@/db/schema/scores'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

import type { DuplicateCheckResult } from '../types'
import { checkDuplicateSchema } from '../validation/uploadSchemas'

export async function checkDuplicate(input: unknown): Promise<ActionResult<DuplicateCheckResult>> {
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'read')
  } catch {
    return { success: false, code: 'UNAUTHORIZED', error: 'Authentication required' }
  }

  const parsed = checkDuplicateSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { fileHash, projectId } = parsed.data

  const [existing] = await db
    .select({
      id: files.id,
      createdAt: files.createdAt,
      mqmScore: scores.mqmScore,
    })
    .from(files)
    .leftJoin(
      scores,
      and(eq(scores.fileId, files.id), withTenant(scores.tenantId, currentUser.tenantId)),
    )
    .where(
      and(
        withTenant(files.tenantId, currentUser.tenantId),
        eq(files.projectId, projectId),
        eq(files.fileHash, fileHash),
      ),
    )
    .orderBy(desc(files.createdAt))
    .limit(1)

  if (!existing) {
    return { success: true, data: { isDuplicate: false } }
  }

  return {
    success: true,
    data: {
      isDuplicate: true,
      originalUploadDate: existing.createdAt.toISOString(),
      existingScore: existing.mqmScore ?? null,
      existingFileId: existing.id,
    },
  }
}
