import 'server-only'

import { NoObjectGeneratedError } from 'ai'
import { NonRetriableError } from 'inngest'

import { logger } from '@/lib/logger'

import type { AIErrorKind } from './types'

/**
 * Classify an AI SDK error into retriable vs non-retriable.
 *
 * Guardrail #18: RateLimitError = retriable, schema/auth = NonRetriableError.
 */
export function classifyAIError(error: unknown): AIErrorKind {
  if (error instanceof Error) {
    // Rate limit (429)
    if ('status' in error && (error as { status: number }).status === 429) {
      return 'rate_limit'
    }

    // Auth failure (401)
    if ('status' in error && (error as { status: number }).status === 401) {
      return 'auth'
    }

    // NoObjectGeneratedError — schema mismatch or content filter
    if (NoObjectGeneratedError.isInstance(error)) {
      const response = (error as { response?: { finishReason?: string } }).response
      if (response?.finishReason === 'content-filter') {
        return 'content_filter'
      }
      return 'schema_mismatch'
    }

    // Timeout
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      return 'timeout'
    }
  }

  return 'unknown'
}

/**
 * Handle an AI error according to its classification.
 *
 * - Retriable errors: re-throw as-is (Inngest retries)
 * - Non-retriable errors: wrap in NonRetriableError (Inngest skips to onFailure)
 *
 * Always logs with full context (Guardrail #18).
 */
export function handleAIError(
  error: unknown,
  context: { fileId: string; model: string; layer: string; chunkIndex?: number },
): never {
  const kind = classifyAIError(error)
  const errorMessage = error instanceof Error ? error.message : String(error)

  logger.error(
    {
      aiErrorKind: kind,
      fileId: context.fileId,
      model: context.model,
      layer: context.layer,
      chunkIndex: context.chunkIndex,
      errorMessage,
      // Include usage/finishReason if available
      ...(NoObjectGeneratedError.isInstance(error) && {
        finishReason: (error as { response?: { finishReason?: string } }).response?.finishReason,
        usage: (error as { usage?: unknown }).usage,
      }),
    },
    `AI call failed: ${kind}`,
  )

  switch (kind) {
    case 'rate_limit':
    case 'timeout':
    case 'unknown':
      // Retriable — let Inngest retry
      throw error

    case 'auth':
      throw new NonRetriableError(`AI auth failed for ${context.model}: ${errorMessage}`)

    case 'content_filter':
      throw new NonRetriableError(
        `AI content filter blocked response for file ${context.fileId}: ${errorMessage}`,
      )

    case 'schema_mismatch':
      throw new NonRetriableError(
        `AI schema mismatch for ${context.model} on file ${context.fileId}: ${errorMessage}`,
      )
  }
}
