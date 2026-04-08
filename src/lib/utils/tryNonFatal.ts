import { logger } from '@/lib/logger'

interface TryNonFatalContext {
  /** Short label for the operation, e.g. "audit log", "feedback_events insert" */
  operation: string
  /** Additional context to include in the log entry */
  meta?: Record<string, unknown>
}

/**
 * Run an async operation that should not fail the parent flow.
 *
 * On error: logs via `logger.error` with the operation context and returns null.
 * On success: returns the operation's result.
 *
 * Replaces the duplicated try/catch + logger.error pattern used 87+ times
 * across the codebase for audit logs, feedback events, inngest events, etc.
 */
export async function tryNonFatal<T>(
  op: () => Promise<T>,
  context: TryNonFatalContext,
): Promise<T | null> {
  try {
    return await op()
  } catch (err) {
    // Spread meta first so `err` always wins on key collision (defensive)
    logger.error({ ...context.meta, err }, `${context.operation} failed (non-fatal)`)
    return null
  }
}
