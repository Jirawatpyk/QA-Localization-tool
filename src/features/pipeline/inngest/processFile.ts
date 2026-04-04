import { and, eq, isNull } from 'drizzle-orm'
import { NonRetriableError } from 'inngest'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { uploadBatches } from '@/db/schema/uploadBatches'
import { runL1ForFile } from '@/features/pipeline/helpers/runL1ForFile'
import { runL2ForFile } from '@/features/pipeline/helpers/runL2ForFile'
import { runL3ForFile } from '@/features/pipeline/helpers/runL3ForFile'
import { scoreFile } from '@/features/scoring/helpers/scoreFile'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { LayerCompleted } from '@/types/finding'
import {
  L1_COMPLETED_STATUSES,
  pipelineFileEventSchema,
  type DbFileStatus,
  type PipelineLayer,
} from '@/types/pipeline'
import { validateTenantId } from '@/types/tenant'

import type { PipelineFileEventData } from './types'

// Shared handler logic — exposed via Object.assign for direct unit testing
const handlerFn = async ({
  event,
  step,
}: {
  event: { data: PipelineFileEventData }
  step: {
    run: <T>(id: string, fn: () => Promise<T>) => Promise<T>
    sendEvent: (id: string, event: unknown) => Promise<void>
  }
}) => {
  // Validate tenantId UUID — reject forged/corrupted event data (Goal D)
  // Note: schema uses .passthrough() so parsed.data has unknown types for non-tenantId fields.
  // We use event.data (typed via PipelineFileEventData) for destructuring after validation passes.
  if (!pipelineFileEventSchema.safeParse(event.data).success) {
    throw new NonRetriableError('Invalid file event data: tenantId must be a valid UUID')
  }
  const { fileId, projectId, tenantId, userId, mode, uploadBatchId } = event.data
  const failedLayers: PipelineLayer[] = []

  // Step 1: Run L1 rule engine (deterministic checks, Xbench parity)
  const l1Result = await step.run(`l1-rules-${fileId}`, () =>
    runL1ForFile({ fileId, projectId, tenantId, userId }),
  )

  // Step 2: Calculate interim L1 score — visible immediately per FR15
  const l1ScoreResult = await step.run(`score-l1-${fileId}`, () =>
    scoreFile({ fileId, projectId, tenantId, userId, layerFilter: 'L1' }),
  )

  // S-FIX-5: Emit score.updated for pipeline observability (parity with review's finding.changed)
  await step.sendEvent(`score-updated-l1-${fileId}`, {
    name: 'score.updated' as const,
    data: {
      fileId,
      projectId,
      tenantId,
      layerCompleted: 'L1' as const,
      mqmScore: l1ScoreResult?.mqmScore ?? 0,
      scoreStatus: l1ScoreResult?.status ?? 'calculated',
    },
  })

  // Step 3: Run L2 AI screening — wrapped in try-catch for partial results (AC5)
  let l2Result: Awaited<ReturnType<typeof runL2ForFile>> | null = null
  try {
    l2Result = await step.run(`l2-screening-${fileId}`, () =>
      runL2ForFile({ fileId, projectId, tenantId, userId }),
    )
  } catch (l2Err) {
    logger.error({ err: l2Err, fileId }, 'L2 failed — preserving L1 results with ai_partial status')
    failedLayers.push('L2')
  }

  // Step 4: Recalculate score — depends on L2 outcome
  let finalScoreResult: Awaited<ReturnType<typeof scoreFile>> | undefined
  let layerCompleted: LayerCompleted = 'L1'
  let l3Result: { findingCount: number } | null = null

  if (l2Result) {
    // L2 succeeded: score with L1+L2
    finalScoreResult = await step.run(`score-l1l2-${fileId}`, () =>
      scoreFile({ fileId, projectId, tenantId, userId, layerCompleted: 'L1L2' }),
    )
    layerCompleted = 'L1L2'

    // S-FIX-5: Emit score.updated after L1L2 scoring
    await step.sendEvent(`score-updated-l1l2-${fileId}`, {
      name: 'score.updated' as const,
      data: {
        fileId,
        projectId,
        tenantId,
        layerCompleted: 'L1L2' as const,
        mqmScore: finalScoreResult?.mqmScore ?? 0,
        scoreStatus: finalScoreResult?.status ?? 'calculated',
      },
    })

    // Steps 5-6: Thorough mode — run L3 deep analysis + final score
    if (mode === 'thorough') {
      try {
        // TD-AI-006: Pass failed chunk segment IDs from L2 → L3 as "unscreened"
        const l2FailedChunkSegmentIds = l2Result.failedChunkSegmentIds ?? []
        const l3Raw = await step.run(`l3-analysis-${fileId}`, () =>
          runL3ForFile({ fileId, projectId, tenantId, userId, l2FailedChunkSegmentIds }),
        )
        l3Result = { findingCount: l3Raw.findingCount }
      } catch (l3Err) {
        logger.error({ err: l3Err, fileId }, 'L3 failed — preserving L1+L2 results with ai_partial')
        failedLayers.push('L3')
      }

      if (l3Result) {
        finalScoreResult = await step.run(`score-all-${fileId}`, () =>
          scoreFile({ fileId, projectId, tenantId, userId, layerCompleted: 'L1L2L3' }),
        )
        layerCompleted = 'L1L2L3'

        // S-FIX-5: Emit score.updated after L1L2L3 scoring
        await step.sendEvent(`score-updated-l1l2l3-${fileId}`, {
          name: 'score.updated' as const,
          data: {
            fileId,
            projectId,
            tenantId,
            layerCompleted: 'L1L2L3' as const,
            mqmScore: finalScoreResult?.mqmScore ?? 0,
            scoreStatus: finalScoreResult?.status ?? 'calculated',
          },
        })
      }
    }
  }

  // Handle partial failure — set ai_partial status and re-score with partial flag
  const aiPartial = failedLayers.length > 0

  if (aiPartial) {
    await step.run(`set-partial-${fileId}`, async () => {
      await db
        .update(files)
        .set({ status: 'ai_partial', updatedAt: new Date() })
        .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))
    })

    finalScoreResult = await step.run(`score-partial-${fileId}`, () =>
      scoreFile({
        fileId,
        projectId,
        tenantId,
        userId,
        scoreStatus: 'partial',
        layerCompleted,
      }),
    )

    // S-FIX-5: Emit score.updated after partial scoring
    await step.sendEvent(`score-updated-partial-${fileId}`, {
      name: 'score.updated' as const,
      data: {
        fileId,
        projectId,
        tenantId,
        layerCompleted,
        mqmScore: finalScoreResult?.mqmScore ?? 0,
        scoreStatus: finalScoreResult?.status ?? 'partial',
      },
    })
  }

  // Step 7: Check if batch is complete — mode-aware terminal status
  // Guard: files.batchId is nullable — skip for non-batch uploads
  if (uploadBatchId) {
    // Terminal statuses include ai_partial (AC5) and failed
    const terminalStatus: DbFileStatus[] =
      mode === 'thorough'
        ? ['l3_completed', 'ai_partial', 'failed']
        : ['l2_completed', 'ai_partial', 'failed']

    const batchComplete = await step.run(`check-batch-${fileId}`, async () => {
      const batchFiles = await db
        .select({ id: files.id, status: files.status })
        .from(files)
        .where(
          and(
            withTenant(files.tenantId, tenantId),
            eq(files.projectId, projectId),
            eq(files.batchId, uploadBatchId),
          ),
        )

      const allCompleted =
        batchFiles.length > 0 &&
        batchFiles.every((f) => terminalStatus.includes(f.status as DbFileStatus))

      if (!allCompleted) return { allCompleted: false, fileCount: batchFiles.length }

      // Atomic batch completion: UPDATE...WHERE completed_at IS NULL (TD-PIPE-001)
      // Returns 0 rows if another worker already completed the batch
      const [updated] = await db
        .update(uploadBatches)
        .set({ completedAt: new Date() })
        .where(
          and(
            eq(uploadBatches.id, uploadBatchId),
            withTenant(uploadBatches.tenantId, tenantId),
            isNull(uploadBatches.completedAt),
          ),
        )
        .returning()

      return { allCompleted: !!updated, fileCount: batchFiles.length }
    })

    if (batchComplete.allCompleted) {
      await step.sendEvent(`batch-completed-${uploadBatchId}`, {
        name: 'pipeline.batch-completed',
        data: {
          batchId: uploadBatchId,
          projectId,
          tenantId,
          mode,
          userId,
        },
      })
    }
  }

  return {
    fileId,
    l1FindingCount: l1Result.findingCount,
    l2FindingCount: l2Result ? l2Result.findingCount : null,
    l3FindingCount: l3Result ? l3Result.findingCount : null,
    mqmScore: finalScoreResult?.mqmScore ?? 0,
    scoreStatus: finalScoreResult?.status ?? null,
    autoPassRationale: finalScoreResult?.autoPassRationale ?? null,
    layerCompleted,
    l2PartialFailure: l2Result?.partialFailure ?? false,
    aiPartial,
    failedLayers: aiPartial ? failedLayers : [],
  }
}

