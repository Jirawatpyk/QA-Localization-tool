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

    it('should cover all XliffState keys', () => {
      const allXliffStates: XliffState[] = [
        'new',
        'needs-translation',
        'needs-l10n',
        'needs-review-translation',
        'needs-review-l10n',
        'translated',
        'signed-off',
        'final',
      ]
      for (const state of allXliffStates) {
        expect(XLIFF_STATE_MAP[state]).toBeDefined()
      }
    })
  })
})
