import { serve } from 'inngest/next'

import { inngest } from '@/lib/inngest/client'

// Function registry — Inngest functions will be registered here as they're created
// Pipeline functions added in Epic 2, scoring functions in Epic 3
const functions: Parameters<typeof serve>[0]['functions'] = []

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
})
