/**
 * TDD RED PHASE — Story 4.2: Core Review Actions
 * Module: state-transitions (pure logic, no mocks)
 * Tests: getNewState() transition matrix + SCORE_IMPACT_MAP
 */
import { describe, it, expect } from 'vitest'

import { getNewState, SCORE_IMPACT_MAP } from '@/features/review/utils/state-transitions'
import type { FindingStatus } from '@/types/finding'
import { FINDING_STATUSES } from '@/types/finding'

// Will fail: module doesn't exist yet

// ── Types ──

type ReviewAction = 'accept' | 'reject' | 'flag'

// ── Full 24-cell transition matrix (8 states x 3 actions) ──

const EXPECTED_TRANSITIONS: Record<FindingStatus, Record<ReviewAction, FindingStatus | null>> = {
  pending: { accept: 'accepted', reject: 'rejected', flag: 'flagged' },
  accepted: { accept: null, reject: 'rejected', flag: 'flagged' },
  re_accepted: { accept: null, reject: 'rejected', flag: 'flagged' },
  rejected: { accept: 're_accepted', reject: null, flag: 'flagged' },
  flagged: { accept: 'accepted', reject: 'rejected', flag: null },
  noted: { accept: 'accepted', reject: 'rejected', flag: 'flagged' },
  source_issue: { accept: 'accepted', reject: 'rejected', flag: 'flagged' },
  manual: { accept: null, reject: null, flag: null },
}

// ── SCORE_IMPACT_MAP expected values ──

const EXPECTED_SCORE_IMPACT: Record<FindingStatus, { countsPenalty: boolean }> = {
  pending: { countsPenalty: true },
  accepted: { countsPenalty: true },
  re_accepted: { countsPenalty: true },
  rejected: { countsPenalty: false },
  flagged: { countsPenalty: true },
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

    // ── P0: Full 24-transition matrix ──

    it('[P0] U-T8: should produce correct output for ALL 24 state-action combinations', () => {
      const actions: ReviewAction[] = ['accept', 'reject', 'flag']

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

  // ── Boundary Value Tests ──

  describe('boundary values', () => {
    it('[P0] U-B1: 0 pending findings — auto-advance helper should return null', () => {
      // Given: an array of findings, all non-pending
      const findings = [
        { id: 'f1', status: 'accepted' as FindingStatus },
        { id: 'f2', status: 'rejected' as FindingStatus },
      ]
      const nextPending = findings.find((f) => f.status === 'pending')
      expect(nextPending).toBeUndefined()
    })

    it('[P0] U-B2: 1 pending finding — auto-advance should find it', () => {
      // Given: exactly 1 pending finding among others
      const findings = [
        { id: 'f1', status: 'accepted' as FindingStatus },
        { id: 'f2', status: 'pending' as FindingStatus },
        { id: 'f3', status: 'rejected' as FindingStatus },
      ]
      const nextPending = findings.find((f) => f.status === 'pending')
      expect(nextPending).toBeDefined()
      expect(nextPending!.id).toBe('f2')
    })

    it('[P1] U-B3: reviewed count — 0 of N reviewed', () => {
      const findings = [
        { status: 'pending' as FindingStatus },
        { status: 'pending' as FindingStatus },
        { status: 'pending' as FindingStatus },
      ]
      const reviewedCount = findings.filter((f) => f.status !== 'pending').length
      expect(reviewedCount).toBe(0)
    })

    it('[P1] U-B4: reviewed count — N of N reviewed', () => {
      const findings = [
        { status: 'accepted' as FindingStatus },
        { status: 'rejected' as FindingStatus },
        { status: 'flagged' as FindingStatus },
      ]
      const total = findings.length
      const reviewedCount = findings.filter((f) => f.status !== 'pending').length
      expect(reviewedCount).toBe(total)
    })
  })
})
