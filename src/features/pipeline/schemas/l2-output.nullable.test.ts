/**
 * P2-05 (R3-024): Zod schema nullable vs undefined enforcement
 * Guardrail #17: OpenAI rejects .optional() — only .nullable() allowed
 */
import { describe, it, expect } from 'vitest'

import { l2FindingSchema } from './l2-output'

const VALID_SEGMENT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const VALID_FINDING = {
  segmentId: VALID_SEGMENT_ID,
  category: 'accuracy',
  severity: 'major' as const,
  description: 'Test finding',
  suggestion: 'Fix this',
  confidence: 80,
}

describe('l2FindingSchema nullable enforcement (P2-05)', () => {
  it('[P2] should accept suggestion: null (Guardrail #17 — .nullable())', () => {
    const result = l2FindingSchema.safeParse({
      ...VALID_FINDING,
      suggestion: null,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.suggestion).toBeNull()
    }
  })

  it('[P2] should reject suggestion: undefined (OpenAI rejects .optional())', () => {
    // Remove suggestion entirely → undefined in JS
    const { suggestion: _, ...withoutSuggestion } = VALID_FINDING
    const result = l2FindingSchema.safeParse(withoutSuggestion)

    expect(result.success).toBe(false)
  })

  it('[P2] should accept suggestion: "" (empty string is valid)', () => {
    const result = l2FindingSchema.safeParse({
      ...VALID_FINDING,
      suggestion: '',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.suggestion).toBe('')
    }
  })
})
