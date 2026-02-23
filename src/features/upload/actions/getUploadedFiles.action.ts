'use server'

import 'server-only'

import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

type UploadedFile = {
  id: string
  fileName: string
  fileType: string
  fileSizeBytes: number
  fileHash: string | null
  status: string
  storagePath: string
  batchId: string | null
  createdAt: string
}

const getUploadedFilesSchema = z.object({
  projectId: z.string().uuid(),
})

export async function getUploadedFiles(input: unknown): Promise<ActionResult<UploadedFile[]>> {
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'read')
  } catch {
    return { success: false, code: 'UNAUTHORIZED', error: 'Authentication required' }
  }

  const parsed = getUploadedFilesSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { projectId } = parsed.data

  const rows = await db
    .select({
      id: files.id,
      fileName: files.fileName,
      fileType: files.fileType,
      fileSizeBytes: files.fileSizeBytes,
      fileHash: files.fileHash,
      status: files.status,
      storagePath: files.storagePath,
      batchId: files.batchId,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(and(withTenant(files.tenantId, currentUser.tenantId), eq(files.projectId, projectId)))
    .orderBy(desc(files.createdAt))

  return {
    success: true,
    data: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}
