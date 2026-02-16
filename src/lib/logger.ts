import pino from 'pino'

// Node.js runtime ONLY — NEVER use in Edge Runtime or Client Components
// Configured for Vercel Logs format (JSON structured logging)
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})
