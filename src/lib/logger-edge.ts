// Edge-compatible structured logger — use instead of pino in Edge Runtime
// pino requires Node.js APIs not available in Edge Runtime

type LogLevel = 'info' | 'warn' | 'error'

type EdgeLogEntry = {
  level: LogLevel
  msg: string
  timestamp: string
  [key: string]: unknown
}

function createEntry(level: LogLevel, msg: string, data?: Record<string, unknown>): EdgeLogEntry {
  return {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...data,
  }
}

export const edgeLogger = {
  info: (msg: string, data?: Record<string, unknown>) => {
    const entry = createEntry('info', msg, data)
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry))
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    const entry = createEntry('warn', msg, data)
    console.warn(JSON.stringify(entry))
  },
  error: (msg: string, data?: Record<string, unknown>) => {
    const entry = createEntry('error', msg, data)
    console.error(JSON.stringify(entry))
  },
}
