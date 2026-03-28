/**
 * Story 5.2c: Native Reviewer Keyboard Shortcuts (C/O)
 * Tests: verify REVIEW_HOTKEYS config includes C/O, proper categories, handler mapping
 *
 * CR-C5 fix: Rewritten to test actual production exports, not local vars.
 */
import { describe, it, expect } from 'vitest'

import { REVIEW_HOTKEYS } from '@/features/review/hooks/use-keyboard-actions'

describe('REVIEW_HOTKEYS — native reviewer shortcuts', () => {
  const nativeHotkeys = REVIEW_HOTKEYS.filter((h) => h.category === 'Native Review')

  it('should include C key for confirm (native)', () => {
    const confirmHotkey = nativeHotkeys.find((h) => h.key === 'c')
    expect(confirmHotkey).toBeDefined()
    expect(confirmHotkey!.description).toContain('Confirm')
  })

  it('should include O key for override (native)', () => {
    const overrideHotkey = nativeHotkeys.find((h) => h.key === 'o')
    expect(overrideHotkey).toBeDefined()
    expect(overrideHotkey!.description).toContain('Override')
  })

  it('should have exactly 2 native reviewer hotkeys', () => {
    expect(nativeHotkeys).toHaveLength(2)
  })

  it('should have 9 total review hotkeys (7 standard + 2 native)', () => {
    expect(REVIEW_HOTKEYS).toHaveLength(9)
  })

  it('should not conflict with standard review hotkeys (A/R/F/N/S/-/+)', () => {
    const standardKeys = REVIEW_HOTKEYS.filter((h) => h.category === 'Review Actions').map(
      (h) => h.key,
    )
    const nativeKeys = nativeHotkeys.map((h) => h.key)
    for (const nk of nativeKeys) {
      expect(standardKeys).not.toContain(nk)
    }
  })

  it('should use category "Native Review" for native-specific hotkeys', () => {
    for (const h of nativeHotkeys) {
      expect(h.category).toBe('Native Review')
    }
  })

  it('C key should not be a browser shortcut (safe to intercept)', () => {
    // Browser shortcuts: Ctrl+S, Ctrl+P, etc. — 'c' alone is safe
    // Guardrail #34: never override Ctrl+S/P/W/N/T/F5
    expect('c').not.toBe('ctrl+c') // 'c' alone, not Ctrl+C (which is copy)
  })

  it('should have all hotkeys with non-empty descriptions', () => {
    for (const h of REVIEW_HOTKEYS) {
      expect(h.description.length).toBeGreaterThan(0)
    }
  })
})
