import 'server-only'

import type { LanguageModelUsage } from 'ai'

import { db } from '@/db/client'
import { aiUsageLogs } from '@/db/schema/aiUsageLogs'
import { logger } from '@/lib/logger'

import type { AILayer, AIUsageRecord } from './types'
import { getConfigForModel } from './types'

/**
 * Calculate estimated cost in USD from token usage.
 *
 * Accepts any model ID string (including pinned variants).
 * Falls back to layer default cost rates if model not in MODEL_CONFIG.
 */
export function estimateCost(model: string, layer: AILayer, usage: LanguageModelUsage): number {
  const config = getConfigForModel(model, layer)
  const inputCost = ((usage.inputTokens ?? 0) / 1000) * config.costPer1kInput
  const outputCost = ((usage.outputTokens ?? 0) / 1000) * config.costPer1kOutput
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000 // 6 decimal places
}

/**
 * Derive provider name from model ID.
 */
function deriveProvider(model: string): string {
  if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3-'))
    return 'openai'
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gemini-')) return 'google'
  return 'unknown'
}

/**
 * Log AI usage for cost tracking and audit.
 *
 * Writes to ai_usage_logs DB table AND pino structured log.
 * DB failure is non-fatal (swallowed + logged) — audit log pattern.
 */
export async function logAIUsage(record: AIUsageRecord): Promise<void> {
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

  try {
    await db.insert(aiUsageLogs).values({
      fileId: record.fileId,
      projectId: record.projectId,
      tenantId: record.tenantId,
      layer: record.layer,
      model: record.model,
      provider: deriveProvider(record.model),
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      estimatedCost: record.estimatedCostUsd,
      latencyMs: record.durationMs,
      chunkIndex: record.chunkIndex,
      status: 'success',
    })
  } catch (err) {
    logger.error(
      { err, fileId: record.fileId, model: record.model },
      'Failed to persist AI usage log (non-fatal)',
    )
  }
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
