'use server'

import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findings } from '@/db/schema/findings'
import { projects } from '@/db/schema/projects'
import { scores } from '@/db/schema/scores'
import type { CrossFileFindingSummary, FileInBatch } from '@/features/batch/types'
import { getBatchSummarySchema } from '@/features/batch/validation/batchSchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

type BatchSummaryResult = {
  batchId: string
  projectId: string
  totalFiles: number
  passedCount: number
  needsReviewCount: number
  processingTimeMs: number | null
  recommendedPass: FileInBatch[]
  needsReview: FileInBatch[]
  crossFileFindings: CrossFileFindingSummary[]
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
      .leftJoin(
        scores,
        and(
          eq(scores.fileId, files.id),
          eq(scores.layerCompleted, 'L1'),
          withTenant(scores.tenantId, tenantId),
        ),
      )
      .where(
        and(
          withTenant(files.tenantId, tenantId),
          eq(files.batchId, batchId),
          eq(files.projectId, projectId),
        ),
      )

    // Classify files into groups
    const recommendedPass: FileInBatch[] = []
    const needsReview: FileInBatch[] = []

    for (const f of filesWithScores) {
      const isPass = f.mqmScore !== null && f.mqmScore >= threshold && (f.criticalCount ?? 0) === 0

      if (isPass) {
        recommendedPass.push(f)
      } else {
        needsReview.push(f)
      }
    }

    // Sort: Recommended Pass = score DESC, fileId ASC
    recommendedPass.sort(
      (a, b) => (b.mqmScore ?? 0) - (a.mqmScore ?? 0) || a.fileId.localeCompare(b.fileId),
    )

    // Sort: Need Review = score ASC, fileId ASC
    needsReview.sort(
      (a, b) => (a.mqmScore ?? 100) - (b.mqmScore ?? 100) || a.fileId.localeCompare(b.fileId),
    )

    // Calculate processing time: MAX(updatedAt) - MIN(createdAt)
    let processingTimeMs: number | null = null
    const completedFiles = filesWithScores.filter(
      (f) => f.status === 'l1_completed' || f.status === 'failed',
    )
    if (completedFiles.length > 0 && completedFiles.length === filesWithScores.length) {
      // H7: Use reduce instead of Math.max/min(...spread) to avoid stack overflow on large batches
      let maxUpdated = -Infinity
      let minCreated = Infinity
      for (const f of filesWithScores) {
        const updated = new Date(f.updatedAt).getTime()
        const created = new Date(f.createdAt).getTime()
        if (updated > maxUpdated) maxUpdated = updated
        if (created < minCreated) minCreated = created
      }
      processingTimeMs = maxUpdated - minCreated
    }

    // H1: Query cross-file findings for files in this batch (AC#7)
    const fileIds = filesWithScores.map((f) => f.fileId)
    const crossFileRows =
      fileIds.length > 0
        ? await db
            .select({
              id: findings.id,
              description: findings.description,
              sourceTextExcerpt: findings.sourceTextExcerpt,
              relatedFileIds: findings.relatedFileIds,
            })
            .from(findings)
            .where(
              and(
                withTenant(findings.tenantId, tenantId),
                eq(findings.projectId, projectId),
                eq(findings.scope, 'cross-file'),
                inArray(findings.fileId, fileIds),
              ),
            )
        : []

    const crossFileFindings: CrossFileFindingSummary[] = crossFileRows.map((f) => ({
      id: f.id,
      description: f.description,
      sourceTextExcerpt: f.sourceTextExcerpt,
      relatedFileIds: (f.relatedFileIds as string[]) ?? [],
    }))

    return {
      success: true,
      data: {
        batchId,
        projectId,
        totalFiles: filesWithScores.length,
        passedCount: recommendedPass.length,
        needsReviewCount: needsReview.length,
        processingTimeMs,
        recommendedPass,
        needsReview,
        crossFileFindings,
      },
    }
  } catch (err) {
    logger.error({ err, batchId, projectId }, 'getBatchSummary failed')
    return { success: false, error: 'Failed to fetch batch summary', code: 'INTERNAL_ERROR' }
  }
}
