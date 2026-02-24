import { CONTRIBUTING_STATUSES, DEFAULT_PENALTY_WEIGHTS } from './constants'
import type { ContributingFinding, MqmScoreResult, PenaltyWeights } from './types'

/**
 * Pure MQM score calculator.
 *
 * No server dependencies — importable from both Server Actions and Inngest functions.
 * Formula: Score = max(0, 100 - NPT), where NPT = (sumPenalties / totalWords) x 1000
 *
 * Key rules:
 * - Only findings with status in CONTRIBUTING_STATUSES contribute to penalty
 * - Each finding counts once regardless of segmentCount (multi-segment span = 1 penalty)
 * - totalWords === 0 → status 'na' (cannot score)
 */
export function calculateMqmScore(
  findings: ContributingFinding[],
  totalWords: number,
  penaltyWeights: PenaltyWeights = DEFAULT_PENALTY_WEIGHTS,
): MqmScoreResult {
  // Edge case: empty or tag-only file — cannot compute NPT
  if (totalWords === 0) {
    return {
      mqmScore: 0,
      npt: 0,
      criticalCount: 0,
      majorCount: 0,
      minorCount: 0,
      totalWords: 0,
      status: 'na',
    }
  }

  // Filter to only contributing findings
  const contributing = findings.filter((f) => CONTRIBUTING_STATUSES.has(f.status))

  let criticalCount = 0
  let majorCount = 0
  let minorCount = 0
  let sumPenalties = 0

  for (const finding of contributing) {
    // Each finding counts ONCE — segmentCount does NOT multiply the penalty (AC #4)
    switch (finding.severity) {
      case 'critical':
        criticalCount++
        sumPenalties += penaltyWeights.critical
        break
      case 'major':
        majorCount++
        sumPenalties += penaltyWeights.major
        break
      case 'minor':
        minorCount++
        sumPenalties += penaltyWeights.minor
        break
    }
  }

  const rawNpt = (sumPenalties / totalWords) * 1000
  // Round to 2 decimal precision to avoid floating-point display artifacts (Dev Notes)
  const npt = Math.round(rawNpt * 100) / 100
  // Round score to 2dp as well — npt is already rounded, but 100-npt can still
  // produce floating-point artifacts (e.g. 100 - 30.01 = 69.99000000000001)
  const mqmScore = Math.round(Math.max(0, 100 - npt) * 100) / 100

  return {
    mqmScore,
    npt,
    criticalCount,
    majorCount,
    minorCount,
    totalWords,
    status: 'calculated',
  }
}
