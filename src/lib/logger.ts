import pino from 'pino'

// Node.js runtime ONLY — NEVER use in Edge Runtime or Client Components
// Configured for Vercel Logs format (JSON structured logging)
// NOTE: process.env.NODE_ENV is used directly here (ESLint-exempted in eslint.config.mjs)
// because importing env.ts triggers full Zod validation of ALL env vars at module load,
// which breaks CI builds where only NEXT_PUBLIC_* secrets are available.
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})
