import type { FindingStatus, PenaltyWeights } from './types'

export const DEFAULT_PENALTY_WEIGHTS: PenaltyWeights = {
  critical: 25,
  major: 5,
  minor: 1,
}

// Finding statuses that contribute to MQM score penalty
// 're_accepted' included because it's semantically "accepted again after re-review"
// 'manual' included because reviewer-added findings are confirmed issues (S2 adversarial review)
// 'flagged' EXCLUDED — uncertain/unconfirmed, no penalty until resolved (S2 fix)
// Typed as ReadonlySet<FindingStatus> (not string) so TS catches invalid status literals
export const CONTRIBUTING_STATUSES: ReadonlySet<FindingStatus> = new Set<FindingStatus>([
  'pending',
  'accepted',
  're_accepted',
  'manual',
])

// Default project auto-pass threshold (matches DB column default in projects.auto_pass_threshold)
export const DEFAULT_AUTO_PASS_THRESHOLD = 95

// New language pair protocol thresholds (AC #6)
export const NEW_PAIR_FILE_THRESHOLD = 50

// Conservative auto-pass threshold for new (uncalibrated) language pairs
export const CONSERVATIVE_AUTO_PASS_THRESHOLD = 99
