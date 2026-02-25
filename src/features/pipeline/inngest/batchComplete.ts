import { crossFileConsistency } from '@/features/pipeline/helpers/crossFileConsistency'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'

type BatchCompletedEventData = {
  batchId: string
  projectId: string
  tenantId: string
  fileIds: string[]
}

const handlerFn = async ({
  event,
  step,
}: {
  event: { data: BatchCompletedEventData }
  step: {
    run: <T>(id: string, fn: () => Promise<T>) => Promise<T>
    sendEvent: (...args: unknown[]) => Promise<void>
  }
}) => {
  const { batchId, projectId, tenantId, fileIds } = event.data

  logger.info(`Batch complete: running cross-file consistency for batch ${batchId}`)

  const result = await step.run('cross-file-consistency', async () => {
    return crossFileConsistency({
      projectId,
      tenantId,
      batchId,
      fileIds,
    })
  })

  logger.info(`Batch ${batchId} cross-file analysis complete: ${result.findingCount} findings`)

  return { status: 'completed' as const, findingCount: result.findingCount }
}

export const batchComplete = Object.assign(
  inngest.createFunction(
    { id: 'batch-complete-analysis' },
    { event: 'pipeline.batch-completed' },
    handlerFn,
  ),
  { handler: handlerFn },
)
