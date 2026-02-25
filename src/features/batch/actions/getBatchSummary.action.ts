'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { scores } from '@/db/schema/scores'
import { getBatchSummarySchema } from '@/features/batch/validation/batchSchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

type FileInBatch = {
  fileId: string
  fileName: string
  status: string
  createdAt: Date
  updatedAt: Date
  mqmScore: number | null
  scoreStatus: string | null
  criticalCount: number | null
  majorCount: number | null
  minorCount: number | null
}

type BatchSummaryResult = {
  batchId: string
  projectId: string
  totalFiles: number
  passedCount: number
  needsReviewCount: number
  processingTimeMs: number | null
  recommendedPass: FileInBatch[]
  needReview: FileInBatch[]
}

export async function getBatchSummary(input: unknown): Promise<ActionResult<BatchSummaryResult>> {
  const parsed = getBatchSummarySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input', code: 'VALIDATION_ERROR' }
  }

  const { batchId, projectId } = parsed.data

  try {
    const currentUser = await requireRole('qa_reviewer')
    const tenantId = currentUser.tenantId

    // Query 1: Get project auto_pass_threshold
    const [project] = await db
      .select({ autoPassThreshold: projects.autoPassThreshold })
      .from(projects)
      .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))

    const threshold = project?.autoPassThreshold ?? 95

    // Query 2: Files in batch with scores (filter L1 scores only)
    const filesWithScores = await db
      .select({
        fileId: files.id,
        fileName: files.fileName,
        status: files.status,
        createdAt: files.createdAt,
        updatedAt: files.updatedAt,
        mqmScore: scores.mqmScore,
        scoreStatus: scores.status,
        criticalCount: scores.criticalCount,
        majorCount: scores.majorCount,
        minorCount: scores.minorCount,
      })
      .from(files)
      .leftJoin(scores, and(eq(scores.fileId, files.id), withTenant(scores.tenantId, tenantId)))
      .where(
        and(
          withTenant(files.tenantId, tenantId),
          eq(files.batchId, batchId),
          eq(files.projectId, projectId),
        ),
      )

    // Classify files into groups
    const recommendedPass: FileInBatch[] = []
    const needReview: FileInBatch[] = []

    for (const f of filesWithScores) {
      const isPass = f.mqmScore !== null && f.mqmScore >= threshold && (f.criticalCount ?? 0) === 0

      if (isPass) {
        recommendedPass.push(f)
      } else {
        needReview.push(f)
      }
    }

    // Sort: Recommended Pass = score DESC, fileId ASC
    recommendedPass.sort(
      (a, b) => (b.mqmScore ?? 0) - (a.mqmScore ?? 0) || a.fileId.localeCompare(b.fileId),
    )

    // Sort: Need Review = score ASC, fileId ASC
    needReview.sort(
      (a, b) => (a.mqmScore ?? 100) - (b.mqmScore ?? 100) || a.fileId.localeCompare(b.fileId),
    )

    // Calculate processing time: MAX(updatedAt) - MIN(createdAt)
    let processingTimeMs: number | null = null
    const completedFiles = filesWithScores.filter(
      (f) => f.status === 'l1_completed' || f.status === 'failed',
    )
    if (completedFiles.length > 0 && completedFiles.length === filesWithScores.length) {
      const maxUpdated = Math.max(...filesWithScores.map((f) => new Date(f.updatedAt).getTime()))
      const minCreated = Math.min(...filesWithScores.map((f) => new Date(f.createdAt).getTime()))
      processingTimeMs = maxUpdated - minCreated
    }

    return {
      success: true,
      data: {
        batchId,
        projectId,
        totalFiles: filesWithScores.length,
        passedCount: recommendedPass.length,
        needsReviewCount: needReview.length,
        processingTimeMs,
        recommendedPass,
        needReview,
      },
    }
  } catch (err) {
    logger.error({ err, batchId, projectId }, 'getBatchSummary failed')
    return { success: false, error: 'Failed to fetch batch summary', code: 'INTERNAL_ERROR' }
  }
}
