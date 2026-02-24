import type { PenaltyWeights } from './types'

export const DEFAULT_PENALTY_WEIGHTS: PenaltyWeights = {
  critical: 25,
  major: 5,
  minor: 1,
}

// Finding statuses that contribute to MQM score penalty
// 're_accepted' included because it's semantically "accepted again after re-review"
export const CONTRIBUTING_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'accepted',
  're_accepted',
])

// New language pair protocol thresholds (AC #6)
export const NEW_PAIR_FILE_THRESHOLD = 50

// Conservative auto-pass threshold for new (uncalibrated) language pairs
export const CONSERVATIVE_AUTO_PASS_THRESHOLD = 99
