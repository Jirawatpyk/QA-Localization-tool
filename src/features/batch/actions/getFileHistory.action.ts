'use server'

import 'server-only'

import { and, eq, desc, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { fileAssignments } from '@/db/schema/fileAssignments'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { reviewActions } from '@/db/schema/reviewActions'
import { scores } from '@/db/schema/scores'
import { users } from '@/db/schema/users'
import { FILE_HISTORY_PAGE_SIZE } from '@/features/batch/types'
import { getFileHistorySchema } from '@/features/batch/validation/batchSchemas'
import { DEFAULT_AUTO_PASS_THRESHOLD } from '@/features/scoring/constants'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type { DbFileStatus } from '@/types/pipeline'

type FileHistoryEntry = {
  fileId: string
  fileName: string
  mqmScore: number | null
  criticalCount: number | null
  status: DbFileStatus
  createdAt: Date
  lastReviewerName: string | null
  assigneeName: string | null
  assignmentPriority: 'normal' | 'urgent' | null
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

    const threshold = project?.autoPassThreshold ?? DEFAULT_AUTO_PASS_THRESHOLD

    // Query 2: Files with scores (hard cap to prevent unbounded memory on large projects)
    const QUERY_HARD_CAP = 10_000
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
      .leftJoin(scores, and(eq(scores.fileId, files.id), withTenant(scores.tenantId, tenantId)))
      .where(and(withTenant(files.tenantId, tenantId), eq(files.projectId, projectId)))
      .orderBy(desc(files.createdAt))
      .limit(QUERY_HARD_CAP)

    // Application-side filtering
    const filtered = allFiles.filter((f) => {
      if (filter === 'all') return true

      const isPassed =
        f.mqmScore !== null && f.mqmScore >= threshold && (f.criticalCount ?? 0) === 0
      const isFailed = f.status === 'failed'

      if (filter === 'passed') return isPassed
      if (filter === 'failed') return isFailed
      if (filter === 'needs_review') return !isPassed && !isFailed
      return true
    })

    // Query 3: Get last reviewer name per file via review_actions JOIN users
    // Guardrail #5: skip inArray if no file IDs
    const fileIds = filtered.map((f) => f.fileId)
    const reviewerMap = new Map<string, string>()

    if (fileIds.length > 0) {
      const reviewerRows = await db
        .select({
          fileId: reviewActions.fileId,
          displayName: users.displayName,
          createdAt: reviewActions.createdAt,
        })
        .from(reviewActions)
        .innerJoin(users, eq(users.id, reviewActions.userId))
        .where(
          and(withTenant(reviewActions.tenantId, tenantId), inArray(reviewActions.fileId, fileIds)),
        )
        .orderBy(desc(reviewActions.createdAt))

      // Keep only the most recent reviewer per file (first occurrence due to DESC order)
      for (const row of reviewerRows) {
        if (!reviewerMap.has(row.fileId)) {
          reviewerMap.set(row.fileId, row.displayName)
        }
      }
    }

    // Query 4: Active file assignments (Story 6.1)
    const assignmentMap = new Map<string, { assigneeName: string; priority: string }>()

    if (fileIds.length > 0) {
      const assignmentRows = await db
        .select({
          fileId: fileAssignments.fileId,
          assigneeName: users.displayName,
          priority: fileAssignments.priority,
        })
        .from(fileAssignments)
        .innerJoin(users, eq(users.id, fileAssignments.assignedTo))
        .where(
          and(
            withTenant(fileAssignments.tenantId, tenantId),
            inArray(fileAssignments.fileId, fileIds),
            inArray(fileAssignments.status, ['assigned', 'in_progress']),
          ),
        )
        .orderBy(desc(fileAssignments.updatedAt))

      for (const row of assignmentRows) {
        if (!assignmentMap.has(row.fileId)) {
          assignmentMap.set(row.fileId, { assigneeName: row.assigneeName, priority: row.priority })
        }
      }
    }

    // SAFETY: Drizzle infers varchar → string; DB CHECK constraint guarantees valid DbFileStatus
    const mappedFiles: FileHistoryEntry[] = filtered.map((f) => {
      const assignment = assignmentMap.get(f.fileId)
      return {
        ...f,
        status: f.status as DbFileStatus,
        lastReviewerName: reviewerMap.get(f.fileId) ?? null,
        assigneeName: assignment?.assigneeName ?? null,
        assignmentPriority: (assignment?.priority as 'normal' | 'urgent') ?? null,
      }
    })

    // Pagination
    const currentPage = page ?? 1
    const offset = (currentPage - 1) * FILE_HISTORY_PAGE_SIZE
    const paged = mappedFiles.slice(offset, offset + FILE_HISTORY_PAGE_SIZE)

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
