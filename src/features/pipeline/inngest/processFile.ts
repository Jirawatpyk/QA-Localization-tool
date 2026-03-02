import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { runL1ForFile } from '@/features/pipeline/helpers/runL1ForFile'
import { runL2ForFile } from '@/features/pipeline/helpers/runL2ForFile'
import { runL3ForFile } from '@/features/pipeline/helpers/runL3ForFile'
import { scoreFile } from '@/features/scoring/helpers/scoreFile'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'

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
  const { fileId, projectId, tenantId, userId, mode, uploadBatchId } = event.data

  // Step 1: Run L1 rule engine (deterministic checks, Xbench parity)
  const l1Result = await step.run(`l1-rules-${fileId}`, () =>
    runL1ForFile({ fileId, projectId, tenantId, userId }),
  )

  // Step 2: Calculate interim L1 score — visible immediately per FR15
  await step.run(`score-l1-${fileId}`, () =>
    scoreFile({ fileId, projectId, tenantId, userId, layerFilter: 'L1' }),
  )

  // Step 3: Run L2 AI screening
  // Guardrail #21: chunk-level iteration is handled inside runL2ForFile —
  // one Inngest step per file, not per chunk (Architecture Decision from Prep P4)
  const l2Result = await step.run(`l2-screening-${fileId}`, () =>
    runL2ForFile({ fileId, projectId, tenantId, userId }),
  )

  // Step 4: Recalculate score with ALL layers: L1 + L2
  const l2ScoreResult = await step.run(`score-l1l2-${fileId}`, () =>
    scoreFile({ fileId, projectId, tenantId, userId, layerCompleted: 'L1L2' }),
  )

  // Steps 5-6: Thorough mode — run L3 deep analysis + final score
  let l3Result: { findingCount: number; partialFailure: boolean } | null = null
  let finalScoreResult = l2ScoreResult

  if (mode === 'thorough') {
    // provisional L3 — Story 3.3 will add selective-segment filtering
    const l3Raw = await step.run(`l3-analysis-${fileId}`, () =>
      runL3ForFile({ fileId, projectId, tenantId, userId }),
    )
    l3Result = { findingCount: l3Raw.findingCount, partialFailure: l3Raw.partialFailure }

    finalScoreResult = await step.run(`score-all-${fileId}`, () =>
      scoreFile({ fileId, projectId, tenantId, userId, layerCompleted: 'L1L2L3' }),
    )
  }

  // Step 7: Check if batch is complete — mode-aware terminal status
  // Guard: files.batchId is nullable — skip for non-batch uploads
  if (uploadBatchId) {
    // Type-safe terminal status based on processing mode
    const terminalStatus: 'l2_completed' | 'l3_completed' =
      mode === 'thorough' ? 'l3_completed' : 'l2_completed'

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

      const allCompleted = batchFiles.every(
        (f) => f.status === terminalStatus || f.status === 'failed',
      )

      return { allCompleted, fileCount: batchFiles.length }
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
    l2FindingCount: l2Result.findingCount,
    l3FindingCount: l3Result ? l3Result.findingCount : null,
    mqmScore: finalScoreResult.mqmScore,
    layerCompleted: mode === 'thorough' ? ('L1L2L3' as const) : ('L1L2' as const),
    l2PartialFailure: l2Result.partialFailure,
  }
}

// onFailure: update file status to failed + log — no step.run (called after all retries exhausted)
const onFailureFn = async ({
  event,
  error,
}: {
  // Inngest v3 onFailure nested structure: event.data.event.data = original event data
  event: { data: { event: { data: PipelineFileEventData } } }
  error: Error
}) => {
  const { fileId, tenantId } = event.data.event.data

  logger.error({ err: error, fileId }, 'processFilePipeline: function failed')

  try {
    await db
      .update(files)
      .set({ status: 'failed', updatedAt: new Date() })
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
