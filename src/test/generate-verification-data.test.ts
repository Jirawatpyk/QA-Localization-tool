/**
 * ATDD Story 5.3 — AC7: Verification Data Generator Fix (TD-TEST-007)
 *
 * Tests that error type assignments validate template compatibility.
 * 25/88 annotations were invalid due to 3 bugs:
 * - number_mismatch assigned to templates without number placeholders
 * - placeholder_mismatch assigned to templates without placeholder syntax
 * - glossary_violation assigned to templates without glossary terms
 */

import { describe, it, expect } from 'vitest'

import { isTemplateCompatible } from '../../scripts/generate-verification-data.mjs'

describe('AC7: Verification Data Generator — Template Validation (TD-TEST-007)', () => {
  // Templates WITH placeholders: indices 0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 28
  // Templates WITHOUT placeholders: indices 2, 11, 23, 27, 29

  // ── AC7 / Scenario 7.1 [P1]: number_mismatch requires number placeholders ──
  it('should only assign number_mismatch to templates containing {0}, {1}, etc.', () => {
    // Template 0 has {0} → valid
    expect(isTemplateCompatible(0, 'number_mismatch')).toBe(true)
    // Template 7 has {0} and {1} → valid
    expect(isTemplateCompatible(7, 'number_mismatch')).toBe(true)
    // Template 2 (no placeholders) → invalid
    expect(isTemplateCompatible(2, 'number_mismatch')).toBe(false)
    // Template 11 (no placeholders) → invalid
    expect(isTemplateCompatible(11, 'number_mismatch')).toBe(false)
    // Template 27 (no placeholders) → invalid
    expect(isTemplateCompatible(27, 'number_mismatch')).toBe(false)
  })

  // ── AC7 / Scenario 7.2 [P1]: placeholder_mismatch requires placeholder syntax ──
  it('should only assign placeholder_mismatch to templates with {0}, {1}, etc.', () => {
    // Template 3 has {0} → valid
    expect(isTemplateCompatible(3, 'placeholder_mismatch')).toBe(true)
    // Template 23 (no placeholders, just "Click Next...") → invalid
    expect(isTemplateCompatible(23, 'placeholder_mismatch')).toBe(false)
    // Template 29 (no placeholders) → invalid
    expect(isTemplateCompatible(29, 'placeholder_mismatch')).toBe(false)
  })

  // ── AC7 / Scenario 7.3 [P1]: glossary_violation requires glossary terms ──
  it('should only assign glossary_violation to templates containing glossary terms', () => {
    // Template 0 contains "training" → valid
    expect(isTemplateCompatible(0, 'glossary_violation')).toBe(true)
    // Template 4 contains "system" → valid
    expect(isTemplateCompatible(4, 'glossary_violation')).toBe(true)
    // Template 17 contains "performance" → valid
    expect(isTemplateCompatible(17, 'glossary_violation')).toBe(true)
    // Template 2 (Click Submit — no glossary terms) → invalid
    expect(isTemplateCompatible(2, 'glossary_violation')).toBe(false)
    // Template 23 (Click Next — no glossary terms) → invalid
    expect(isTemplateCompatible(23, 'glossary_violation')).toBe(false)
  })

  // ── AC7 / Boundary [P1]: Template with 0 placeholders ────────────────
  it('should handle template with zero placeholders — non-template errors always valid', () => {
    // Template 2 has no placeholders — tag_error is always valid
    expect(isTemplateCompatible(2, 'tag_error')).toBe(true)
    // whitespace_issue is always valid
    expect(isTemplateCompatible(2, 'whitespace_issue')).toBe(true)
    // consistency_error is always valid
    expect(isTemplateCompatible(2, 'consistency_error')).toBe(true)
    // But number_mismatch is NOT valid for template 2
    expect(isTemplateCompatible(2, 'number_mismatch')).toBe(false)
  })
})
