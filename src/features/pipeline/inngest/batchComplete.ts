import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { crossFileConsistency } from '@/features/pipeline/helpers/crossFileConsistency'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { PipelineBatchCompletedEventData } from '@/types/pipeline'

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
  const { batchId, projectId, tenantId } = event.data

  logger.info({ batchId }, 'Batch complete: running cross-file consistency')

  // Resolve fileIds from batchId (canonical type doesn't carry fileIds)
  const batchFiles = await step.run('resolve-batch-files', async () => {
    const rows = await db
      .select({ id: files.id })
      .from(files)
      .where(and(withTenant(files.tenantId, tenantId), eq(files.batchId, batchId)))
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

export const batchComplete = Object.assign(
  inngest.createFunction(
    {
      id: 'batch-complete-analysis',
      concurrency: [{ key: 'event.data.projectId', limit: 1 }],
    },
    { event: 'pipeline.batch-completed' },
    handlerFn,
  ),
  { handler: handlerFn },
)
