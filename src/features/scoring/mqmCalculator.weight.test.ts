import { describe, expect, it } from 'vitest'

import { calculateMqmScore } from './mqmCalculator'
import type { ContributingFinding, PenaltyWeights } from './types'

function mkFinding(
  severity: 'critical' | 'major' | 'minor',
  status: 'pending' | 'accepted' | 're_accepted' = 'pending',
  segmentCount: number = 1,
): ContributingFinding {
  return { severity, status, segmentCount }
}

describe('calculateMqmScore — custom penalty weights with weight=0 (R3-031)', () => {
  it('[P0] should apply zero penalty for critical when critical weight=0, but still count criticals', () => {
    // 2 critical (weight=0) + 1 major (weight=5)
    // sumPenalties = (2*0) + (1*5) = 5; NPT = (5/1000)*1000 = 5; score = 95
    const weights: PenaltyWeights = { critical: 0, major: 5, minor: 1 }
    const findings = [mkFinding('critical'), mkFinding('critical'), mkFinding('major')]

    const result = calculateMqmScore(findings, 1000, weights)

    expect(result.npt).toBe(5)
    expect(result.mqmScore).toBe(95)
    expect(result.criticalCount).toBe(2)
    expect(result.majorCount).toBe(1)
    expect(result.minorCount).toBe(0)
    expect(result.status).toBe('calculated')
  })

  it('[P0] should return score 100 when all weights=0, but still track all severity counts', () => {
    // 5 findings with mix of severities, all weights = 0
    // sumPenalties = 0; NPT = 0; score = 100
    const weights: PenaltyWeights = { critical: 0, major: 0, minor: 0 }
    const findings = [
      mkFinding('critical'),
      mkFinding('critical'),
      mkFinding('major'),
      mkFinding('minor'),
      mkFinding('minor'),
    ]

    const result = calculateMqmScore(findings, 1000, weights)

    expect(result.npt).toBe(0)
    expect(result.mqmScore).toBe(100)
    expect(result.criticalCount).toBe(2)
    expect(result.majorCount).toBe(1)
    expect(result.minorCount).toBe(2)
    expect(result.status).toBe('calculated')
  })

  it('[P0] should apply zero penalty for major when major weight=0, with minor still contributing', () => {
    // 3 major (weight=0) + 1 minor (weight=1)
    // sumPenalties = (3*0) + (1*1) = 1; NPT = (1/1000)*1000 = 1; score = 99
    const weights: PenaltyWeights = { critical: 25, major: 0, minor: 1 }
    const findings = [
      mkFinding('major'),
      mkFinding('major'),
      mkFinding('major'),
      mkFinding('minor'),
    ]

    const result = calculateMqmScore(findings, 1000, weights)

    expect(result.npt).toBe(1)
    expect(result.mqmScore).toBe(99)
    expect(result.criticalCount).toBe(0)
    expect(result.majorCount).toBe(3)
    expect(result.minorCount).toBe(1)
    expect(result.status).toBe('calculated')
  })

  it('[P0] should apply zero penalty for minor when minor weight=0, with critical still contributing', () => {
    // 10 minor (weight=0) + 1 critical (weight=25)
    // sumPenalties = (10*0) + (1*25) = 25; NPT = (25/1000)*1000 = 25; score = 75
    const weights: PenaltyWeights = { critical: 25, major: 5, minor: 0 }
    const findings = [
      ...Array.from({ length: 10 }, () => mkFinding('minor')),
      mkFinding('critical'),
    ]

    const result = calculateMqmScore(findings, 1000, weights)

    expect(result.npt).toBe(25)
    expect(result.mqmScore).toBe(75)
    expect(result.criticalCount).toBe(1)
    expect(result.majorCount).toBe(0)
    expect(result.minorCount).toBe(10)
    expect(result.status).toBe('calculated')
  })
})
