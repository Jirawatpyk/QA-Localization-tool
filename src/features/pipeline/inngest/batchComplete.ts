// Stub: Story 2.7 — batchComplete Inngest function
// TODO: Replace with real implementation in Story 2.7 Task 6.2

import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'

const handlerFn = async () => {
  logger.info('batchComplete stub — not implemented')
  return { status: 'not_implemented' as const }
}

export const batchComplete = Object.assign(
  inngest.createFunction(
    { id: 'batch-complete-analysis' },
    { event: 'pipeline.batch-completed' },
    handlerFn,
  ),
  { handler: handlerFn },
)
