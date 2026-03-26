import { and, eq } from 'drizzle-orm'
import { NonRetriableError } from 'inngest'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { crossFileConsistency } from '@/features/pipeline/helpers/crossFileConsistency'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import {
  pipelineBatchCompletedEventSchema,
  type PipelineBatchCompletedEventData,
} from '@/types/pipeline'

const handlerFn = async ({
  event,
  step,
}: {
  event: { data: PipelineBatchCompletedEventData }
  step: {
    run: <T>(id: string, fn: () => Promise<T>) => Promise<T>
    sendEvent: (...args: unknown[]) => Promise<void>
  }
}) => {
  // Validate tenantId UUID — reject forged/corrupted event data (Goal D)
  // Note: schema uses .passthrough() — event.data used for typed destructuring after validation.
  if (!pipelineBatchCompletedEventSchema.safeParse(event.data).success) {
    throw new NonRetriableError('Invalid batch-completed event data: tenantId must be a valid UUID')
  }
  const { batchId, projectId, tenantId } = event.data

  logger.info({ batchId }, 'Batch complete: running cross-file consistency')

  // Resolve fileIds from batchId (canonical type doesn't carry fileIds)
  const batchFiles = await step.run('resolve-batch-files', async () => {
    // H4: Include projectId filter for defense-in-depth (parity with processFile.ts)
    const rows = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          withTenant(files.tenantId, tenantId),
          eq(files.projectId, projectId),
          eq(files.batchId, batchId),
        ),
      )
    return rows.map((r) => r.id)
  })

  if (batchFiles.length === 0) {
    logger.info({ batchId }, 'Batch has no files — skipping cross-file analysis')
    return { status: 'completed' as const, findingCount: 0 }
  }

  const result = await step.run('cross-file-consistency', async () => {
    return crossFileConsistency({
      projectId,
      tenantId,
      batchId,
      fileIds: batchFiles,
    })
  })

  logger.info({ batchId, findingCount: result.findingCount }, 'Batch cross-file analysis complete')

  return { status: 'completed' as const, findingCount: result.findingCount }
}

// H3: onFailure handler — logs error after all retries exhausted
const onFailureFn = async ({
  event,
  error,
}: {
  event: { data: { event: { data: PipelineBatchCompletedEventData } } }
  error: Error
}) => {
  const { batchId } = event.data.event.data
  logger.error({ err: error, batchId }, 'batchComplete: function failed after retries')
}

export const batchComplete = Object.assign(
  inngest.createFunction(
    {
      id: 'batch-complete-analysis',
      retries: 3,
      concurrency: [{ key: 'event.data.projectId', limit: 1 }],
      // H3: Add onFailure for error visibility (parity with processFilePipeline + processBatch)
      onFailure: onFailureFn,
    },
    { event: 'pipeline.batch-completed' },
    handlerFn,
  ),
  { handler: handlerFn, onFailure: onFailureFn },
)
