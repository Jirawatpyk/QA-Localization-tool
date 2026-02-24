import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──
const { dbState } = vi.hoisted(() => {
  const state = { callIndex: 0, returnValues: [] as unknown[] }
  return { dbState: state }
})

vi.mock('@/db/client', () => {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_target, prop) => {
      if (prop === 'then') {
        return (resolve?: (v: unknown) => void) => {
          const value = dbState.returnValues[dbState.callIndex] ?? []
          dbState.callIndex++
          resolve?.(value)
        }
      }
      return vi.fn(() => new Proxy({}, handler))
    },
  }
  return { db: new Proxy({}, handler) }
})

vi.mock('@/db/schema/severityConfigs', () => ({
  severityConfigs: { tenantId: 'tenant_id', severity: 'severity', penaltyWeight: 'penalty_weight' },
}))

vi.mock('drizzle-orm', () => ({
  or: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((...args: unknown[]) => args),
}))

import { DEFAULT_PENALTY_WEIGHTS } from './constants'
import { loadPenaltyWeights } from './penaltyWeightLoader'

const TENANT_ID = 'tenant-abc'

// Helper to build DB row
function mkRow(
  tenantId: string | null,
  severity: 'critical' | 'major' | 'minor',
  penaltyWeight: number,
) {
  return { tenantId, severity, penaltyWeight }
}

describe('loadPenaltyWeights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  it('should return tenant-specific weights when tenant rows exist', async () => {
    dbState.returnValues = [
      [
        mkRow(TENANT_ID, 'critical', 30),
        mkRow(TENANT_ID, 'major', 8),
        mkRow(TENANT_ID, 'minor', 2),
      ],
    ]
    const result = await loadPenaltyWeights(TENANT_ID)
    expect(result).toEqual({ critical: 30, major: 8, minor: 2 })
  })

  it('should fall back to system defaults when no tenant-specific rows', async () => {
    dbState.returnValues = [
      [mkRow(null, 'critical', 25), mkRow(null, 'major', 5), mkRow(null, 'minor', 1)],
    ]
    const result = await loadPenaltyWeights(TENANT_ID)
    expect(result).toEqual({ critical: 25, major: 5, minor: 1 })
  })

  it('should fall back to hardcoded defaults when no DB rows', async () => {
    dbState.returnValues = [[]]
    const result = await loadPenaltyWeights(TENANT_ID)
    expect(result).toEqual(DEFAULT_PENALTY_WEIGHTS)
  })

  it('should prefer tenant-specific over system default for same severity', async () => {
    dbState.returnValues = [
      [
        mkRow(TENANT_ID, 'critical', 30), // tenant override
        mkRow(null, 'critical', 25), // system default — should be ignored for 'critical'
        mkRow(null, 'major', 5),
        mkRow(null, 'minor', 1),
      ],
    ]
    const result = await loadPenaltyWeights(TENANT_ID)
    expect(result.critical).toBe(30) // tenant wins
    expect(result.major).toBe(5) // system default
    expect(result.minor).toBe(1) // system default
  })

  it('should allow partial tenant override (only critical) with system defaults for rest', async () => {
    dbState.returnValues = [
      [
        mkRow(TENANT_ID, 'critical', 40), // only critical overridden
        mkRow(null, 'critical', 25), // system default for critical (ignored)
        mkRow(null, 'major', 5),
        mkRow(null, 'minor', 1),
      ],
    ]
    const result = await loadPenaltyWeights(TENANT_ID)
    expect(result.critical).toBe(40) // tenant
    expect(result.major).toBe(5) // system
    expect(result.minor).toBe(1) // system
  })

  it('should use hardcoded defaults for missing severities when no system rows', async () => {
    // Only system row for 'critical' — 'major' and 'minor' fall back to hardcoded
    dbState.returnValues = [[mkRow(null, 'critical', 25)]]
    const result = await loadPenaltyWeights(TENANT_ID)
    expect(result.critical).toBe(25)
    expect(result.major).toBe(DEFAULT_PENALTY_WEIGHTS.major)
    expect(result.minor).toBe(DEFAULT_PENALTY_WEIGHTS.minor)
  })

  it('should handle all three severities with mixed sources', async () => {
    dbState.returnValues = [
      [
        mkRow(TENANT_ID, 'critical', 50), // tenant
        mkRow(null, 'major', 7), // system
        // minor missing entirely → hardcoded fallback
      ],
    ]
    const result = await loadPenaltyWeights(TENANT_ID)
    expect(result.critical).toBe(50)
    expect(result.major).toBe(7)
    expect(result.minor).toBe(DEFAULT_PENALTY_WEIGHTS.minor)
  })

  it('should return a valid PenaltyWeights object with all three fields', async () => {
    dbState.returnValues = [[]]
    const result = await loadPenaltyWeights(TENANT_ID)
    expect(typeof result.critical).toBe('number')
    expect(typeof result.major).toBe('number')
    expect(typeof result.minor).toBe('number')
  })

  it('should handle tenant with all weights as zero (edge: custom zero penalty)', async () => {
    // Zero penalty weights are valid configurations
    dbState.returnValues = [
      [mkRow(TENANT_ID, 'critical', 0), mkRow(TENANT_ID, 'major', 0), mkRow(TENANT_ID, 'minor', 0)],
    ]
    const result = await loadPenaltyWeights(TENANT_ID)
    expect(result).toEqual({ critical: 0, major: 0, minor: 0 })
  })

  it('should correctly map severity strings to weight fields', async () => {
    dbState.returnValues = [
      [mkRow(null, 'critical', 99), mkRow(null, 'major', 88), mkRow(null, 'minor', 77)],
    ]
    const result = await loadPenaltyWeights(TENANT_ID)
    expect(result.critical).toBe(99)
    expect(result.major).toBe(88)
    expect(result.minor).toBe(77)
  })
})
