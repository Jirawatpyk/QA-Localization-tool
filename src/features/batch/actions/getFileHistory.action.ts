'use server'

import 'server-only'

import { and, eq, desc } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { scores } from '@/db/schema/scores'
import { getFileHistorySchema } from '@/features/batch/validation/batchSchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

const PAGE_SIZE = 50

type FileHistoryEntry = {
  fileId: string
  fileName: string
  mqmScore: number | null
  criticalCount: number | null
  status: string
  createdAt: Date
  lastReviewerName: string | null
}

type FileHistoryData = {
  files: FileHistoryEntry[]
  totalCount: number
}

export async function getFileHistory(input: unknown): Promise<ActionResult<FileHistoryData>> {
  const parsed = getFileHistorySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input', code: 'VALIDATION_ERROR' }
  }

  const { projectId, filter, page } = parsed.data

  try {
    const currentUser = await requireRole('qa_reviewer')
    const tenantId = currentUser.tenantId

    // Query 1: Get project auto_pass_threshold for filtering
    const [project] = await db
      .select({ autoPassThreshold: projects.autoPassThreshold })
      .from(projects)
      .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))

    const threshold = project?.autoPassThreshold ?? 95

    // Query 2: Files with scores
    const allFiles = await db
      .select({
        fileId: files.id,
        fileName: files.fileName,
        mqmScore: scores.mqmScore,
        criticalCount: scores.criticalCount,
        status: files.status,
        createdAt: files.createdAt,
      })
      .from(files)
      .leftJoin(
        scores,
        and(
          eq(scores.fileId, files.id),
          eq(scores.layerCompleted, 'L1'),
          withTenant(scores.tenantId, tenantId),
        ),
      )
      .where(and(withTenant(files.tenantId, tenantId), eq(files.projectId, projectId)))
      .orderBy(desc(files.createdAt))

    // Application-side filtering
    const filtered = allFiles.filter((f) => {
      if (filter === 'all') return true

      const isPassed =
        f.status === 'auto_passed' ||
        (f.mqmScore !== null && f.mqmScore >= threshold && (f.criticalCount ?? 0) === 0)
      const isFailed = f.status === 'failed'

      if (filter === 'passed') return isPassed
      if (filter === 'failed') return isFailed
      if (filter === 'needs_review') return !isPassed && !isFailed
      return true
    })

    // Map to include lastReviewerName (null until Epic 4 implements review actions)
    const mappedFiles = filtered.map((f) => ({
      ...f,
      lastReviewerName: null as string | null, // TODO: Epic 4 — join reviewActions + users for actual reviewer name
    }))

    // Pagination
    const currentPage = page ?? 1
    const offset = (currentPage - 1) * PAGE_SIZE
    const paged = mappedFiles.slice(offset, offset + PAGE_SIZE)

    return {
      success: true,
      data: {
        files: paged,
        totalCount: mappedFiles.length,
      },
    }
  } catch (err) {
    logger.error({ err, projectId }, 'getFileHistory failed')
    return { success: false, error: 'Failed to fetch file history', code: 'INTERNAL_ERROR' }
  }
}
