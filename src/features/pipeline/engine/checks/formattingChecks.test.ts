import { describe, expect, it } from 'vitest'

import { buildSegment } from '@/test/factories'

import type { SegmentCheckContext } from '../types'

import {
  checkDoubleSpaces,
  checkEndPunctuation,
  checkLeadingTrailingSpaces,
  checkUnpairedBrackets,
  checkUrlMismatches,
} from './formattingChecks'

const ctx: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'th-TH' }

// ═══════════════════════════════════════════════
// Double Spaces (4 tests)
// ═══════════════════════════════════════════════

describe('checkDoubleSpaces', () => {
  it('should flag double spaces in target', () => {
    const segment = buildSegment({ targetText: 'Hello  world' })
    const result = checkDoubleSpaces(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('minor')
    expect(result!.category).toBe('spacing')
  })

  it('should return null when no double spaces', () => {
    const segment = buildSegment({ targetText: 'Hello world' })
    expect(checkDoubleSpaces(segment, ctx)).toBeNull()
  })

  it('should flag triple spaces', () => {
    const segment = buildSegment({ targetText: 'Hello   world' })
    expect(checkDoubleSpaces(segment, ctx)).not.toBeNull()
  })

  it('should return null for single spaces only', () => {
    const segment = buildSegment({ targetText: 'a b c d' })
    expect(checkDoubleSpaces(segment, ctx)).toBeNull()
  })
})

// ═══════════════════════════════════════════════
// Leading/Trailing Spaces (6 tests)
// ═══════════════════════════════════════════════

describe('checkLeadingTrailingSpaces', () => {
  it('should flag when source has leading space but target does not', () => {
    const segment = buildSegment({ sourceText: ' Hello', targetText: 'Hello' })
    const results = checkLeadingTrailingSpaces(segment, ctx)
    expect(results).toHaveLength(1)
    expect(results[0]!.description).toContain('Leading')
  })

  it('should flag when target has leading space but source does not', () => {
    const segment = buildSegment({ sourceText: 'Hello', targetText: ' Hello' })
    const results = checkLeadingTrailingSpaces(segment, ctx)
    expect(results).toHaveLength(1)
    expect(results[0]!.description).toContain('Leading')
  })

  it('should flag trailing whitespace mismatch', () => {
    const segment = buildSegment({ sourceText: 'Hello ', targetText: 'Hello' })
    const results = checkLeadingTrailingSpaces(segment, ctx)
    expect(results).toHaveLength(1)
    expect(results[0]!.description).toContain('Trailing')
  })

  it('should flag both leading and trailing mismatches', () => {
    const segment = buildSegment({ sourceText: ' Hello ', targetText: 'Hello' })
    const results = checkLeadingTrailingSpaces(segment, ctx)
    expect(results).toHaveLength(2)
  })

  it('should return empty when leading/trailing match', () => {
    const segment = buildSegment({ sourceText: ' Hello ', targetText: ' Hello ' })
    expect(checkLeadingTrailingSpaces(segment, ctx)).toEqual([])
  })

  it('should return empty when neither has leading/trailing spaces', () => {
    const segment = buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' })
    expect(checkLeadingTrailingSpaces(segment, ctx)).toEqual([])
  })
})

// ═══════════════════════════════════════════════
// Unpaired Brackets (12 tests)
// ═══════════════════════════════════════════════

describe('checkUnpairedBrackets', () => {
  it('should return empty for balanced parentheses', () => {
    const segment = buildSegment({ targetText: 'Hello (world)' })
    expect(checkUnpairedBrackets(segment, ctx)).toEqual([])
  })

  it('should flag unpaired opening parenthesis', () => {
    const segment = buildSegment({ targetText: 'Hello (world' })
    const results = checkUnpairedBrackets(segment, ctx)
    expect(results.some((r) => r.description.includes('()'))).toBe(true)
  })

  it('should flag unpaired closing parenthesis', () => {
    const segment = buildSegment({ targetText: 'Hello world)' })
    const results = checkUnpairedBrackets(segment, ctx)
    expect(results.some((r) => r.description.includes('()'))).toBe(true)
  })

  it('should return empty for balanced square brackets', () => {
    const segment = buildSegment({ targetText: 'See [note]' })
    expect(checkUnpairedBrackets(segment, ctx)).toEqual([])
  })

  it('should flag unpaired square bracket', () => {
    const segment = buildSegment({ targetText: 'See [note' })
    expect(checkUnpairedBrackets(segment, ctx).length).toBeGreaterThan(0)
  })

  it('should return empty for balanced curly braces', () => {
    const segment = buildSegment({ targetText: '{value}' })
    expect(checkUnpairedBrackets(segment, ctx)).toEqual([])
  })

  it('should flag unpaired curly brace', () => {
    const segment = buildSegment({ targetText: '{value' })
    expect(checkUnpairedBrackets(segment, ctx).length).toBeGreaterThan(0)
  })

  it('should return empty for balanced 「」', () => {
    const segment = buildSegment({ targetText: '「テスト」' })
    expect(checkUnpairedBrackets(segment, ctx)).toEqual([])
  })

  it('should flag unpaired 「', () => {
    const segment = buildSegment({ targetText: '「テスト' })
    expect(checkUnpairedBrackets(segment, ctx).length).toBeGreaterThan(0)
  })

  it('should return empty for balanced 【】', () => {
    const segment = buildSegment({ targetText: '【注意】' })
    expect(checkUnpairedBrackets(segment, ctx)).toEqual([])
  })

  it('should flag unpaired double quote', () => {
    const segment = buildSegment({ targetText: '"Hello' })
    const results = checkUnpairedBrackets(segment, ctx)
    expect(results.some((r) => r.description.includes('"'))).toBe(true)
  })

  it('should return empty for balanced double quotes', () => {
    const segment = buildSegment({ targetText: '"Hello"' })
    expect(checkUnpairedBrackets(segment, ctx)).toEqual([])
  })
})

// ═══════════════════════════════════════════════
// URL Mismatches (5 tests)
// ═══════════════════════════════════════════════

describe('checkUrlMismatches', () => {
  it('should return null when no URLs in source', () => {
    const segment = buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' })
    expect(checkUrlMismatches(segment, ctx)).toBeNull()
  })

  it('should return null when URLs match', () => {
    const segment = buildSegment({
      sourceText: 'Visit https://example.com',
      targetText: 'เยี่ยมชม https://example.com',
    })
    expect(checkUrlMismatches(segment, ctx)).toBeNull()
  })

  it('should flag when URL is missing in target', () => {
    const segment = buildSegment({
      sourceText: 'Visit https://example.com',
      targetText: 'เยี่ยมชม',
    })
    const result = checkUrlMismatches(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('major')
    expect(result!.category).toBe('url_integrity')
    expect(result!.description).toContain('https://example.com')
  })

  it('should flag when URL is modified in target', () => {
    const segment = buildSegment({
      sourceText: 'Visit https://example.com/page',
      targetText: 'เยี่ยมชม https://example.com/other',
    })
    const result = checkUrlMismatches(segment, ctx)
    expect(result).not.toBeNull()
  })

  it('should handle multiple URLs', () => {
    const segment = buildSegment({
      sourceText: 'See https://a.com and https://b.com',
      targetText: 'ดู https://a.com และ https://b.com',
    })
    expect(checkUrlMismatches(segment, ctx)).toBeNull()
  })
})

// ═══════════════════════════════════════════════
// End Punctuation (8 tests)
// ═══════════════════════════════════════════════

describe('checkEndPunctuation', () => {
  it('should return null when both end with same punctuation', () => {
    const segment = buildSegment({ sourceText: 'Hello.', targetText: 'สวัสดี.' })
    expect(checkEndPunctuation(segment, ctx)).toBeNull()
  })

  it('should flag when source ends with . but target ends with nothing', () => {
    const segment = buildSegment({ sourceText: 'Hello.', targetText: 'สวัสดี' })
    const result = checkEndPunctuation(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('minor')
    expect(result!.category).toBe('punctuation')
  })

  it('should skip when both end with alphanumeric', () => {
    const segment = buildSegment({ sourceText: 'Item 1', targetText: 'รายการ 1' })
    expect(checkEndPunctuation(segment, ctx)).toBeNull()
  })

  it('should treat 。as equivalent to .', () => {
    const segment = buildSegment({ sourceText: 'Hello.', targetText: 'こんにちは。' })
    expect(checkEndPunctuation(segment, ctx)).toBeNull()
  })

  it('should treat ！ as equivalent to !', () => {
    const segment = buildSegment({ sourceText: 'Hello!', targetText: 'こんにちは！' })
    expect(checkEndPunctuation(segment, ctx)).toBeNull()
  })

  it('should treat ？ as equivalent to ?', () => {
    const segment = buildSegment({ sourceText: 'Ready?', targetText: '準備？' })
    expect(checkEndPunctuation(segment, ctx)).toBeNull()
  })

  it('should flag when punctuation differs (. vs !)', () => {
    const segment = buildSegment({ sourceText: 'Hello.', targetText: 'สวัสดี!' })
    const result = checkEndPunctuation(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('.')
    expect(result!.description).toContain('!')
  })

  it('should return null for empty target', () => {
    const segment = buildSegment({ sourceText: 'Hello.', targetText: '' })
    expect(checkEndPunctuation(segment, ctx)).toBeNull()
  })
})
