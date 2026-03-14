/**
 * P3-04: Token count MAX_SAFE_INTEGER → no overflow in cost calculation
 */
import type { LanguageModelUsage } from 'ai'
import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/db/client', () => ({
  db: { insert: vi.fn(() => ({ values: vi.fn() })) },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/db/schema/aiUsageLogs', () => ({
  aiUsageLogs: {},
}))

function usage(input: number, output: number): LanguageModelUsage {
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
  } as unknown as LanguageModelUsage
}

describe('estimateCost — MAX_SAFE_INTEGER boundary (P3-04)', () => {
  it('[P3] should not overflow when token count is MAX_SAFE_INTEGER', async () => {
    const { estimateCost } = await import('./costs')

    // MAX_SAFE_INTEGER = 9007199254740991
    const cost = estimateCost('gpt-4o-mini', 'L2', usage(Number.MAX_SAFE_INTEGER, 0))

    // Cost should be a finite number (not Infinity, not NaN)
    expect(Number.isFinite(cost)).toBe(true)
    expect(cost).toBeGreaterThan(0)
    // gpt-4o-mini input cost: (MAX_SAFE_INTEGER / 1000) * 0.00015
    // = 9007199254740.991 * 0.00015 ≈ 1351079888.211... USD
    // This is a huge cost but mathematically valid (no overflow in JS)
    expect(cost).toBeLessThan(Number.MAX_SAFE_INTEGER)
  })
})
