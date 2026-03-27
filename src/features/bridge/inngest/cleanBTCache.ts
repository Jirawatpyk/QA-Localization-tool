import { deleteExpiredBTCache } from '@/features/bridge/helpers/btCache'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'

/**
 * Daily cron job to clean expired back-translation cache entries.
 *
 * Guardrail #61: TTL enforced at both query time AND cron cleanup.
 * Runs daily at 03:00 UTC to remove entries older than 24 hours.
 *
 * Guardrail #10: retries + onFailure required for Inngest functions.
 * deleteExpiredBTCache is intentionally cross-tenant — sweeps expired rows for ALL tenants.
 */
const handlerFn = async ({
  step,
}: {
  step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }
}) => {
  const deletedCount = await step.run('delete-expired-bt-cache', async () => {
    const count = await deleteExpiredBTCache()
    logger.info({ deletedCount: count }, 'BT cache cleanup completed')
    return count
  })

  return { deletedCount }
}

// onFailure is terminal — log only, never throw (Inngest has no retry loop at this point)
const onFailureFn = async ({ event, error }: { event: Record<string, unknown>; error: Error }) => {
  logger.error({ err: error, event }, 'BT cache cleanup cron failed — all retries exhausted')
}

export const cleanBTCache = Object.assign(
  inngest.createFunction(
    {
      id: 'clean-bt-cache',
      name: 'Clean Expired Back-Translation Cache',
      retries: 3,
      onFailure: onFailureFn,
    },
    { cron: '0 3 * * *' }, // Daily at 03:00 UTC
    handlerFn,
  ),
  {
    handler: handlerFn,
    onFailure: onFailureFn,
    fnConfig: { id: 'clean-bt-cache', retries: 3, cron: '0 3 * * *' },
  }, // Guardrail #10: expose for tests
)