// onFailure: determine whether L1 completed (partial vs failed)
const onFailureFn = async ({
  event,
  error,
}: {
  // Inngest v3 onFailure nested structure: event.data.event.data = original event data
  event: { data: { event: { data: PipelineFileEventData } } }
  error: Error
}) => {
  const { fileId, tenantId: rawTenantId } = event.data.event.data
  // Defense-in-depth: validate tenantId in onFailure (separate invocation context)
  const tenantId = validateTenantId(rawTenantId)

  logger.error({ err: error, fileId }, 'processFilePipeline: function failed')

  try {
    // Query current file status to determine if L1 completed (partial results exist)
    const [currentFile] = await db
      .select({ id: files.id, status: files.status })
      .from(files)
      .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))

    const hasPartialResults =
      currentFile && L1_COMPLETED_STATUSES.has(currentFile.status as DbFileStatus)
    const newStatus = hasPartialResults ? 'ai_partial' : 'failed'

    await db
      .update(files)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))
  } catch (dbErr) {
    logger.error(
      { err: dbErr, fileId },
      'processFilePipeline: failed to update file status in onFailure',
    )
  }
}

export const processFilePipeline = Object.assign(
  inngest.createFunction(
    {
      id: 'process-file-pipeline',
      retries: 3,
      concurrency: [{ key: 'event.data.projectId', limit: 1 }],
      priority: { run: "event.data.priority == 'urgent' ? 100 : 0" },
      // onFailureFn registered here so Inngest runtime calls it after all retries exhausted.
      // Also exposed via Object.assign below for direct unit testing.
      onFailure: onFailureFn,
    },
    { event: 'pipeline.process-file' as const },
    handlerFn,
  ),
  {
    handler: handlerFn,
    onFailure: onFailureFn,
  },
)
