import 'server-only'

import type { LanguageModelUsage } from 'ai'

// ── Model Configuration ──

export type AILayer = 'L2' | 'L3'

export type ModelId =
  | 'gpt-4o-mini' // L2: fast screening
  | 'claude-sonnet-4-5-20250929' // L3: deep analysis

export const MODEL_CONFIG: Record<
  ModelId,
  {
    layer: AILayer
    maxOutputTokens: number // AI SDK 6.0: renamed from maxTokens
    temperature: number
    timeoutMs: number
    costPer1kInput: number // USD
    costPer1kOutput: number // USD
  }
> = {
  'gpt-4o-mini': {
    layer: 'L2',
    maxOutputTokens: 4096,
    temperature: 0.3,
    timeoutMs: 30_000,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
  'claude-sonnet-4-5-20250929': {
    layer: 'L3',
    maxOutputTokens: 8192,
    temperature: 0.2,
    timeoutMs: 60_000,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
}

// ── Cost Tracking ──

export type AIUsageRecord = {
  tenantId: string
  projectId: string
  fileId: string
  model: ModelId
  layer: AILayer
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  chunkIndex: number | null
  durationMs: number
}

// ── Error Classification ──

export type AIErrorKind =
  | 'rate_limit' // 429 — retriable by Inngest
  | 'auth' // 401 — non-retriable
  | 'content_filter' // model refused — non-retriable
  | 'schema_mismatch' // NoObjectGeneratedError — non-retriable
  | 'timeout' // request timed out — retriable
  | 'unknown' // unexpected — retriable (let Inngest decide)

// ── Budget ──

export type BudgetCheckResult = {
  hasQuota: boolean
  remainingTokens: number
  monthlyLimitTokens: number
  usedTokens: number
}

// ── Chunk Result ──

export type ChunkResult<T> = {
  chunkIndex: number
  success: boolean
  data: T | null
  error: string | null
  usage: LanguageModelUsage | null
}

export type LayerResult<T> = {
  findings: T[]
  chunksTotal: number
  chunksSucceeded: number
  chunksFailed: number
  partialFailure: boolean
  totalUsage: {
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
  }
}
