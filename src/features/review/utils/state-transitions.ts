import type { FindingStatus } from '@/types/finding'

export type ReviewAction = 'accept' | 'reject' | 'flag' | 'note' | 'source' | 'confirm_native'

export type ScoreImpact = { countsPenalty: boolean }

/**
 * 40-cell transition matrix: 8 states × 5 actions (Story 4.3 extends 8×3 → 8×5).
 * Returns the new state, or null for no-op transitions.
 *
 * Rules:
 * - `manual` findings are no-op for ALL actions (can only be deleted)
 * - `accept` on `rejected` → `re_accepted` (special case)
 * - `note` from any state → `noted` (except already noted or manual)
 * - `source` from any state → `source_issue` (except already source_issue or manual)
 * - Idempotent: action on already-target state → null (no-op)
 * - `confirm_native`: only flagged → accepted in matrix. NOTE: actual target may be
 *   `re_accepted` if pre-flagged state was `rejected` — determined in action code,
 *   NOT the matrix. Do NOT use matrix for confirm_native optimistic updates. (Story 5.2c CF-2)
 */
const TRANSITION_MATRIX: Record<FindingStatus, Record<ReviewAction, FindingStatus | null>> = {
  pending: {
    accept: 'accepted',
    reject: 'rejected',
    flag: 'flagged',
    note: 'noted',
    source: 'source_issue',
    confirm_native: null,
  },
  accepted: {
    accept: null,
    reject: 'rejected',
    flag: 'flagged',
    note: 'noted',
    source: 'source_issue',
    confirm_native: null,
  },
  re_accepted: {
    accept: null,
    reject: 'rejected',
    flag: 'flagged',
    note: 'noted',
    source: 'source_issue',
    confirm_native: null,
  },
  rejected: {
    accept: 're_accepted',
    reject: null,
    flag: 'flagged',
    note: 'noted',
    source: 'source_issue',
    confirm_native: null,
  },
  flagged: {
    accept: 'accepted',
    reject: 'rejected',
    flag: null,
    note: 'noted',
    source: 'source_issue',
    confirm_native: 'accepted',
  },
  noted: {
    accept: 'accepted',
    reject: 'rejected',
    flag: 'flagged',
    note: null,
    source: 'source_issue',
    confirm_native: null,
  },
  source_issue: {
    accept: 'accepted',
    reject: 'rejected',
    flag: 'flagged',
    note: 'noted',
    source: null,
    confirm_native: null,
  },
  manual: {
    accept: null,
    reject: null,
    flag: null,
    note: null,
    source: null,
    confirm_native: null,
  },
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
  flagged: { countsPenalty: false }, // S2 fix: flagged = uncertain, not confirmed → no penalty (aligned with CONTRIBUTING_STATUSES)
  noted: { countsPenalty: false },
  source_issue: { countsPenalty: false },
  manual: { countsPenalty: true },
}
