import { NonRetriableError } from 'inngest'
import { z } from 'zod'

import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { scoreFile } from '@/features/scoring/helpers/scoreFile'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { FindingChangedEventData } from '@/types/pipeline'

const findingChangedSchema = z.object({
  findingId: z.string().uuid(),
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
  tenantId: z.string().uuid(),
  triggeredBy: z.string().uuid(),
  previousState: z.string(),
  newState: z.string(),
  timestamp: z.string(),
})

// Handler: score ALL findings (all layers) for the file
const handlerFn = async ({
  event,
  step,
}: {
  event: { data: FindingChangedEventData }
  step: {
    run: <T>(id: string, fn: () => Promise<T>) => Promise<T>
  }
}) => {
  const parsed = findingChangedSchema.safeParse(event.data)
  if (!parsed.success) {
    throw new NonRetriableError(`Invalid finding.changed event data: ${parsed.error.message}`)
  }
  const { fileId, projectId, tenantId, triggeredBy } = parsed.data

  const scoreResult = await step.run(`recalculate-score-${fileId}`, () =>
    scoreFile({
      fileId,
      projectId,
      tenantId,
      userId: triggeredBy,
      // No layerFilter — scores ALL findings across L1/L2/L3
    }),
  )

  return scoreResult
}

// onFailure: log error + non-fatal audit log
const onFailureFn = async ({
  event,
  error,
}: {
  event: { data: { event: { data: FindingChangedEventData } } }
  error: Error
}) => {
  const eventData = event.data.event.data

  logger.error(
    { err: error, fileId: eventData.fileId, projectId: eventData.projectId },
    'recalculate-score: function failed after all retries',
  )

  try {
    await writeAuditLog({
      tenantId: eventData.tenantId,
      userId: eventData.triggeredBy,
      entityType: 'score',
      entityId: eventData.fileId,
      action: 'score.recalculation_failed',
      newValue: {
        error: error.message,
        fileId: eventData.fileId,
        projectId: eventData.projectId,
      },
    })
  } catch (auditErr) {
    logger.error(
      { err: auditErr, fileId: eventData.fileId },
      'recalculate-score: audit log write failed in onFailure',
    )
  }
}

export const recalculateScore = Object.assign(
  inngest.createFunction(
    {
      id: 'recalculate-score',
      retries: 3,
      concurrency: [{ key: 'event.data.projectId', limit: 1 }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onFailure: onFailureFn as any,
    },
    { event: 'finding.changed' as const },
    handlerFn,
  ),
  {
    handler: handlerFn,
    onFailure: onFailureFn,
  },
)
