import { describe, expect, it } from 'vitest'

import {
  BUDDHIST_YEAR_OFFSET,
  FINDING_BATCH_SIZE,
  MAX_EXCERPT_LENGTH,
  PLACEHOLDER_PATTERNS,
  RULE_CATEGORIES,
  THAI_NUMERAL_MAP,
  THAI_PARTICLES,
} from './constants'
import { isRuleCategory, isSeverity } from './types'

describe('isSeverity', () => {
  it('should return true for valid severity values', () => {
    expect(isSeverity('critical')).toBe(true)
    expect(isSeverity('major')).toBe(true)
    expect(isSeverity('minor')).toBe(true)
  })

  it('should return false for invalid severity values', () => {
    expect(isSeverity('high')).toBe(false)
    expect(isSeverity('low')).toBe(false)
    expect(isSeverity('')).toBe(false)
    expect(isSeverity('CRITICAL')).toBe(false)
  })
})

describe('isRuleCategory', () => {
  it('should return true for all valid L1 categories', () => {
    const validCategories = [
      'completeness',
      'tag_integrity',
      'number_format',
      'placeholder_integrity',
      'spacing',
      'punctuation',
      'url_integrity',
      'consistency',
      'glossary_compliance',
      'custom_rule',
      'capitalization',
      'spelling',
    ]
    for (const cat of validCategories) {
      expect(isRuleCategory(cat)).toBe(true)
    }
  })

  it('should return false for invalid category values', () => {
    expect(isRuleCategory('accuracy')).toBe(false)
    expect(isRuleCategory('unknown')).toBe(false)
    expect(isRuleCategory('')).toBe(false)
  })
})

describe('Constants', () => {
  it('should have 11 L1 rule categories (excludes spelling)', () => {
    expect(RULE_CATEGORIES).toHaveLength(11)
    expect(RULE_CATEGORIES).not.toContain('spelling')
  })

  it('should have MAX_EXCERPT_LENGTH of 500', () => {
    expect(MAX_EXCERPT_LENGTH).toBe(500)
  })

  it('should have FINDING_BATCH_SIZE of 100', () => {
    expect(FINDING_BATCH_SIZE).toBe(100)
  })

  it('should map all 10 Thai numerals', () => {
    expect(Object.keys(THAI_NUMERAL_MAP)).toHaveLength(10)
    expect(THAI_NUMERAL_MAP['๐']).toBe('0')
    expect(THAI_NUMERAL_MAP['๙']).toBe('9')
  })

  it('should have 8 Thai particles', () => {
    expect(THAI_PARTICLES.size).toBe(8)
    expect(THAI_PARTICLES.has('ครับ')).toBe(true)
    expect(THAI_PARTICLES.has('ค่ะ')).toBe(true)
  })

  it('should have Buddhist year offset of 543', () => {
    expect(BUDDHIST_YEAR_OFFSET).toBe(543)
  })

  it('should have placeholder patterns for common formats', () => {
    // Test that patterns can match expected formats
    expect(PLACEHOLDER_PATTERNS.length).toBeGreaterThanOrEqual(5)

    // Verify at least one pattern matches {0} format (find by testing, not by array position)
    const text = 'Hello {0} world {1}'
    const curlyBracePattern = PLACEHOLDER_PATTERNS.find((p) => p.test('{0}'))
    expect(curlyBracePattern).toBeDefined()
    const matches = text.match(new RegExp(curlyBracePattern!.source, 'g'))
    expect(matches).toEqual(['{0}', '{1}'])
  })
})
