import { describe, expect, it } from 'vitest'

import { CONFIRMATION_STATES, INLINE_TAG_TYPES, SKIP_QA_STATES, XLIFF_STATE_MAP } from './constants'
import type { ConfirmationState, InlineTagType, XliffState } from './types'

describe('Parser constants', () => {
  describe('INLINE_TAG_TYPES', () => {
    it('should contain all 7 XLIFF inline tag types', () => {
      expect(INLINE_TAG_TYPES).toHaveLength(7)
      const expected: InlineTagType[] = ['g', 'x', 'ph', 'bx', 'ex', 'bpt', 'ept']
      for (const tag of expected) {
        expect(INLINE_TAG_TYPES).toContain(tag)
      }
    })
  })

  describe('CONFIRMATION_STATES', () => {
    it('should contain all 6 SDLXLIFF confirmation states', () => {
      expect(CONFIRMATION_STATES).toHaveLength(6)
      const expected: ConfirmationState[] = [
        'Draft',
        'Translated',
        'ApprovedTranslation',
        'ApprovedSignOff',
        'RejectedTranslation',
        'RejectedSignOff',
      ]
      for (const state of expected) {
        expect(CONFIRMATION_STATES).toContain(state)
      }
    })

    it('should NOT contain non-standard conf values (negative assertion, M7)', () => {
      expect(CONFIRMATION_STATES).not.toContain('PendingTranslation')
      expect(CONFIRMATION_STATES).not.toContain('Unknown')
      expect(CONFIRMATION_STATES).not.toContain('')
    })
  })

  describe('SKIP_QA_STATES', () => {
    it('should only skip ApprovedSignOff segments', () => {
      expect(SKIP_QA_STATES).toContain('ApprovedSignOff')
      expect(SKIP_QA_STATES).not.toContain('Draft')
      expect(SKIP_QA_STATES).not.toContain('Translated')
    })
  })

  describe('XLIFF_STATE_MAP', () => {
    it('should map "new" to Draft', () => {
      expect(XLIFF_STATE_MAP.new).toBe('Draft')
    })

    it('should map "needs-translation" to Draft', () => {
      expect(XLIFF_STATE_MAP['needs-translation']).toBe('Draft')
    })

    it('should map "needs-l10n" to Draft', () => {
      expect(XLIFF_STATE_MAP['needs-l10n']).toBe('Draft')
    })

    it('should map "needs-review-translation" to Draft', () => {
      expect(XLIFF_STATE_MAP['needs-review-translation']).toBe('Draft')
    })

    it('should map "needs-review-l10n" to Draft', () => {
      expect(XLIFF_STATE_MAP['needs-review-l10n']).toBe('Draft')
    })

    it('should map "translated" to Translated', () => {
      expect(XLIFF_STATE_MAP.translated).toBe('Translated')
    })

    it('should map "signed-off" to ApprovedSignOff', () => {
      expect(XLIFF_STATE_MAP['signed-off']).toBe('ApprovedSignOff')
    })

    it('should map "final" to ApprovedSignOff', () => {
      expect(XLIFF_STATE_MAP.final).toBe('ApprovedSignOff')
    })

    it('should cover all XliffState keys with correct ConfirmationState values (L5)', () => {
      // Use toBe for each entry — toBeDefined() would pass even with wrong mapped values
      const expectedMappings: Record<XliffState, string> = {
        new: 'Draft',
        'needs-translation': 'Draft',
        'needs-l10n': 'Draft',
        'needs-review-translation': 'Draft',
        'needs-review-l10n': 'Draft',
        translated: 'Translated',
        'signed-off': 'ApprovedSignOff',
        final: 'ApprovedSignOff',
      }
      for (const [state, expected] of Object.entries(expectedMappings)) {
        expect(XLIFF_STATE_MAP[state as XliffState]).toBe(expected)
      }
    })
  })
})
