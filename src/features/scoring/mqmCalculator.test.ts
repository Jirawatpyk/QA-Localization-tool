import { describe, expect, it } from 'vitest'

import { DEFAULT_PENALTY_WEIGHTS } from './constants'
import { calculateMqmScore } from './mqmCalculator'
import type { ContributingFinding, FindingStatus } from './types'

// Helper to build a ContributingFinding
function mkFinding(
  severity: 'critical' | 'major' | 'minor',
  status: FindingStatus = 'pending',
  segmentCount: number = 1,
): ContributingFinding {
  return { severity, status, segmentCount }
}

describe('calculateMqmScore', () => {
  // ── Zero findings ──
  it('should return score 100 when no findings exist', () => {
    const result = calculateMqmScore([], 1000)
    expect(result.mqmScore).toBe(100)
    expect(result.npt).toBe(0)
    expect(result.status).toBe('calculated')
  })

  it('should return criticalCount/majorCount/minorCount all 0 when no findings', () => {
    const result = calculateMqmScore([], 500)
    expect(result.criticalCount).toBe(0)
    expect(result.majorCount).toBe(0)
    expect(result.minorCount).toBe(0)
  })

  // ── Zero word count ──
  it('should return status na when totalWords is 0', () => {
    const result = calculateMqmScore([mkFinding('critical')], 0)
    expect(result.status).toBe('na')
    expect(result.mqmScore).toBe(0)
    expect(result.npt).toBe(0)
    expect(result.totalWords).toBe(0)
  })

  it('should return na even with no findings when totalWords is 0', () => {
    const result = calculateMqmScore([], 0)
    expect(result.status).toBe('na')
  })

  // ── Known input → exact NPT and score ──
  it('should calculate exact NPT for 2 critical + 3 major + 5 minor in 1000-word file', () => {
    // sumPenalties = (2×25) + (3×5) + (5×1) = 70; NPT = 70/1000×1000 = 70
    const findings = [
      ...Array.from({ length: 2 }, () => mkFinding('critical')),
      ...Array.from({ length: 3 }, () => mkFinding('major')),
      ...Array.from({ length: 5 }, () => mkFinding('minor')),
    ]
    const result = calculateMqmScore(findings, 1000)
    expect(result.npt).toBe(70)
    expect(result.mqmScore).toBe(30)
    expect(result.criticalCount).toBe(2)
    expect(result.majorCount).toBe(3)
    expect(result.minorCount).toBe(5)
    expect(result.status).toBe('calculated')
  })

  it('should correctly calculate NPT for 1 critical in 500-word file', () => {
    // NPT = (25/500)×1000 = 50; Score = 100-50 = 50
    const result = calculateMqmScore([mkFinding('critical')], 500)
    expect(result.npt).toBe(50)
    expect(result.mqmScore).toBe(50)
  })

  it('should calculate NPT for only minor findings', () => {
    // 10 minor in 1000 words: NPT = (10/1000)×1000 = 10; Score = 90
    const findings = Array.from({ length: 10 }, () => mkFinding('minor'))
    const result = calculateMqmScore(findings, 1000)
    expect(result.npt).toBe(10)
    expect(result.mqmScore).toBe(90)
  })

  // ── NPT clamping ──
  it('should clamp score to 0 when NPT > 100', () => {
    // 5 critical in 1 word: NPT = (5×25/1)×1000 = 125000 >> 100
    const result = calculateMqmScore(
      Array.from({ length: 5 }, () => mkFinding('critical')),
      1,
    )
    expect(result.mqmScore).toBe(0)
    expect(result.npt).toBeGreaterThan(100)
    expect(result.status).toBe('calculated')
  })

  it('should clamp score to 0 exactly when NPT is exactly 100', () => {
    // 4 critical in 1000 words: NPT = (4×25/1000)×1000 = 100; Score = max(0,0) = 0
    const result = calculateMqmScore(
      Array.from({ length: 4 }, () => mkFinding('critical')),
      1000,
    )
    expect(result.npt).toBe(100)
    expect(result.mqmScore).toBe(0)
  })

  it('should never return negative score', () => {
    const findings = Array.from({ length: 100 }, () => mkFinding('critical'))
    const result = calculateMqmScore(findings, 1)
    expect(result.mqmScore).toBeGreaterThanOrEqual(0)
  })

  // ── Contributing statuses ──
  it('should include pending findings in penalty', () => {
    const result = calculateMqmScore([mkFinding('major', 'pending')], 1000)
    expect(result.majorCount).toBe(1)
    expect(result.mqmScore).toBeLessThan(100)
  })

  it('should include accepted findings in penalty', () => {
    const result = calculateMqmScore([mkFinding('major', 'accepted')], 1000)
    expect(result.majorCount).toBe(1)
  })

  it('should include re_accepted findings in penalty', () => {
    const result = calculateMqmScore([mkFinding('major', 're_accepted')], 1000)
    expect(result.majorCount).toBe(1)
  })

  it('should exclude rejected findings from penalty', () => {
    const result = calculateMqmScore([mkFinding('critical', 'rejected')], 1000)
    expect(result.criticalCount).toBe(0)
    expect(result.mqmScore).toBe(100)
  })

  it('should exclude flagged findings from penalty', () => {
    const result = calculateMqmScore([mkFinding('critical', 'flagged')], 1000)
    expect(result.criticalCount).toBe(0)
    expect(result.mqmScore).toBe(100)
  })

  it('should exclude noted findings from penalty', () => {
    const result = calculateMqmScore([mkFinding('major', 'noted')], 1000)
    expect(result.majorCount).toBe(0)
    expect(result.mqmScore).toBe(100)
  })

  it('should exclude source_issue findings from penalty', () => {
    const result = calculateMqmScore([mkFinding('critical', 'source_issue')], 1000)
    expect(result.criticalCount).toBe(0)
    expect(result.mqmScore).toBe(100)
  })

  it('should exclude manual findings from penalty', () => {
    const result = calculateMqmScore([mkFinding('critical', 'manual')], 1000)
    expect(result.criticalCount).toBe(0)
    expect(result.mqmScore).toBe(100)
  })

  it('should only score contributing statuses in a mixed list', () => {
    const findings = [
      mkFinding('critical', 'pending'), // contributes
      mkFinding('critical', 'rejected'), // excluded
      mkFinding('major', 'accepted'), // contributes
      mkFinding('major', 'flagged'), // excluded
      mkFinding('minor', 're_accepted'), // contributes
      mkFinding('minor', 'source_issue'), // excluded
    ]
    const result = calculateMqmScore(findings, 1000)
    expect(result.criticalCount).toBe(1)
    expect(result.majorCount).toBe(1)
    expect(result.minorCount).toBe(1)
    // NPT = (25+5+1)/1000×1000 = 31; Score = 69
    expect(result.npt).toBe(31)
    expect(result.mqmScore).toBe(69)
  })

  // ── Multi-segment finding (segmentCount > 1) counts once ──
  it('should count multi-segment finding (segmentCount=3) exactly once', () => {
    const finding = mkFinding('critical', 'pending', 3)
    const result = calculateMqmScore([finding], 1000)
    // Penalty = 25 once, not 25×3
    expect(result.criticalCount).toBe(1)
    expect(result.npt).toBe(25)
    expect(result.mqmScore).toBe(75)
  })

  it('should count each multi-segment finding once even when multiple exist', () => {
    const findings = [mkFinding('major', 'pending', 5), mkFinding('major', 'pending', 10)]
    const result = calculateMqmScore(findings, 1000)
    expect(result.majorCount).toBe(2)
    // NPT = (2×5)/1000×1000 = 10
    expect(result.npt).toBe(10)
  })

  // ── Custom penalty weights (tenant override) ──
  it('should use custom penalty weights when provided', () => {
    const customWeights = { critical: 30, major: 10, minor: 2 }
    // 1 critical in 1000 words: NPT = (30/1000)×1000 = 30; Score = 70
    const result = calculateMqmScore([mkFinding('critical')], 1000, customWeights)
    expect(result.npt).toBe(30)
    expect(result.mqmScore).toBe(70)
  })

  it('should use default weights when no custom weights provided', () => {
    const result = calculateMqmScore([mkFinding('critical')], 1000)
    expect(result.npt).toBe(DEFAULT_PENALTY_WEIGHTS.critical)
  })

  it('should apply different weights for each severity level', () => {
    const customWeights = { critical: 50, major: 10, minor: 2 }
    const findings = [mkFinding('critical'), mkFinding('major'), mkFinding('minor')]
    // sum = 50+10+2 = 62; NPT = (62/1000)×1000 = 62; Score = 38
    const result = calculateMqmScore(findings, 1000, customWeights)
    expect(result.npt).toBe(62)
    expect(result.mqmScore).toBe(38)
  })

  // ── totalWords in result ──
  it('should include totalWords in result', () => {
    const result = calculateMqmScore([], 500)
    expect(result.totalWords).toBe(500)
  })

  // ── Floating point edge cases ──
  it('should round NPT to 2 decimal places', () => {
    // 1 minor in 3 words: NPT = (1/3)×1000 = 333.333...
    const result = calculateMqmScore([mkFinding('minor')], 3)
    expect(result.npt).toBe(Math.round((1000 / 3) * 100) / 100)
    // Should be a finite number with at most 2 decimal places
    const decimals = (result.npt.toString().split('.')[1] ?? '').length
    expect(decimals).toBeLessThanOrEqual(2)
  })

  it('should produce a finite score for any positive word count', () => {
    const result = calculateMqmScore([mkFinding('major')], 7)
    expect(Number.isFinite(result.mqmScore)).toBe(true)
    expect(Number.isFinite(result.npt)).toBe(true)
  })

  // ── Performance sanity ──
  it('should handle 5000 findings in under 100ms', () => {
    const findings = Array.from({ length: 5000 }, (_, i) => {
      const severities = ['critical', 'major', 'minor'] as const
      return mkFinding(severities[i % 3]!, 'pending')
    })
    const start = performance.now()
    calculateMqmScore(findings, 100000)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(100)
  })

  // ── Boundary: score exactly at boundary ──
  it('should produce score 100 with no contributing findings among excluded', () => {
    const findings = [
      mkFinding('critical', 'rejected'),
      mkFinding('major', 'noted'),
      mkFinding('minor', 'source_issue'),
    ]
    const result = calculateMqmScore(findings, 1000)
    expect(result.mqmScore).toBe(100)
    expect(result.status).toBe('calculated')
  })
})
