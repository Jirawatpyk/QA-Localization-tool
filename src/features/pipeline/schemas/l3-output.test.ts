/** Story 3.3 ATDD — AC5: L3 Zod Output Schema with Rationale — GREEN PHASE */
import { describe, expect, it } from 'vitest'

import { l3FindingSchema, l3OutputSchema } from './l3-output'

// ── Test constants ──

const VALID_SEGMENT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const VALID_L3_FINDING = {
  segmentId: VALID_SEGMENT_ID,
  category: 'mistranslation',
  severity: 'major' as const,
  description: 'Deep analysis found semantic mismatch',
  rationale:
    'Source implies future tense, target uses past tense. This changes the temporal context significantly.',
  confidence: 92,
  suggestedFix: 'Use future tense: \u0e08\u0e30... instead of ...\u0e41\u0e25\u0e49\u0e27',
}

// ── AC5: l3FindingSchema ──

describe('l3FindingSchema', () => {
  it('[P0] U20: should accept valid L3 finding with rationale field', () => {
    const result = l3FindingSchema.safeParse(VALID_L3_FINDING)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.rationale).toBe(VALID_L3_FINDING.rationale)
    }
  })

  it('[P0] U21: should reject finding when rationale is missing', () => {
    const { rationale: _, ...withoutRationale } = VALID_L3_FINDING
    const result = l3FindingSchema.safeParse(withoutRationale)
    expect(result.success).toBe(false)
  })

  it('[P1] U22: should accept confidence at 0 and 100 (boundary)', () => {
    const atMin = l3FindingSchema.safeParse({ ...VALID_L3_FINDING, confidence: 0 })
    expect(atMin.success).toBe(true)

    const atMax = l3FindingSchema.safeParse({ ...VALID_L3_FINDING, confidence: 100 })
    expect(atMax.success).toBe(true)
  })

  it('[P1] U23: should reject confidence -1 and 101 (out of bounds)', () => {
    const belowMin = l3FindingSchema.safeParse({ ...VALID_L3_FINDING, confidence: -1 })
    expect(belowMin.success).toBe(false)

    const aboveMax = l3FindingSchema.safeParse({ ...VALID_L3_FINDING, confidence: 101 })
    expect(aboveMax.success).toBe(false)
  })

  it('[P1] U24: should accept suggestedFix as null or string', () => {
    const withNull = l3FindingSchema.safeParse({ ...VALID_L3_FINDING, suggestedFix: null })
    expect(withNull.success).toBe(true)

    const withString = l3FindingSchema.safeParse({
      ...VALID_L3_FINDING,
      suggestedFix: 'Use the correct tense',
    })
    expect(withString.success).toBe(true)
  })
})

// ── AC5: l3OutputSchema ──

describe('l3OutputSchema', () => {
  it('[P0] U24b: should accept valid output with findings array, summary, and empty findings', () => {
    const withFindings = {
      findings: [VALID_L3_FINDING],
      summary: 'Deep analysis: 1 issue confirmed',
    }
    const result1 = l3OutputSchema.safeParse(withFindings)
    expect(result1.success).toBe(true)
    if (result1.success) {
      expect(result1.data.findings).toHaveLength(1)
      expect(result1.data.summary).toBe('Deep analysis: 1 issue confirmed')
    }

    const noFindings = { findings: [], summary: 'No issues found by L3' }
    const result2 = l3OutputSchema.safeParse(noFindings)
    expect(result2.success).toBe(true)
  })
})
