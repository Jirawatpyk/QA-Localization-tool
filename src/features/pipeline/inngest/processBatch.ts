import { inngest } from '@/lib/inngest/client'

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

export const processBatch = Object.assign(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (inngest.createFunction as any)(
    { id: 'process-batch-pipeline' },
    { event: 'pipeline.batch-started' },
    handlerFn,
  ),
  {
    handler: handlerFn,
  },
)
