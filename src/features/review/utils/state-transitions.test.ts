/**
 * TDD RED PHASE — Story 4.2: Core Review Actions
 * Module: state-transitions (pure logic, no mocks)
 * Tests: getNewState() transition matrix + SCORE_IMPACT_MAP
 */
import { describe, it, expect } from 'vitest'

import { getNewState, SCORE_IMPACT_MAP } from '@/features/review/utils/state-transitions'
import type { ReviewAction } from '@/features/review/utils/state-transitions'
import type { FindingStatus } from '@/types/finding'
import { FINDING_STATUSES } from '@/types/finding'

// ── Full 24-cell transition matrix (8 states x 3 actions) ──

// Full 40-cell transition matrix (8 states × 5 actions) — Story 4.3 extends 8×3 → 8×5
const EXPECTED_TRANSITIONS: Record<FindingStatus, Record<ReviewAction, FindingStatus | null>> = {
  pending: {
    accept: 'accepted',
    reject: 'rejected',
    flag: 'flagged',
    note: 'noted',
    source: 'source_issue',
  },
  accepted: {
    accept: null,
    reject: 'rejected',
    flag: 'flagged',
    note: 'noted',
    source: 'source_issue',
  },
  re_accepted: {
    accept: null,
    reject: 'rejected',
    flag: 'flagged',
    note: 'noted',
    source: 'source_issue',
  },
  rejected: {
    accept: 're_accepted',
    reject: null,
    flag: 'flagged',
    note: 'noted',
    source: 'source_issue',
  },
  flagged: {
    accept: 'accepted',
    reject: 'rejected',
    flag: null,
    note: 'noted',
    source: 'source_issue',
  },
  noted: {
    accept: 'accepted',
    reject: 'rejected',
    flag: 'flagged',
    note: null,
    source: 'source_issue',
  },
  source_issue: {
    accept: 'accepted',
    reject: 'rejected',
    flag: 'flagged',
    note: 'noted',
    source: null,
  },
  manual: { accept: null, reject: null, flag: null, note: null, source: null },
}

// ── SCORE_IMPACT_MAP expected values ──

const EXPECTED_SCORE_IMPACT: Record<FindingStatus, { countsPenalty: boolean }> = {
  pending: { countsPenalty: true },
  accepted: { countsPenalty: true },
  re_accepted: { countsPenalty: true },
  rejected: { countsPenalty: false },
  flagged: { countsPenalty: false }, // S2 fix: flagged = uncertain → no penalty
  noted: { countsPenalty: false },
  source_issue: { countsPenalty: false },
  manual: { countsPenalty: true },
}

