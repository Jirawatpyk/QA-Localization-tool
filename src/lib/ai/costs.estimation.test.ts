import type { LanguageModelUsage } from 'ai'
import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/db/client', () => ({
  db: {},
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/db/schema/aiUsageLogs', () => ({
  aiUsageLogs: {},
}))

// ── Helpers ──

function usage(input: number, output: number): LanguageModelUsage {
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
  } as unknown as LanguageModelUsage
}

describe('estimateCost — estimation accuracy (P1-02, R3-013)', () => {
  it('[P1] should estimate cost for known gpt-4o-mini tokens (1000 input, 500 output)', async () => {
    const { estimateCost } = await import('./costs')
    const cost = estimateCost('gpt-4o-mini', 'L2', usage(1000, 500))
    // input: (1000/1000) * 0.00015 = 0.00015
    // output: (500/1000) * 0.0006 = 0.0003
    // total = 0.00045
    expect(cost).toBeCloseTo(0.00045, 6)
  })

  it('[P1] should estimate cost for known claude-sonnet tokens (2000 input, 1000 output)', async () => {
    const { estimateCost } = await import('./costs')
    const cost = estimateCost('claude-sonnet-4-5-20250929', 'L3', usage(2000, 1000))
    // input: (2000/1000) * 0.003 = 0.006
    // output: (1000/1000) * 0.015 = 0.015
    // total = 0.021
    expect(cost).toBeCloseTo(0.021, 6)
  })

  it('[P1] should have estimate vs actual variance <= 20% for known token counts', async () => {
    const { estimateCost } = await import('./costs')

    // Simulate "actual" cost computed directly from known rates
    const inputTokens = 1500
    const outputTokens = 800
    const actualInputCost = (inputTokens / 1000) * 0.00015
    const actualOutputCost = (outputTokens / 1000) * 0.0006
    const actualCost = actualInputCost + actualOutputCost

    const estimated = estimateCost('gpt-4o-mini', 'L2', usage(inputTokens, outputTokens))

    // Variance = |estimated - actual| / actual
    const variance = Math.abs(estimated - actualCost) / actualCost
    expect(variance).toBeLessThanOrEqual(0.2)
  })

  it('[P1] should use layer default pricing for unknown model', async () => {
    const { estimateCost } = await import('./costs')

    // Unknown model 'custom-model-v1' with L2 layer → falls back to gpt-4o-mini rates
    const unknownCost = estimateCost('custom-model-v1', 'L2', usage(1000, 500))
    const knownCost = estimateCost('gpt-4o-mini', 'L2', usage(1000, 500))

    // Both should use the same L2 default (gpt-4o-mini) rates
    expect(unknownCost).toBe(knownCost)
    expect(unknownCost).toBeCloseTo(0.00045, 6)
  })
})
