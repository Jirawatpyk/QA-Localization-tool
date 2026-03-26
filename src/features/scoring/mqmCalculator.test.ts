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

  it('should include manual findings in penalty (S2 fix: reviewer-added = confirmed issue)', () => {
    const result = calculateMqmScore([mkFinding('critical', 'manual')], 1000)
    expect(result.criticalCount).toBe(1)
    expect(result.npt).toBe(25) // critical weight = 25
    expect(result.mqmScore).toBe(75) // 100 - 25
  })

  // CR-R2 M3: explicit regression test for S2 fix — flagged must NOT contribute
  it('should exclude flagged findings from penalty (S2 fix: uncertain = no penalty)', () => {
    const result = calculateMqmScore([mkFinding('critical', 'flagged')], 1000)
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

  // ── Custom weights: zero penalty (L2) ──
  it('should return score 100 with status calculated when all penalty weights are zero', () => {
    const zeroWeights = { critical: 0, major: 0, minor: 0 }
    const findings = [
      mkFinding('critical', 'pending'),
      mkFinding('major', 'pending'),
      mkFinding('minor', 'pending'),
    ]
    const result = calculateMqmScore(findings, 1000, zeroWeights)
    // Zero weights → no penalty regardless of finding count
    expect(result.mqmScore).toBe(100)
    expect(result.npt).toBe(0)
    expect(result.status).toBe('calculated') // NOT 'na' — totalWords > 0
    // Counts still tracked even with zero weights
    expect(result.criticalCount).toBe(1)
    expect(result.majorCount).toBe(1)
    expect(result.minorCount).toBe(1)
  })

  // ── mqmScore 2dp rounding (L4) ──
  it('should round mqmScore to at most 2 decimal places', () => {
    // 1 minor in 300 words: NPT = (1/300)*1000 = 3.333...; score = 100 - 3.33 = 96.67
    const result = calculateMqmScore([mkFinding('minor')], 300)
    const decimals = (result.mqmScore.toString().split('.')[1] ?? '').length
    expect(decimals).toBeLessThanOrEqual(2)
    expect(result.mqmScore).toBe(96.67)
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

  // -- TA: Coverage Gap Tests (Story 2.5) --

  // T5 [P1] INV-1: Score bounded — negative totalWords causes score > 100
  // totalWords=-100 bypasses the `=== 0` guard; NPT = (1/-100)*1000 = -10
  // score = max(0, 100 - (-10)) = 110 — documents absence of upper clamp
  it('should return score greater than 100 when totalWords is negative (no upper clamp)', () => {
    const result = calculateMqmScore([mkFinding('minor', 'pending')], -100)
    expect(result.npt).toBe(-10)
    expect(result.mqmScore).toBe(110)
    expect(result.status).toBe('calculated')
  })

  // T6 [P1] FM-8: Unknown severity string silently excluded
  // The switch has no default case — an unrecognised severity is simply skipped
  it('should exclude a finding with unknown severity from counts and penalty', () => {
    const unknownSeverityFinding = {
      severity: 'info' as 'critical', // cast to satisfy ContributingFinding type
      status: 'pending' as const,
      segmentCount: 1,
    }
    const result = calculateMqmScore([unknownSeverityFinding], 1000)
    expect(result.criticalCount).toBe(0)
    expect(result.majorCount).toBe(0)
    expect(result.minorCount).toBe(0)
    expect(result.mqmScore).toBe(100)
    expect(result.npt).toBe(0)
  })

  // T7 [P1] FM-9: Negative totalWords with zero findings produces finite numbers
  // No findings → sumPenalties=0 → rawNpt=0/-1=−0 → no NaN or Infinity
  it('should return finite npt and score when totalWords is negative and no findings exist', () => {
    const result = calculateMqmScore([], -1)
    expect(Number.isFinite(result.npt)).toBe(true)
    expect(Number.isFinite(result.mqmScore)).toBe(true)
    expect(Number.isNaN(result.npt)).toBe(false)
    expect(Number.isNaN(result.mqmScore)).toBe(false)
    expect(result.status).toBe('calculated')
  })

  // T8 [P2] INV-6: Monotonicity — adding a finding never increases score
  // base = [1 major] in 1000 words → score=95
  // extended = [1 major, 1 minor] in 1000 words → score=94
  it('should produce a lower or equal score when an additional finding is added', () => {
    const baseResult = calculateMqmScore([mkFinding('major', 'pending')], 1000)
    const extendedResult = calculateMqmScore(
      [mkFinding('major', 'pending'), mkFinding('minor', 'pending')],
      1000,
    )
    expect(extendedResult.mqmScore).toBeLessThanOrEqual(baseResult.mqmScore)
  })

  // T9 [P2] INV-3: Complementary property — mqmScore + npt === 100 when npt <= 100
  // [1 critical, 1 major, 1 minor] in 1000 words: sumPenalties=31, npt=31 (≤100), score=69
  it('should satisfy mqmScore + npt === 100 when NPT does not exceed 100', () => {
    const findings = [
      mkFinding('critical', 'pending'),
      mkFinding('major', 'pending'),
      mkFinding('minor', 'pending'),
    ]
    const result = calculateMqmScore(findings, 1000)
    // npt=31 which is ≤100, so max(0,...) has no effect
    expect(result.npt).toBeLessThanOrEqual(100)
    expect(result.mqmScore + result.npt).toBe(100)
  })

  // T10 [P2] A1.2: Fractional totalWords
  // 1 minor in 0.5 words: rawNpt=(1/0.5)*1000=2000 → clamped to score=0
  // Verifies the function handles non-integer totalWords without throwing
  it('should return finite mqmScore and npt when totalWords is a fraction', () => {
    const result = calculateMqmScore([mkFinding('minor', 'pending')], 0.5)
    expect(Number.isFinite(result.mqmScore)).toBe(true)
    expect(Number.isFinite(result.npt)).toBe(true)
    expect(result.mqmScore).toBeGreaterThanOrEqual(0)
    expect(result.status).toBe('calculated')
  })

  // T11 [P2] SET-2: Unknown status string excluded from contributing
  // 'deferred' is not in CONTRIBUTING_STATUSES → finding is filtered out
  it('should exclude a finding with unknown status from penalty calculation', () => {
    const unknownStatusFinding = {
      severity: 'major' as const,
      status: 'deferred' as 'pending', // cast to satisfy ContributingFinding type
      segmentCount: 1,
    }
    const result = calculateMqmScore([unknownStatusFinding], 1000)
    expect(result.majorCount).toBe(0)
    expect(result.mqmScore).toBe(100)
  })

  // T18 [P3] FM-10: Negative penalty weights cause score > 100 (no upper clamp)
  // weight.critical=-10 → sumPenalties=-10 → npt=-10 → score=max(0, 110)=110
  it('should return score greater than 100 when penalty weight is negative (no upper clamp)', () => {
    const negativeWeights = { critical: -10, major: 5, minor: 1 }
    const result = calculateMqmScore([mkFinding('critical', 'pending')], 1000, negativeWeights)
    expect(result.npt).toBe(-10)
    expect(result.mqmScore).toBeGreaterThan(100)
  })

  // T19 [P3] INV-4: Contributing counts sum <= total input findings length
  // Input: 4 findings — only 2 have contributing status (pending + accepted)
  // rejected and flagged are excluded → countSum=2 ≤ 4
  it('should have total contributing count less than or equal to total input findings', () => {
    const findings = [
      mkFinding('critical', 'pending'), // contributes
      mkFinding('major', 'rejected'), // excluded
      mkFinding('minor', 'accepted'), // contributes
      mkFinding('critical', 'flagged'), // excluded
    ]
    const result = calculateMqmScore(findings, 1000)
    const countSum = result.criticalCount + result.majorCount + result.minorCount
    expect(countSum).toBe(2)
    expect(countSum).toBeLessThanOrEqual(findings.length)
  })
})
