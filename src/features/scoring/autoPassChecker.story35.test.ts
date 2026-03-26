/**
 * ATDD Tests — Story 3.5: Score Lifecycle & Confidence Display
 * AC: checkAutoPass() returns structured rationale with severity counts + riskiest finding
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

import type { AutoPassRationaleData, FindingsSummary } from './types'

// ── Hoisted mocks ──
const { dbState, dbMockModule } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return { dbState, dbMockModule }
})

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('@/db/schema/languagePairConfigs', () => ({
  languagePairConfigs: {
    tenantId: 'tenant_id',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
    autoPassThreshold: 'auto_pass_threshold',
  },
}))

vi.mock('@/db/schema/scores', () => ({
  scores: { fileId: 'file_id', projectId: 'project_id', tenantId: 'tenant_id' },
}))

vi.mock('@/db/schema/segments', () => ({
  segments: {
    fileId: 'file_id',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
    tenantId: 'tenant_id',
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: { tenantId: 'tenant_id', id: 'id', autoPassThreshold: 'auto_pass_threshold' },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(() => 'count-expr'),
}))

// ── Test data ──

const BASE_INPUT = {
  mqmScore: 96,
  criticalCount: 0,
  projectId: 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e',
  tenantId: asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'),
  sourceLang: 'en-US',
  targetLang: 'th-TH',
}

function buildRiskiestFinding(
  overrides?: Partial<NonNullable<FindingsSummary['riskiestFinding']>>,
) {
  return {
    category: 'accuracy',
    severity: 'major' as const,
    confidence: 85 as number | null,
    description: 'Translation accuracy issue',
    ...overrides,
  }
}

describe('checkAutoPass — Story 3.5 structured rationale', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  // 3.5-U-031: returns structured rationale with all fields
  it('[P0] should return structured rationale with all fields when eligible', async () => {
    // Arrange: language pair config exists, score is high
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [{ count: 60 }]]
    const findingsSummary: FindingsSummary = {
      severityCounts: { critical: 0, major: 2, minor: 3 },
      riskiestFinding: buildRiskiestFinding({ severity: 'major', confidence: 90 }),
    }

    // Act
    const { checkAutoPass } = await import('./autoPassChecker')
    const result = await checkAutoPass({
      ...BASE_INPUT,
      mqmScore: 96,
      findingsSummary,
    })

    // Assert: rationaleData must include all required fields for AutoPassRationale component
    expect(result).toMatchObject({
      eligible: true,
      rationale: expect.any(String),
    })
    expect(result.rationaleData).toBeDefined()
    if (result.rationaleData) {
      expect(result.rationaleData).toMatchObject({
        score: expect.any(Number),
        threshold: expect.any(Number),
        margin: expect.any(Number),
        severityCounts: expect.objectContaining({
          critical: expect.any(Number),
          major: expect.any(Number),
          minor: expect.any(Number),
        }),
        criteria: expect.objectContaining({
          scoreAboveThreshold: expect.any(Boolean),
          noCriticalFindings: expect.any(Boolean),
        }),
      })
    }
  })

  // 3.5-U-032: severity counts match input findings data
  it('[P0] should return severity counts that match the input findings summary', async () => {
    // Arrange: specific severity breakdown
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [{ count: 60 }]]
    const expectedCounts = { critical: 0, major: 3, minor: 5 }
    const findingsSummary: FindingsSummary = {
      severityCounts: expectedCounts,
      riskiestFinding: null,
    }

    // Act
    const { checkAutoPass } = await import('./autoPassChecker')
    const result = await checkAutoPass({
      ...BASE_INPUT,
      findingsSummary,
    })

    // Assert: rationaleData.severityCounts must exactly match input
    expect(result.rationaleData?.severityCounts).toEqual(expectedCounts)
  })

  // 3.5-U-033: riskiestFinding passed through from findingsSummary
  it('[P1] should pass through riskiest finding from findingsSummary to rationaleData', async () => {
    // Arrange: riskiest finding pre-computed by scoreFile (highest severity + highest confidence)
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [{ count: 60 }]]
    const riskiest = buildRiskiestFinding({
      category: 'fluency',
      severity: 'major',
      confidence: 88,
      description: 'Awkward phrasing in translation',
    })
    const findingsSummary: FindingsSummary = {
      severityCounts: { critical: 0, major: 2, minor: 1 },
      riskiestFinding: riskiest,
    }

    // Act
    const { checkAutoPass } = await import('./autoPassChecker')
    const result = await checkAutoPass({
      ...BASE_INPUT,
      findingsSummary,
    })

    // Assert: riskiest finding passed through unchanged
    expect(result.rationaleData?.riskiestFinding).toMatchObject({
      severity: 'major',
      confidence: 88,
      category: 'fluency',
    })
  })

  // 3.5-U-034: riskiest finding null when only L1 findings (pre-computed by scoreFile)
  it('[P1] should have null riskiest finding when findingsSummary has null riskiest', async () => {
    // Arrange: scoreFile skips L1 findings (aiConfidence=null) → passes null riskiest
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [{ count: 60 }]]
    const findingsSummary: FindingsSummary = {
      severityCounts: { critical: 0, major: 1, minor: 1 },
      riskiestFinding: null, // L1 skipped even though severity=major
    }

    // Act
    const { checkAutoPass } = await import('./autoPassChecker')
    const result = await checkAutoPass({
      ...BASE_INPUT,
      findingsSummary,
    })

    // Assert: riskiest is null (L1 findings skipped in scoreFile)
    expect(result.rationaleData?.riskiestFinding).toBeNull()
  })

  // 3.5-U-054: score 95 + 0 critical -> eligible (boundary)
  it('[P0] should return eligible when score is exactly 95 and 0 critical findings', async () => {
    // Arrange: exact boundary value — 95.0 with threshold=95, criticalCount=0
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [{ count: 60 }]]

    // Act
    const { checkAutoPass } = await import('./autoPassChecker')
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 95, criticalCount: 0 })

    // Assert: score >= threshold (boundary inclusive)
    expect(result.eligible).toBe(true)
  })

  // 3.5-U-055: score 94.99 -> ineligible (boundary)
  it('[P0] should return not eligible when score is 94.99 (just below threshold boundary)', async () => {
    // Arrange: threshold=95, score just below
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [{ count: 60 }]]

    // Act
    const { checkAutoPass } = await import('./autoPassChecker')
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 94.99, criticalCount: 0 })

    // Assert: score < threshold → ineligible
    expect(result.eligible).toBe(false)
    expect(result.rationale).toContain('below')
  })

  // 3.5-U-058: score 100 + 0 findings -> eligible with empty severity counts
  it('[P0] should return eligible with empty severity counts when score=100 and 0 findings', async () => {
    // Arrange: perfect score, no findings at all
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [{ count: 60 }]]
    const findingsSummary: FindingsSummary = {
      severityCounts: { critical: 0, major: 0, minor: 0 },
      riskiestFinding: null,
    }

    // Act
    const { checkAutoPass } = await import('./autoPassChecker')
    const result = await checkAutoPass({
      ...BASE_INPUT,
      mqmScore: 100,
      criticalCount: 0,
      findingsSummary,
    })

    // Assert: perfect score is eligible; no riskiest finding
    expect(result.eligible).toBe(true)
    expect(result.rationaleData?.severityCounts).toEqual({ critical: 0, major: 0, minor: 0 })
    expect(result.rationaleData?.riskiestFinding).toBeNull()
  })

  // 3.5-U-031b: rationale serializes to valid JSON string
  it('[P0] should serialize rationaleData as valid JSON string in rationale field', async () => {
    // Arrange: structured rationale should be JSON-parseable for DB storage
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [{ count: 60 }]]
    const findingsSummary: FindingsSummary = {
      severityCounts: { critical: 0, major: 1, minor: 2 },
      riskiestFinding: buildRiskiestFinding({ severity: 'major', confidence: 80 }),
    }

    // Act
    const { checkAutoPass } = await import('./autoPassChecker')
    const result = await checkAutoPass({
      ...BASE_INPUT,
      mqmScore: 96,
      findingsSummary,
    })

    // Assert: rationale must be a valid JSON string when structured rationale is enabled
    expect(result.rationaleData).toBeDefined()
    if (result.rationaleData) {
      // rationale field contains JSON string of rationaleData
      expect(() => JSON.parse(result.rationale)).not.toThrow()
      const parsed = JSON.parse(result.rationale) as AutoPassRationaleData
      expect(parsed.score).toBe(96)
      expect(parsed.threshold).toBe(95)
    }
  })
})

// TA: Coverage Gap Tests (Story 3.5)
describe('checkAutoPass — TA coverage gap tests (Story 3.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  // G15: null threshold from DB → conservative fallback (99)
  it('[P2] should use conservative fallback threshold 99 when language pair config returns null autoPassThreshold (G15)', async () => {
    // Arrange: language pair config exists but autoPassThreshold is null
    // DB call 0: languagePairConfigs returns row with null threshold
    // DB call 1: count query returns 60 (established pair)
    dbState.returnValues = [
      [{ autoPassThreshold: null }], // 0: lang pair config — threshold is null
      [{ count: 60 }], // 1: file count
    ]

    // Act: score 98 — should NOT auto-pass because conservative threshold is 99
    const { checkAutoPass } = await import('./autoPassChecker')
    const result = await checkAutoPass({
      ...BASE_INPUT,
      mqmScore: 98,
      criticalCount: 0,
    })

    // Assert: 98 < 99 (conservative fallback) → ineligible
    expect(result.eligible).toBe(false)
    expect(result.rationale).toContain('below')
  })
})
