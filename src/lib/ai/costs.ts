import 'server-only'

import type { LanguageModelUsage } from 'ai'

import { logger } from '@/lib/logger'

import type { AIUsageRecord, ModelId } from './types'
import { MODEL_CONFIG } from './types'

/**
 * Calculate estimated cost in USD from token usage.
 */
export function estimateCost(model: ModelId, usage: LanguageModelUsage): number {
  const config = MODEL_CONFIG[model]
  const inputCost = ((usage.inputTokens ?? 0) / 1000) * config.costPer1kInput
  const outputCost = ((usage.outputTokens ?? 0) / 1000) * config.costPer1kOutput
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000 // 6 decimal places
}

/**
 * Log AI usage for cost tracking and audit.
 *
 * This logs to pino (structured JSON) for now.
 * Future: write to ai_usage_logs DB table (Story 3.1).
 */
export function logAIUsage(record: AIUsageRecord): void {
  logger.info(
    {
      tenantId: record.tenantId,
      projectId: record.projectId,
      fileId: record.fileId,
      model: record.model,
      layer: record.layer,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      estimatedCostUsd: record.estimatedCostUsd,
      chunkIndex: record.chunkIndex,
      durationMs: record.durationMs,
    },
    'AI usage recorded',
  )
}

/**
 * Aggregate usage across multiple chunks for per-file totals.
 */
export function aggregateUsage(records: AIUsageRecord[]): {
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
} {
  let inputTokens = 0
  let outputTokens = 0
  let estimatedCostUsd = 0

  for (const r of records) {
    inputTokens += r.inputTokens
    outputTokens += r.outputTokens
    estimatedCostUsd += r.estimatedCostUsd
  }

  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
  }
}
