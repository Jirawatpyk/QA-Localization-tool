import { and, eq } from 'drizzle-orm'
import { NonRetriableError } from 'inngest'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { runL2ForFile } from '@/features/pipeline/helpers/runL2ForFile'
import { runL3ForFile } from '@/features/pipeline/helpers/runL3ForFile'
import { scoreFile } from '@/features/scoring/helpers/scoreFile'
import { checkProjectBudget } from '@/lib/ai/budget'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import {
  L1_COMPLETED_STATUSES,
  pipelineRetryEventSchema,
  type DbFileStatus,
  type PipelineLayer,
  type ProcessingMode,
} from '@/types/pipeline'
import type { TenantId } from '@/types/tenant'

// ── Config ──

export const retryFailedLayersConfig = {
  id: 'retry-failed-layers',
  retries: 3 as const,
  concurrency: {
    limit: 1,
    key: 'event.data.projectId',
  },
}

// ── Types ──

type RetryEvent = {
  data: {
    fileId: string
    projectId: string
    tenantId: TenantId
    userId: string
    layersToRetry: PipelineLayer[]
    mode: ProcessingMode
    /** CR-C1: L2 failed chunk segment IDs from original run — forwarded to L3 as "unscreened" */
    l2FailedChunkSegmentIds?: string[]
  }
}

type OnFailureEvent = {
  data: {
    event: RetryEvent
    error: { message: string }
  }
}

type StepApi = {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>
  sendEvent: (id: string, event: unknown) => Promise<void>
}

// ── Handler ──

const handlerFn = async ({ event, step }: { event: RetryEvent; step: StepApi }) => {
  // Goal D: Validate tenantId UUID — reject forged/corrupted event data
  if (!pipelineRetryEventSchema.safeParse(event.data).success) {
    throw new NonRetriableError('Invalid retry event data: tenantId must be a valid UUID')
  }
  const { fileId, projectId, tenantId, userId, layersToRetry, mode } = event.data

  // Step 0: Validate project still exists (guard — project may be deleted between enqueue and execution)
  await step.run(`validate-project-${fileId}`, async () => {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))

    if (rows.length === 0) {
      throw new NonRetriableError(`Retry aborted — project not found: ${projectId}`)
    }
  })

  // Step 1: Budget check
  await step.run(`budget-check-${fileId}`, async () => {
    const budget = await checkProjectBudget(projectId, tenantId)

    if (!budget.hasQuota) {
      throw new NonRetriableError('AI quota exhausted')
    }

    logger.info(
      { projectId, remainingBudgetUsd: budget.remainingBudgetUsd },
      'retryFailedLayers: budget check passed',
    )
  })

  // Track which layer completed successfully for partial scoring.
  // If L2 is NOT being retried, it means L2 was already done → baseline is L1L2.
  const retryL2 = layersToRetry.includes('L2')
  const retryL3 = layersToRetry.includes('L3')
  let lastCompletedLayer: 'L1' | 'L1L2' | 'L1L2L3' = retryL2 ? 'L1' : 'L1L2'
  // CR-C1 fix: when L2 is not retried, use forwarded IDs from event data (TD-AI-006)
  let l2FailedChunkSegmentIds: string[] = retryL2
    ? [] // Will be populated from L2 result below
    : (event.data.l2FailedChunkSegmentIds ?? [])

  // Try-catch at handler level (NOT inside step.run) per Inngest guardrail
  try {
    // Step 2: Retry L2 if requested
    if (retryL2) {
      // Reset + L2 in same step: CAS guard in runL2ForFile expects 'l1_completed'.
      // If L2 fails, runL2ForFile catch sets status to 'failed'. On Inngest retry,
      // memoized steps are replayed from cache (NOT re-executed). If reset and L2
      // were separate steps, the reset would NOT re-execute on retry, leaving status
      // as 'failed' → CAS guard always fails. Merging ensures reset runs on every retry.
      const l2Result = await step.run(`retry-l2-${fileId}`, async () => {
        await db
          .update(files)
          .set({ status: 'l1_completed', updatedAt: new Date() })
          .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))

        return runL2ForFile({ fileId, projectId, tenantId, userId })
      })

      // CR-C2: capture failed chunk segment IDs for L3 (TD-AI-006 parity with processFile.ts)
      l2FailedChunkSegmentIds = l2Result.failedChunkSegmentIds

      // Score after L2
      await step.run(`score-retry-l2-${fileId}`, () =>
        scoreFile({ fileId, projectId, tenantId, userId, layerCompleted: 'L1L2' }),
      )

      lastCompletedLayer = 'L1L2'
    }

    // Step 3: Retry L3 if requested
    if (retryL3) {
      // Same pattern as L2: merge reset + L3 into one step for retry safety
      await step.run(`retry-l3-${fileId}`, async () => {
        await db
          .update(files)
          .set({ status: 'l2_completed', updatedAt: new Date() })
          .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))

        return runL3ForFile({ fileId, projectId, tenantId, userId, l2FailedChunkSegmentIds })
      })

      // Score after L3
      await step.run(`score-retry-l3-${fileId}`, () =>
        scoreFile({ fileId, projectId, tenantId, userId, layerCompleted: 'L1L2L3' }),
      )

      lastCompletedLayer = 'L1L2L3'
    }
  } catch (err) {
    // Partial failure — set ai_partial status and score with partial flag
    logger.error(
      { err, fileId, lastCompletedLayer },
      'retryFailedLayers: layer retry failed — setting ai_partial',
    )

    await step.run(`set-partial-retry-${fileId}`, async () => {
      await db
        .update(files)
        .set({ status: 'ai_partial', updatedAt: new Date() })
        .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))
    })

    await step.run(`score-partial-retry-${fileId}`, () =>
      scoreFile({
        fileId,
        projectId,
        tenantId,
        userId,
        scoreStatus: 'partial',
        layerCompleted: lastCompletedLayer,
      }),
    )

    return {
      fileId,
      mode,
      layersToRetry,
      lastCompletedLayer,
      aiPartial: true,
    }
  }

  return {
    fileId,
    mode,
    layersToRetry,
    lastCompletedLayer,
    aiPartial: false,
  }
}

