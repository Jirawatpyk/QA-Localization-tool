import 'server-only'

import { NonRetriableError } from 'inngest'

import { logger } from '@/lib/logger'

import { classifyAIError } from './errors'
import type { FallbackChain } from './providers'
import type { AIErrorKind } from './types'

// ── Types ──

export type FallbackRunnerResult<T> = {
  data: T
  modelUsed: string
  fallbackUsed: boolean
  attemptsLog: Array<{ model: string; error?: string; kind?: AIErrorKind }>
}

// ── Error Kind Classification for Fallback Decision ──

/** Errors where trying a different provider may help */
const FALLBACK_ELIGIBLE: ReadonlySet<AIErrorKind> = new Set([
  'rate_limit',
  'timeout',
  'auth',
  'schema_mismatch',
  'content_filter',
  'unknown', // Story 4.8: unknown errors should try fallback before giving up
])

/** Errors where all models exhausted should re-throw (retriable by Inngest) */
const RETRIABLE_ON_EXHAUST: ReadonlySet<AIErrorKind> = new Set(['rate_limit', 'timeout'])

// ── Core ──

/**
 * Call an AI model function with fallback chain support.
 *
 * Tries primary model first. On rate_limit/timeout/auth/schema errors,
 * immediately tries the next model in the fallback chain.
 * Re-throws unknown errors without consuming the chain (design decision:
 * unknown errors may be systemic, so burning through fallbacks is wasteful).
 *
 * After chain exhaustion:
 *   - rate_limit/timeout → re-throw original error (Inngest retries with backoff)
 *   - auth/schema/content_filter → NonRetriableError (Inngest → onFailure)
 */
export async function callWithFallback<T>(
  chain: FallbackChain,
  fn: (modelId: string) => Promise<T>,
): Promise<FallbackRunnerResult<T>> {
  const models = [chain.primary, ...chain.fallbacks]
  const attemptsLog: FallbackRunnerResult<T>['attemptsLog'] = []

  for (let i = 0; i < models.length; i++) {
    const modelId = models[i]!
    try {
      const data = await fn(modelId)
      return {
        data,
        modelUsed: modelId,
        fallbackUsed: i > 0,
        attemptsLog,
      }
    } catch (error) {
      const kind = classifyAIError(error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      attemptsLog.push({ model: modelId, error: errorMessage, kind })

      // Unknown errors: re-throw immediately without trying fallbacks
      if (!FALLBACK_ELIGIBLE.has(kind)) {
        throw error
      }

      const isLast = i === models.length - 1
      const nextModel = isLast ? undefined : models[i + 1]

      if (!isLast) {
        logger.warn(
          {
            failedModel: modelId,
            nextModel,
            errorKind: kind,
            attemptIndex: i,
            errorMessage,
          },
          `AI model failed — trying fallback`,
        )
        continue
      }

      // All models exhausted
      logger.error(
        {
          failedModel: modelId,
          errorKind: kind,
          totalAttempts: models.length,
          attemptsLog,
        },
        'All models in fallback chain exhausted',
      )

      if (RETRIABLE_ON_EXHAUST.has(kind)) {
        // Re-throw original error for Inngest retry with backoff
        throw error
      }

      // Non-retriable: auth, schema_mismatch, content_filter
      throw new NonRetriableError(`All AI models failed (${kind}): ${errorMessage}`)
    }
  }

  // Should never reach here (models.length >= 1 guaranteed by chain.primary)
  throw new Error('callWithFallback: empty model chain')
}
