import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { runL1ForFile } from '@/features/pipeline/helpers/runL1ForFile'
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

  // Step 2: Calculate MQM score — L1 only at this pipeline stage
  const scoreResult = await step.run(`score-${fileId}`, () =>
    scoreFile({ fileId, projectId, tenantId, userId, layerFilter: 'L1' }),
  )

  // Step 3: Check if batch is complete (all files l1_completed or failed)
  // Guard: files.batchId is nullable — skip for non-batch uploads
  if (uploadBatchId) {
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
        (f) => f.status === 'l1_completed' || f.status === 'failed',
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
    findingCount: l1Result.findingCount,
    mqmScore: scoreResult.mqmScore,
    layerCompleted: 'L1' as const,
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
      // onFailureFn type doesn't match Inngest's FailureEventPayload<T> generic; scoped cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onFailure: onFailureFn as any,
    },
    { event: 'pipeline.process-file' as const },
    handlerFn,
  ),
  {
    handler: handlerFn,
    onFailure: onFailureFn,
  },
)
