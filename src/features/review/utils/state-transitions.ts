import type { FindingStatus } from '@/types/finding'

export type ReviewAction = 'accept' | 'reject' | 'flag'

export type ScoreImpact = { countsPenalty: boolean }

/**
 * 24-cell transition matrix: 8 states × 3 actions.
 * Returns the new state, or null for no-op transitions.
 *
 * Rules (AC4):
 * - `manual` findings cannot be accepted/rejected/flagged (no-op for all)
 * - `accept` on `rejected` → `re_accepted` (special case)
 * - Idempotent: action on already-target state → null (no-op)
 */
const TRANSITION_MATRIX: Record<FindingStatus, Record<ReviewAction, FindingStatus | null>> = {
  pending: { accept: 'accepted', reject: 'rejected', flag: 'flagged' },
  accepted: { accept: null, reject: 'rejected', flag: 'flagged' },
  re_accepted: { accept: null, reject: 'rejected', flag: 'flagged' },
  rejected: { accept: 're_accepted', reject: null, flag: 'flagged' },
  flagged: { accept: 'accepted', reject: 'rejected', flag: null },
  noted: { accept: 'accepted', reject: 'rejected', flag: 'flagged' },
  source_issue: { accept: 'accepted', reject: 'rejected', flag: 'flagged' },
  manual: { accept: null, reject: null, flag: null },
}

export function getNewState(
  action: ReviewAction,
  currentState: FindingStatus,
): FindingStatus | null {
  return TRANSITION_MATRIX[currentState][action]
}

/**
 * Score impact per finding status (AC4).
 * - rejected, noted, source_issue → no penalty (false positive / observation / source problem)
 * - all others → counts at severity weight
 */
export const SCORE_IMPACT_MAP: Record<FindingStatus, ScoreImpact> = {
  pending: { countsPenalty: true },
  accepted: { countsPenalty: true },
  re_accepted: { countsPenalty: true },
  rejected: { countsPenalty: false },
  flagged: { countsPenalty: true },
  noted: { countsPenalty: false },
  source_issue: { countsPenalty: false },
  manual: { countsPenalty: true },
}
