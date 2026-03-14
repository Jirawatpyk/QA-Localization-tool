/**
 * P2-03 (R3-022): L2 output schema contract validation
 * AI mock vs real API response shape — ensures schema stays in sync.
 */
import { describe, it, expect } from 'vitest'

import { l2OutputSchema } from './l2-output'

// ── Fixtures matching production AI response shapes ──

const VALID_SEGMENT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

/** Shape that our mock returns (from buildL2Response) */
const MOCK_FIXTURE = {
  findings: [
    {
      segmentId: VALID_SEGMENT_ID,
      category: 'accuracy',
      severity: 'major' as const,
      confidence: 85,
      description: 'Number mismatch in translation',
      suggestion: null,
    },
  ],
  summary: '1 finding(s) detected',
}

/** Shape resembling a real OpenAI structured output response */
const REAL_SHAPED_RESPONSE = {
  findings: [
    {
      segmentId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
      category: 'mistranslation',
      severity: 'critical' as const,
      confidence: 92,
      description: 'The translation reverses the meaning of the conditional clause',
      suggestion: 'Consider restructuring the target to preserve the if-then relationship',
    },
    {
      segmentId: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
      category: 'fluency',
      severity: 'minor' as const,
      confidence: 68,
      description: 'Register mismatch: formal source translated using informal register',
      suggestion: null,
    },
  ],
  summary: 'Found 2 issues: 1 critical mistranslation, 1 minor fluency concern',
}

describe('l2OutputSchema contract (P2-03)', () => {
  it('[P2] should validate mock fixture matches expected schema shape', () => {
    const result = l2OutputSchema.safeParse(MOCK_FIXTURE)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.findings).toHaveLength(1)
      expect(result.data.findings[0]).toMatchObject({
        segmentId: VALID_SEGMENT_ID,
        category: 'accuracy',
        severity: 'major',
        confidence: 85,
        description: expect.any(String),
        suggestion: null,
      })
      expect(result.data.summary).toBe('1 finding(s) detected')
    }
  })

  it('[P2] should validate real-shaped API response passes schema', () => {
    const result = l2OutputSchema.safeParse(REAL_SHAPED_RESPONSE)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.findings).toHaveLength(2)
      // First finding: critical with suggestion string
      expect(result.data.findings[0]!.severity).toBe('critical')
      expect(result.data.findings[0]!.suggestion).not.toBeNull()
      // Second finding: minor with null suggestion
      expect(result.data.findings[1]!.severity).toBe('minor')
      expect(result.data.findings[1]!.suggestion).toBeNull()
    }
  })

  it('[P2] should reject response missing required fields', () => {
    // Missing summary
    const noSummary = { findings: [] }
    expect(l2OutputSchema.safeParse(noSummary).success).toBe(false)

    // Missing findings
    const noFindings = { summary: 'test' }
    expect(l2OutputSchema.safeParse(noFindings).success).toBe(false)

    // Finding missing segmentId
    const badFinding = {
      findings: [
        {
          category: 'accuracy',
          severity: 'major',
          confidence: 80,
          description: 'test',
          suggestion: null,
        },
      ],
      summary: 'test',
    }
    expect(l2OutputSchema.safeParse(badFinding).success).toBe(false)

    // Finding missing suggestion entirely (not null, just absent)
    const missingSuggestion = {
      findings: [
        {
          segmentId: VALID_SEGMENT_ID,
          category: 'accuracy',
          severity: 'major',
          confidence: 80,
          description: 'test',
          // suggestion key absent → fails because it's not .optional(), it's required + .nullable()
        },
      ],
      summary: 'test',
    }
    expect(l2OutputSchema.safeParse(missingSuggestion).success).toBe(false)
  })
})
