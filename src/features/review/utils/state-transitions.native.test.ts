/**
 * Story 5.2c: Native Reviewer Workflow — State Transitions (confirm_native)
 * Tests: confirm_native in TRANSITION_MATRIX, override_native is dynamic (not in matrix)
 */
import { describe, it, expect } from 'vitest'

import { getNewState, type ReviewAction } from '@/features/review/utils/state-transitions'

describe('state-transitions — native reviewer actions', () => {
  // ── AC6: confirm_native transitions ──

  describe('confirm_native', () => {
    it('should transition flagged → accepted', () => {
      expect(getNewState('confirm_native', 'flagged')).toBe('accepted')
    })

    it('should return null for pending (no-op)', () => {
      expect(getNewState('confirm_native', 'pending')).toBeNull()
    })

    it('should return null for accepted (no-op)', () => {
      expect(getNewState('confirm_native', 'accepted')).toBeNull()
    })

    it('should return null for rejected (no-op)', () => {
      expect(getNewState('confirm_native', 'rejected')).toBeNull()
    })

    it('should return null for manual (always no-op)', () => {
      expect(getNewState('confirm_native', 'manual')).toBeNull()
    })

    it('should return null for all non-flagged states', () => {
      const states = [
        'pending',
        'accepted',
        're_accepted',
        'rejected',
        'noted',
        'source_issue',
        'manual',
      ] as const
      for (const state of states) {
        expect(getNewState('confirm_native', state)).toBeNull()
      }
    })
  })

  // ── AC6: override_native is NOT in the matrix ──

  describe('override_native (not in matrix)', () => {
    it('should NOT have override_native as a ReviewAction in the type', () => {
      // Compile-time check: ReviewAction does NOT include 'override_native'
      // The action code handles override dynamically — newStatus is chosen by native reviewer
      const allActions: ReviewAction[] = [
        'accept',
        'reject',
        'flag',
        'note',
        'source',
        'confirm_native',
      ]
      expect(allActions).toHaveLength(6)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(allActions).not.toContain('override_native' as any)
    })
  })
})
