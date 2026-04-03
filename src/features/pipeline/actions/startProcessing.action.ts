'use server'

import 'server-only'

import { randomUUID } from 'crypto'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { uploadBatches } from '@/db/schema/uploadBatches'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { startProcessingSchema } from '@/features/pipeline/validation/pipelineSchema'
import { checkProjectBudget } from '@/lib/ai/budget'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import { aiPipelineLimiter } from '@/lib/ratelimit'
import type { ActionResult } from '@/types/actionResult'
import type { UploadBatchId } from '@/types/pipeline'

type StartProcessingResult = {
  batchId: string
  fileCount: number
}

export async function startProcessing(
  input: unknown,
): Promise<ActionResult<StartProcessingResult>> {
  // Validate input
  const parsed = startProcessingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'INVALID_INPUT', error: parsed.error.message }
  }
  const { fileIds, projectId, mode } = parsed.data

  // Auth
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }
  const { tenantId, id: userId } = currentUser

  try {
    // Rate limit guard — check BEFORE budget (most restrictive wins)
    const { success: allowed } = await aiPipelineLimiter.limit(userId)
    if (!allowed) {
      return {
        success: false,
        code: 'RATE_LIMITED',
        error: 'Rate limit exceeded — please wait before starting another analysis',
      }
    }

    // Budget guard — check project budget before triggering pipeline
    const budget = await checkProjectBudget(projectId, tenantId)
    if (!budget.hasQuota) {
      return {
        success: false,
        code: 'BUDGET_EXHAUSTED',
        error: `AI budget exhausted ($${budget.usedBudgetUsd.toFixed(2)}/$${budget.monthlyBudgetUsd?.toFixed(2) ?? '∞'}). Upgrade plan or set new budget`,
      }
    }
    // Validate files: all must exist in this project + tenant (regardless of status first)
    const foundFiles = await db
      .select({ id: files.id, status: files.status })
      .from(files)
      .where(
        and(
          withTenant(files.tenantId, tenantId),
          eq(files.projectId, projectId),
          inArray(files.id, fileIds),
        ),
      )

    if (foundFiles.length !== fileIds.length) {
      return {
        success: false,
        code: 'NOT_FOUND',
        error: 'One or more files not found in this project',
      }
    }

    // Validate all files are in parsed status (ready for pipeline)
    const notParsed = foundFiles.filter((f) => f.status !== 'parsed')
    if (notParsed.length > 0) {
      return {
        success: false,
        code: 'CONFLICT',
        error: 'One or more files are not in parsed status',
      }
    }

    // Persist processing mode to project for UI display
    await db
      .update(projects)
      .set({ processingMode: mode })
      .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))

    // Generate batch ID for this pipeline run
    const batchId = randomUUID()

    // Create an uploadBatches row for this pipeline run so files.batchId FK is satisfied.
    // P1-1: files need batchId for processFile.ts batch completion check.
    // files.batchId has FK → uploadBatches.id, so we must INSERT the batch first.
    await db.insert(uploadBatches).values({
      id: batchId,
      projectId,
      tenantId,
      createdBy: userId,
      fileCount: fileIds.length,
    })

    // Set batchId on selected files so processFile.ts batch completion check
    // can find them via `eq(files.batchId, uploadBatchId)`.
    await db
      .update(files)
      .set({ batchId, updatedAt: new Date() })
      .where(
        and(
          withTenant(files.tenantId, tenantId),
          eq(files.projectId, projectId),
          inArray(files.id, fileIds),
        ),
      )

    // Dispatch batch event to Inngest (fan-out handled by processBatch function)
    // NOTE: uploadBatchId reuses batchId (pipeline batch) as a proxy for upload batch tracking.
    // Files can originate from multiple upload batches; deriving a single uploadBatchId from
    // file records is deferred to Epic 3 when upload-to-pipeline traceability is required.
    await inngest.send({
      name: 'pipeline.batch-started',
      data: {
        batchId,
        fileIds,
        projectId,
        tenantId,
        userId,
        mode,
        uploadBatchId: batchId as UploadBatchId,
      },
    })

    // Write audit log (non-fatal — pipeline already triggered)
    try {
      await writeAuditLog({
        tenantId,
        userId,
        entityType: 'project',
        entityId: projectId,
        action: 'pipeline.started',
        newValue: {
          mode,
          fileCount: fileIds.length,
          batchId,
        },
      })
    } catch (auditErr) {
      logger.warn({ err: auditErr, projectId }, 'Audit log write failed for pipeline.started')
    }

    return {
      success: true,
      data: {
        batchId,
        fileCount: fileIds.length,
      },
    }
  } catch (err) {
    logger.error({ err, projectId }, 'startProcessing failed')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to start processing' }
  }
}