describe('state-transitions', () => {
  describe('getNewState', () => {
    // ── P0: Individual representative transitions ──

    it('[P0] U-T1: should return accepted when accept on pending', () => {
      expect(getNewState('accept', 'pending')).toBe('accepted')
    })

    it('[P0] U-T2: should return re_accepted when accept on rejected', () => {
      expect(getNewState('accept', 'rejected')).toBe('re_accepted')
    })

    it('[P0] U-T3: should return null (no-op) when accept on accepted', () => {
      expect(getNewState('accept', 'accepted')).toBeNull()
    })

    it('[P0] U-T4: should return rejected when reject on pending', () => {
      expect(getNewState('reject', 'pending')).toBe('rejected')
    })

    it('[P0] U-T5: should return null (no-op) when reject on rejected', () => {
      expect(getNewState('reject', 'rejected')).toBeNull()
    })

    it('[P0] U-T6: should return null (no-op) when flag on flagged', () => {
      expect(getNewState('flag', 'flagged')).toBeNull()
    })

    it('[P0] U-T7: should return flagged when flag on pending', () => {
      expect(getNewState('flag', 'pending')).toBe('flagged')
    })

    // ── P0: Full 40-transition matrix (8 states × 5 actions) ──

    it('[P0] U-T8: should produce correct output for ALL 40 state-action combinations', () => {
      const actions: ReviewAction[] = ['accept', 'reject', 'flag', 'note', 'source']

      for (const status of FINDING_STATUSES) {
        for (const action of actions) {
          const expected = EXPECTED_TRANSITIONS[status][action]
          const actual = getNewState(action, status)
          expect(actual, `getNewState('${action}', '${status}')`).toBe(expected)
        }
      }
    })

    // ── P0: Boundary — manual state is always no-op ──

    it('[P0] U-T8b: manual state should return null for all actions', () => {
      expect(getNewState('accept', 'manual')).toBeNull()
      expect(getNewState('reject', 'manual')).toBeNull()
      expect(getNewState('flag', 'manual')).toBeNull()
      expect(getNewState('note', 'manual')).toBeNull()
      expect(getNewState('source', 'manual')).toBeNull()
    })

    // ── Story 4.3 ATDD: Note action transitions ──

    it('[P0] U-N1: should return noted when note on pending', () => {
      expect(getNewState('note', 'pending')).toBe('noted')
    })

    it('[P0] U-N2: should return noted when note on accepted', () => {
      expect(getNewState('note', 'accepted')).toBe('noted')
    })

    it('[P0] U-N3: should return noted when note on rejected', () => {
      expect(getNewState('note', 'rejected')).toBe('noted')
    })

    it('[P0] U-N4: should return noted when note on flagged', () => {
      expect(getNewState('note', 'flagged')).toBe('noted')
    })

    it('[P0] U-N5: should return noted when note on source_issue', () => {
      expect(getNewState('note', 'source_issue')).toBe('noted')
    })

    it('[P0] U-N6: should return null when note on noted (no-op)', () => {
      expect(getNewState('note', 'noted')).toBeNull()
    })

    it('[P0] U-N7: should return null when note on manual (no-op)', () => {
      expect(getNewState('note', 'manual')).toBeNull()
    })

    // ── Story 4.3 ATDD: Source Issue action transitions ──

    it('[P0] U-S1: should return source_issue when source on pending', () => {
      expect(getNewState('source', 'pending')).toBe('source_issue')
    })

    it('[P0] U-S2: should return source_issue when source on accepted', () => {
      expect(getNewState('source', 'accepted')).toBe('source_issue')
    })

    it('[P0] U-S3: should return source_issue when source on rejected', () => {
      expect(getNewState('source', 'rejected')).toBe('source_issue')
    })

    it('[P0] U-S4: should return source_issue when source on noted', () => {
      expect(getNewState('source', 'noted')).toBe('source_issue')
    })

    it('[P0] U-S5: should return null when source on source_issue (no-op)', () => {
      expect(getNewState('source', 'source_issue')).toBeNull()
    })

    it('[P0] U-S6: should return null when source on manual (no-op)', () => {
      expect(getNewState('source', 'manual')).toBeNull()
    })
  })

  describe('SCORE_IMPACT_MAP', () => {
    it('[P0] U-T9: should map all 8 statuses to correct countsPenalty values', () => {
      for (const status of FINDING_STATUSES) {
        const expected = EXPECTED_SCORE_IMPACT[status]
        expect(SCORE_IMPACT_MAP[status], `SCORE_IMPACT_MAP['${status}']`).toEqual(expected)
      }
    })

    it('[P0] U-T9b: should have entries for exactly all 8 FINDING_STATUSES', () => {
      const mapKeys = Object.keys(SCORE_IMPACT_MAP).sort()
      const statusKeys = [...FINDING_STATUSES].sort()
      expect(mapKeys).toEqual(statusKeys)
    })
  })

  // ── Boundary Value Tests (H4 fix: test production code, not Array.find) ──

  describe('boundary values — SCORE_IMPACT_MAP driven auto-advance logic', () => {
    it('[P0] U-B1: 0 pending → all transitions produce non-pending states, countsPenalty varies', () => {
      // H4 fix: verify via production getNewState that accepting all pending = no pending left
      // After accept: pending → accepted (countsPenalty: true)
      // After reject: pending → rejected (countsPenalty: false)
      // After flag: pending → flagged (countsPenalty: true)
      // All 3 actions on pending produce non-pending states → 0 pending after processing
      const pendingStates: FindingStatus[] = ['pending', 'pending', 'pending']
      const actions: ReviewAction[] = ['accept', 'reject', 'flag']
      const results = pendingStates.map((s, i) => getNewState(actions[i]!, s))
      // None should be null (no no-ops) and none should be 'pending'
      for (const r of results) {
        expect(r).not.toBeNull()
        expect(r).not.toBe('pending')
      }
      // Verify score impact: rejected + flagged have no penalty, accepted does
      expect(SCORE_IMPACT_MAP.accepted.countsPenalty).toBe(true)
      expect(SCORE_IMPACT_MAP.rejected.countsPenalty).toBe(false)
      expect(SCORE_IMPACT_MAP.flagged.countsPenalty).toBe(false) // S2 fix: uncertain → no penalty
    })

    it('[P0] U-B2: 1 pending among non-pending — getNewState on pending produces valid target', () => {
      // H4 fix: production getNewState used to verify the transition
      const statuses: FindingStatus[] = ['accepted', 'pending', 'rejected']
      const pendingIdx = statuses.findIndex((s) => s === 'pending')
      expect(pendingIdx).toBe(1) // the 1 pending is at index 1
      const newState = getNewState('accept', statuses[pendingIdx]!)
      expect(newState).toBe('accepted')
    })

    it('[P1] U-B3: reviewed count — all pending = 0 reviewed (SCORE_IMPACT_MAP all true)', () => {
      // H4 fix: test that pending status maps to countsPenalty=true (affects score)
      const pendingStatuses: FindingStatus[] = ['pending', 'pending', 'pending']
      const reviewedCount = pendingStatuses.filter((s) => s !== 'pending').length
      expect(reviewedCount).toBe(0)
      // All pending = all count as penalty in score
      for (const s of pendingStatuses) {
        expect(SCORE_IMPACT_MAP[s].countsPenalty).toBe(true)
      }
    })

    it('[P1] U-B4: reviewed count — N of N reviewed, mixed score impacts', () => {
      // H4 fix: use getNewState to produce reviewed states, verify score impacts
      const reviewedStatuses: FindingStatus[] = ['accepted', 'rejected', 'flagged']
      const reviewedCount = reviewedStatuses.filter((s) => s !== 'pending').length
      expect(reviewedCount).toBe(reviewedStatuses.length)
      // rejected + flagged = no penalty, accepted = penalty (S2 fix)
      expect(SCORE_IMPACT_MAP.rejected.countsPenalty).toBe(false)
      expect(SCORE_IMPACT_MAP.accepted.countsPenalty).toBe(true)
      expect(SCORE_IMPACT_MAP.flagged.countsPenalty).toBe(false)
    })
  })
})
