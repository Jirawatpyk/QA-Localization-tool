/**
 * Type-safe AI response fixtures for L2/L3 pipeline tests.
 *
 * Provides factory functions that create `generateText()` result shapes
 * matching the production Zod schemas (l2ChunkResponseSchema, l3ChunkResponseSchema).
 *
 * Usage:
 * ```ts
 * import { buildL2Response, buildL3Response } from '@/test/fixtures/ai-responses'
 *
 * mockGenerateText.mockResolvedValue(buildL2Response([{ segmentId: 'abc' }]))
 * mockGenerateText.mockResolvedValue(buildL3Response([{ segmentId: 'abc', rationale: '...' }]))
 * ```
 */

import type { L2ChunkResponse } from '@/features/pipeline/helpers/runL2ForFile'
import type { L3ChunkResponse } from '@/features/pipeline/helpers/runL3ForFile'

// ── GenerateText Result Shape ──

export type MockGenerateTextResult<T> = {
  output: T
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
  text: string
  finishReason: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' | 'unknown'
}

// ── Default Finding Values ──

const DEFAULT_SEGMENT_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

const DEFAULT_L2_FINDING: L2ChunkResponse['findings'][number] = {
  segmentId: DEFAULT_SEGMENT_ID,
  category: 'accuracy',
  severity: 'major',
  confidence: 85,
  description: 'Number mismatch in translation',
  suggestedFix: null,
}

const DEFAULT_L3_FINDING: L3ChunkResponse['findings'][number] = {
  segmentId: DEFAULT_SEGMENT_ID,
  category: 'accuracy',
  severity: 'major',
  confidence: 90,
  description: 'Semantic meaning shift detected',
  suggestedFix: null,
  rationale: 'The translation changes the implied meaning of the source text',
}

// ── L2 Response Builder ──

type L2FindingOverride = Partial<L2ChunkResponse['findings'][number]>

export function buildL2Response(
  findingOverrides?: L2FindingOverride[],
  usageOverrides?: Partial<MockGenerateTextResult<unknown>['usage']>,
): MockGenerateTextResult<L2ChunkResponse> {
  const findings = (findingOverrides ?? []).map((f) => ({
    ...DEFAULT_L2_FINDING,
    ...f,
  }))

  return {
    output: {
      findings,
      summary: `${findings.length} finding(s) detected`,
    },
    usage: {
      inputTokens: usageOverrides?.inputTokens ?? 250,
      outputTokens: usageOverrides?.outputTokens ?? 80,
      totalTokens: usageOverrides?.totalTokens ?? 330,
    },
    text: '',
    finishReason: 'stop',
  }
}

// ── L3 Response Builder ──

type L3FindingOverride = Partial<L3ChunkResponse['findings'][number]>

export function buildL3Response(
  findingOverrides?: L3FindingOverride[],
  usageOverrides?: Partial<MockGenerateTextResult<unknown>['usage']>,
): MockGenerateTextResult<L3ChunkResponse> {
  const findings = (findingOverrides ?? []).map((f) => ({
    ...DEFAULT_L3_FINDING,
    ...f,
  }))

  return {
    output: {
      findings,
      summary: `${findings.length} finding(s) detected`,
    },
    usage: {
      inputTokens: usageOverrides?.inputTokens ?? 500,
      outputTokens: usageOverrides?.outputTokens ?? 200,
      totalTokens: usageOverrides?.totalTokens ?? 700,
    },
    text: '',
    finishReason: 'stop',
  }
}

// ── Error Fixtures ──
// For testing classifyAIError() directly or when NOT mocking it.
// When classifyAIError IS mocked, the error shape doesn't matter —
// set mockClassifyAIError.mockReturnValue('rate_limit') instead.

export function createRateLimitError(message = 'Rate limit exceeded'): Error {
  const error = new Error(message)
  ;(error as unknown as Record<string, unknown>).status = 429
  return error
}

export function createAuthError(message = 'Invalid API key'): Error {
  const error = new Error(message)
  ;(error as unknown as Record<string, unknown>).status = 401
  return error
}

export function createTimeoutError(message = 'Request ETIMEDOUT'): Error {
  return new Error(message)
}

export function createContentFilterError(message = 'Content filter triggered'): Error {
  return new Error(message)
}

// ── Segment Row Builder ──
// Shared across L2/L3 tests — builds a minimal segment row for AI testing.

export function buildSegmentRow(overrides?: Record<string, unknown>) {
  return {
    id: overrides?.id ?? DEFAULT_SEGMENT_ID,
    sourceText: overrides?.sourceText ?? 'Hello world',
    targetText:
      overrides?.targetText ??
      '\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35\u0e0a\u0e32\u0e27\u0e42\u0e25\u0e01',
    segmentNumber: overrides?.segmentNumber ?? 1,
    sourceLang: 'en',
    targetLang: 'th',
  }
}

// ── Budget Fixtures ──

export const BUDGET_HAS_QUOTA = {
  hasQuota: true,
  remainingBudgetUsd: Infinity,
  monthlyBudgetUsd: null,
  usedBudgetUsd: 0,
}

export const BUDGET_EXHAUSTED = {
  hasQuota: false,
  remainingBudgetUsd: 0,
  monthlyBudgetUsd: 100,
  usedBudgetUsd: 100,
}
