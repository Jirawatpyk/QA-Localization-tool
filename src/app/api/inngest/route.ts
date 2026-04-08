import { serve } from 'inngest/next'

import { cleanBTCache } from '@/features/bridge/inngest/cleanBTCache'
import { batchComplete } from '@/features/pipeline/inngest/batchComplete'
import { processBatch } from '@/features/pipeline/inngest/processBatch'
import { processFilePipeline } from '@/features/pipeline/inngest/processFile'
import { recalculateScore } from '@/features/pipeline/inngest/recalculateScore'
import { releaseStaleAssignments } from '@/features/pipeline/inngest/releaseStaleAssignments'
import { retryFailedLayers } from '@/features/pipeline/inngest/retryFailedLayers'
import { inngest } from '@/lib/inngest/client'

export const functions = [
  processFilePipeline,
  processBatch,
  batchComplete,
  recalculateScore,
  retryFailedLayers,
  cleanBTCache,
  releaseStaleAssignments,
]

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
})
