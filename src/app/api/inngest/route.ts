import { serve } from 'inngest/next'

import { batchComplete } from '@/features/pipeline/inngest/batchComplete'
import { processBatch } from '@/features/pipeline/inngest/processBatch'
import { processFilePipeline } from '@/features/pipeline/inngest/processFile'
import { recalculateScore } from '@/features/pipeline/inngest/recalculateScore'
import { inngest } from '@/lib/inngest/client'

const functions = [processFilePipeline, processBatch, batchComplete, recalculateScore]

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
})
