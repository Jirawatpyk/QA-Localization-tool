import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'

import type { PipelineBatchEventData } from './types'

// Shared handler logic — exposed via Object.assign for direct unit testing
const handlerFn = async ({
  event,
  step,
}: {
  event: { data: PipelineBatchEventData }
  step: {
    run: <T>(id: string, fn: () => Promise<T>) => Promise<T>
    sendEvent: (
      id: string,
      events: Array<{ name: string; data: Record<string, unknown> }>,
    ) => Promise<string[]>
  }
}) => {
  const { batchId, fileIds, projectId, tenantId, userId, mode, uploadBatchId } = event.data

  // Fan-out: batch-send all process-file events in a single step checkpoint (Inngest v3 pattern)
  await step.sendEvent(
    `dispatch-files-${batchId}`,
    fileIds.map((fileId) => ({
      name: 'pipeline.process-file' as const,
      data: {
        fileId,
        projectId,
        tenantId,
        userId,
        mode,
        uploadBatchId,
      },
    })),
  )

  return {
    batchId,
    fileCount: fileIds.length,
    status: 'dispatched' as const,
  }
}

// onFailure: log batch failure — no DB write needed (files remain in 'parsed', no transition was made)
const onFailureBatchFn = async ({
  event,
  error,
}: {
  // Inngest v3 onFailure nested structure: event.data.event.data = original event data
  event: { data: { event: { data: PipelineBatchEventData } } }
  error: Error
}) => {
  const { batchId } = event.data.event.data
  logger.error(
    { err: error, batchId },
    'processBatch: all retries exhausted — batch not dispatched',
  )
}

export const processBatch = Object.assign(
  inngest.createFunction(
    {
      id: 'process-batch-pipeline',
      retries: 3,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onFailure: onFailureBatchFn as any,
    },
    { event: 'pipeline.batch-started' as const },
    handlerFn,
  ),
  {
    handler: handlerFn,
    onFailure: onFailureBatchFn,
  },
)
