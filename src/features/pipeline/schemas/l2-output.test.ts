/**
 * Story 3.2a AC2: L2 Structured Output Schema — Unit Tests
 *
 * Tests the Zod schemas for L2 AI structured output,
 * including boundary values for confidence (0-100),
 * .nullable() enforcement (Guardrail #17), and taxonomy-driven categories.
 */
import { describe, expect, it } from 'vitest'

import { L2_SEMANTIC_CATEGORIES, l2FindingSchema, l2OutputSchema } from './l2-output'

// ── Test constants ──

const VALID_SEGMENT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const VALID_FINDING = {
  segmentId: VALID_SEGMENT_ID,
  category: 'mistranslation',
  severity: 'major' as const,
  description: 'Source meaning not accurately conveyed in target',
  suggestion: 'Consider alternative translation that preserves original nuance',
  confidence: 85,
}

// ── AC2: l2FindingSchema ──

describe('l2FindingSchema', () => {
  it('[P0] should accept valid finding with all required fields', () => {
    const result = l2FindingSchema.safeParse(VALID_FINDING)
    expect(result.success).toBe(true)
  })

  it('[P0] should accept confidence = 0 (boundary: at min)', () => {
    const result = l2FindingSchema.safeParse({ ...VALID_FINDING, confidence: 0 })
    expect(result.success).toBe(true)
  })

  it('[P0] should accept confidence = 100 (boundary: at max)', () => {
    const result = l2FindingSchema.safeParse({ ...VALID_FINDING, confidence: 100 })
    expect(result.success).toBe(true)
  })

  it('[P0] should reject confidence = -1 (boundary: below min)', () => {
    const result = l2FindingSchema.safeParse({ ...VALID_FINDING, confidence: -1 })
    expect(result.success).toBe(false)
  })

  it('[P0] should reject confidence = 101 (boundary: above max)', () => {
    const result = l2FindingSchema.safeParse({ ...VALID_FINDING, confidence: 101 })
    expect(result.success).toBe(false)
  })

  it('[P0] should accept suggestion = null (.nullable())', () => {
    const result = l2FindingSchema.safeParse({ ...VALID_FINDING, suggestion: null })
    expect(result.success).toBe(true)
  })

  it('[P1] should reject suggestion = undefined (NOT .optional() — OpenAI compat)', () => {
    const { suggestion: _, ...withoutSuggestion } = VALID_FINDING
    const result = l2FindingSchema.safeParse(withoutSuggestion)
    expect(result.success).toBe(false)
  })

  it('[P1] should accept any string category (taxonomy-driven, not hardcoded enum)', () => {
    const customCategory = { ...VALID_FINDING, category: 'custom-taxonomy-category-XYZ' }
    const result = l2FindingSchema.safeParse(customCategory)
    expect(result.success).toBe(true)
  })

  it('[P1] should reject non-string category value', () => {
    const result = l2FindingSchema.safeParse({ ...VALID_FINDING, category: 123 })
    expect(result.success).toBe(false)
  })

  it('[P1] should reject invalid severity value', () => {
    const result = l2FindingSchema.safeParse({ ...VALID_FINDING, severity: 'high' })
    expect(result.success).toBe(false)
  })

  it('[P1] should accept all valid severity values: critical, major, minor', () => {
    for (const severity of ['critical', 'major', 'minor'] as const) {
      const result = l2FindingSchema.safeParse({ ...VALID_FINDING, severity })
      expect(result.success).toBe(true)
    }
  })

  it('[P1] should reject finding with missing segmentId', () => {
    const { segmentId: _, ...withoutSegmentId } = VALID_FINDING
    const result = l2FindingSchema.safeParse(withoutSegmentId)
    expect(result.success).toBe(false)
  })

  it('[P1] should reject finding with missing description', () => {
    const { description: _, ...withoutDesc } = VALID_FINDING
    const result = l2FindingSchema.safeParse(withoutDesc)
    expect(result.success).toBe(false)
  })

  it('[P2] should accept confidence = 50 (mid-range)', () => {
    const result = l2FindingSchema.safeParse({ ...VALID_FINDING, confidence: 50 })
    expect(result.success).toBe(true)
  })
})

// ── AC2: l2OutputSchema ──

describe('l2OutputSchema', () => {
  it('[P0] should accept valid output with findings array and summary', () => {
    const valid = {
      findings: [VALID_FINDING],
      summary: 'Analysis complete: 1 issue detected in chunk',
    }
    const result = l2OutputSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.findings).toHaveLength(1)
      expect(result.data.summary).toBe('Analysis complete: 1 issue detected in chunk')
    }
  })

  it('[P1] should accept empty findings array (no issues found)', () => {
    const result = l2OutputSchema.safeParse({ findings: [], summary: 'No issues found' })
    expect(result.success).toBe(true)
  })

  it('[P1] should reject output without summary field', () => {
    const result = l2OutputSchema.safeParse({ findings: [] })
    expect(result.success).toBe(false)
  })

  it('[P1] should accept output with multiple findings', () => {
    const findings = [
      { ...VALID_FINDING, category: 'mistranslation' },
      { ...VALID_FINDING, segmentId: 'b2c3d4e5-f6a7-4c8d-9e0f-1a2b3c4d5e6f', category: 'omission' },
      { ...VALID_FINDING, segmentId: 'c3d4e5f6-a7b8-4d9e-0f1a-2b3c4d5e6f7a', category: 'fluency' },
    ]
    const result = l2OutputSchema.safeParse({ findings, summary: '3 issues detected' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.findings).toHaveLength(3)
    }
  })

  it('[P2] should accept findings with all 6 semantic categories', () => {
    const categories = ['mistranslation', 'omission', 'addition', 'fluency', 'register', 'cultural']
    const findings = categories.map((category, i) => ({
      ...VALID_FINDING,
      segmentId: `a${i}b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d`,
      category,
    }))
    const result = l2OutputSchema.safeParse({ findings, summary: 'Full coverage' })
    expect(result.success).toBe(true)
  })
})

// ── AC2: L2_SEMANTIC_CATEGORIES reference ──

describe('L2_SEMANTIC_CATEGORIES', () => {
  it('[P2] should contain exactly 6 semantic categories', () => {
    expect(L2_SEMANTIC_CATEGORIES).toHaveLength(6)
    expect(L2_SEMANTIC_CATEGORIES).toEqual(
      expect.arrayContaining([
        'mistranslation',
        'omission',
        'addition',
        'fluency',
        'register',
        'cultural',
      ]),
    )
  })
})

// ── AC2: Type inference ──

describe('L2 type exports', () => {
  it('[P2] should export L2Finding and L2Output inferred types', () => {
    expect(l2FindingSchema).toBeDefined()
    expect(l2OutputSchema).toBeDefined()
    expect(L2_SEMANTIC_CATEGORIES).toBeDefined()
  })
})