// ── onFailure ──

const onFailureFn = async ({ event }: { event: OnFailureEvent; step: StepApi }) => {
  // Inngest v3 nested structure: event.data.event.data = original event data
  const { fileId, tenantId } = event.data.event.data

  logger.error(
    { fileId, error: event.data.error.message },
    'retryFailedLayers: function failed after all retries',
  )

  try {
    // Query current file status to determine if L1+ completed (partial results exist)
    const [currentFile] = await db
      .select({ id: files.id, status: files.status })
      .from(files)
      .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))

    if (!currentFile) {
      logger.warn(
        { fileId },
        'retryFailedLayers onFailure: file not found — skipping status update',
      )
      return
    }

    const hasPartialResults = L1_COMPLETED_STATUSES.has(currentFile.status as DbFileStatus)

    if (hasPartialResults) {
      // Set ai_partial — don't set 'failed' since partial results exist
      await db
        .update(files)
        .set({ status: 'ai_partial', updatedAt: new Date() })
        .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))
    }
    // Otherwise keep current status — don't overwrite with 'failed' for retry context
  } catch (dbErr) {
    logger.error(
      { err: dbErr, fileId },
      'retryFailedLayers: failed to update file status in onFailure',
    )
  }
}

// ── Export ──

// Expose handler + onFailure via Object.assign for direct unit testing (Guardrail #10)
export const retryFailedLayers = Object.assign(
  inngest.createFunction(
    {
      id: retryFailedLayersConfig.id,
      retries: retryFailedLayersConfig.retries,
      concurrency: [
        {
          key: retryFailedLayersConfig.concurrency.key,
          limit: retryFailedLayersConfig.concurrency.limit,
        },
      ],
      onFailure: onFailureFn,
    },
    { event: 'pipeline.retry-failed-layers' as const },
    handlerFn,
  ),
  {
    handler: handlerFn,
    onFailure: onFailureFn,
  },
)
