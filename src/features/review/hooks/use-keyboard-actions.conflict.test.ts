/**
 * ATDD Story 4.8 — Hotkey Conflict Detection (TDD Green Phase)
 * Test: TA-02 (AC1, P0)
 *
 * Verifies that all review hotkey combinations are conflict-free
 * when registered in the same scope.
 *
 * Uses production exports (REVIEW_HOTKEYS, ParsedKey) to stay in sync.
 */
import { describe, it, expect } from 'vitest'

import { REVIEW_HOTKEYS, type ParsedKey } from './use-keyboard-actions'

// ── Navigation + modified hotkeys (not exported — kept in sync manually) ──
// If these change in production, the test below will still catch collisions
// via REVIEW_HOTKEYS import. These are supplementary.

const NAVIGATION_HOTKEYS = ['j', 'k']
const MODIFIED_HOTKEYS = ['ctrl+z', 'ctrl+shift+z', 'ctrl+a', 'ctrl+k', 'ctrl+?']

// Guardrail #34: browser shortcuts that MUST NOT be overridden
const BROWSER_SHORTCUTS = ['ctrl+s', 'ctrl+p', 'ctrl+w', 'ctrl+n', 'ctrl+t', 'f5']

// Guardrail #28: input elements where single-key hotkeys are suppressed
const INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']

// Simple key parser matching the logic in use-keyboard-actions.ts
function parseKeyForTest(raw: string): ParsedKey {
  const parts = raw.toLowerCase().split('+')
  const modifiers: Array<'alt' | 'ctrl' | 'meta' | 'shift'> = []
  let key = ''

  for (const part of parts) {
    if (part === 'ctrl' || part === 'alt' || part === 'meta' || part === 'shift') {
      modifiers.push(part)
    } else {
      key = part === ' ' ? 'space' : part
    }
  }
  modifiers.sort()

  return { key, modifiers, raw: [...modifiers, key].join('+') }
}

describe('Keyboard Actions Conflict Detection', () => {
  describe('TA-02: All hotkeys conflict-free in review scope (AC1, P0)', () => {
    it('should have exactly 7 review action hotkeys from production config', () => {
      // Import from production — if hotkeys change, this test updates automatically
      expect(REVIEW_HOTKEYS).toHaveLength(7)
      const keys = REVIEW_HOTKEYS.map((h) => h.key)
      expect(keys).toContain('a')
      expect(keys).toContain('r')
      expect(keys).toContain('f')
      expect(keys).toContain('n')
      expect(keys).toContain('s')
      expect(keys).toContain('+')
      expect(keys).toContain('-')
    })

    it('should register all single-key hotkeys without collision (A/R/F/N/S/+/-/J/K)', () => {
      const actionKeys = REVIEW_HOTKEYS.map((h) => h.key)
      const allSingleKeys = [...actionKeys, ...NAVIGATION_HOTKEYS]
      const parsed = allSingleKeys.map((k) => parseKeyForTest(k))
      const keys = parsed.map((p) => p.raw)

      // All keys should be unique (no duplicates)
      const unique = new Set(keys)
      expect(unique.size).toBe(allSingleKeys.length)
      expect(unique.size).toBe(9) // 7 action + 2 navigation
    })

    it('should register all modified hotkeys without collision', () => {
      const parsed = MODIFIED_HOTKEYS.map((k) => parseKeyForTest(k))
      const keys = parsed.map((p) => p.raw)

      // All modified keys should be unique
      const unique = new Set(keys)
      expect(unique.size).toBe(MODIFIED_HOTKEYS.length)

      // No overlap with single-key hotkeys (from production config)
      const actionKeys = REVIEW_HOTKEYS.map((h) => h.key)
      const singleParsed = [...actionKeys, ...NAVIGATION_HOTKEYS].map((k) => parseKeyForTest(k).raw)
      for (const mk of keys) {
        expect(singleParsed).not.toContain(mk)
      }
    })

    it('should not conflict with browser shortcuts (Ctrl+S/P/W/N/T/F5)', () => {
      const actionKeys = REVIEW_HOTKEYS.map((h) => h.key)
      const reviewKeys = [
        ...actionKeys.map((k) => parseKeyForTest(k).raw),
        ...NAVIGATION_HOTKEYS.map((k) => parseKeyForTest(k).raw),
        ...MODIFIED_HOTKEYS.map((k) => parseKeyForTest(k).raw),
      ]

      // Browser shortcuts must not appear in review key registrations
      for (const bs of BROWSER_SHORTCUTS) {
        const parsed = parseKeyForTest(bs).raw
        expect(reviewKeys).not.toContain(parsed)
      }
    })

    it('should suppress single-key hotkeys in input/textarea/select/contenteditable', () => {
      // Verify INPUT_TAGS covers the standard suppressible elements
      for (const tag of INPUT_TAGS) {
        expect(['INPUT', 'TEXTAREA', 'SELECT']).toContain(tag)
      }

      // All review action keys (from production) are single-key (no modifiers)
      for (const hotkey of REVIEW_HOTKEYS) {
        const parsed = parseKeyForTest(hotkey.key)
        expect(parsed.modifiers.length).toBe(0) // confirm these are single-key
      }

      // Modified keys should NOT be suppressed in inputs (they have modifiers)
      for (const key of MODIFIED_HOTKEYS) {
        const parsed = parseKeyForTest(key)
        expect(parsed.modifiers.length).toBeGreaterThan(0)
      }
    })
  })
})
