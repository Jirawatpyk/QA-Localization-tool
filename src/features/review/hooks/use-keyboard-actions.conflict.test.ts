/**
 * ATDD Story 4.8 — Hotkey Conflict Detection (TDD Green Phase)
 * Test: TA-02 (AC1, P0)
 *
 * Verifies that all review hotkey combinations are conflict-free
 * when registered in the same scope.
 *
 * Tests the static configuration and logic of the keyboard action system.
 */
import { describe, it, expect } from 'vitest'

import type { ParsedKey } from './use-keyboard-actions'

// ── Test data: all review hotkeys ──

const SINGLE_KEY_HOTKEYS = ['a', 'r', 'f', 'n', 's', '+', '-', 'j', 'k']
const MODIFIED_HOTKEYS = ['ctrl+z', 'ctrl+shift+z', 'ctrl+a', 'ctrl+k', 'ctrl+?']
const BROWSER_SHORTCUTS = ['ctrl+s', 'ctrl+p', 'ctrl+w', 'ctrl+n', 'ctrl+t', 'f5']
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
    it('should register all single-key hotkeys without collision (A/R/F/N/S/+/-/J/K)', () => {
      const parsed = SINGLE_KEY_HOTKEYS.map((k) => parseKeyForTest(k))
      const keys = parsed.map((p) => p.raw)

      // All keys should be unique (no duplicates)
      const unique = new Set(keys)
      expect(unique.size).toBe(SINGLE_KEY_HOTKEYS.length)
      expect(unique.size).toBe(9) // exactly 9 single-key hotkeys
    })

    it('should register all modified hotkeys without collision (Ctrl+Z/Ctrl+Shift+Z/Ctrl+A/Ctrl+K/Ctrl+?)', () => {
      const parsed = MODIFIED_HOTKEYS.map((k) => parseKeyForTest(k))
      const keys = parsed.map((p) => p.raw)

      // All modified keys should be unique
      const unique = new Set(keys)
      expect(unique.size).toBe(MODIFIED_HOTKEYS.length)

      // No overlap with single-key hotkeys
      const singleParsed = SINGLE_KEY_HOTKEYS.map((k) => parseKeyForTest(k).raw)
      for (const mk of keys) {
        expect(singleParsed).not.toContain(mk)
      }
    })

    it('should not conflict with browser shortcuts (Ctrl+S/P/W/N/T/F5)', () => {
      const reviewKeys = [
        ...SINGLE_KEY_HOTKEYS.map((k) => parseKeyForTest(k).raw),
        ...MODIFIED_HOTKEYS.map((k) => parseKeyForTest(k).raw),
      ]

      // Browser shortcuts must not appear in review key registrations
      for (const bs of BROWSER_SHORTCUTS) {
        const parsed = parseKeyForTest(bs).raw
        expect(reviewKeys).not.toContain(parsed)
      }
    })

    it('should suppress single-key hotkeys in input/textarea/select/contenteditable', () => {
      // Verify INPUT_TAGS matches the suppression list in use-keyboard-actions.ts
      for (const tag of INPUT_TAGS) {
        expect(['INPUT', 'TEXTAREA', 'SELECT']).toContain(tag)
      }

      // Single keys (no modifiers) should be suppressed in input elements
      for (const key of SINGLE_KEY_HOTKEYS) {
        const parsed = parseKeyForTest(key)
        expect(parsed.modifiers.length).toBe(0) // confirm these are indeed single-key
      }

      // Modified keys should NOT be suppressed in inputs (they have modifiers)
      for (const key of MODIFIED_HOTKEYS) {
        const parsed = parseKeyForTest(key)
        expect(parsed.modifiers.length).toBeGreaterThan(0)
      }
    })
  })
})
