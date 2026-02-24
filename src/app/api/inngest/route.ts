import { serve } from 'inngest/next'

import { processBatch } from '@/features/pipeline/inngest/processBatch'
import { processFilePipeline } from '@/features/pipeline/inngest/processFile'
import { inngest } from '@/lib/inngest/client'

const functions = [processFilePipeline, processBatch]

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
})
