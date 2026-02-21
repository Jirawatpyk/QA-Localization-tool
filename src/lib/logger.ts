import pino from 'pino'

import { env } from '@/lib/env'

// Node.js runtime ONLY — NEVER use in Edge Runtime or Client Components
// Configured for Vercel Logs format (JSON structured logging)
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})
