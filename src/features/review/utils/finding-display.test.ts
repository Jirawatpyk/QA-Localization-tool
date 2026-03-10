/**
 * Tests — Story 4.1a CR R2: finding-display utility functions
 *
 * Covers all 5 exported pure functions with boundary + edge cases.
 */
import { describe, it, expect } from 'vitest'

import {
  L3_CONFIRMED_MARKER,
  L3_DISAGREES_MARKER,
  computeConfidenceMin,
  isCjkLang,
  isFallbackModel,
  stripL3Markers,
  truncate,
} from '@/features/review/utils/finding-display'

describe('stripL3Markers', () => {
  it('should strip L3 Confirmed marker', () => {
    expect(stripL3Markers(`Issue found ${L3_CONFIRMED_MARKER}`)).toBe('Issue found')
  })

  it('should strip L3 Disagrees marker', () => {
    expect(stripL3Markers(`Issue found ${L3_DISAGREES_MARKER}`)).toBe('Issue found')
  })

  it('should strip both markers when both present', () => {
    expect(stripL3Markers(`${L3_CONFIRMED_MARKER} Issue ${L3_DISAGREES_MARKER}`)).toBe('Issue')
  })

  it('should return original text when no markers present', () => {
    expect(stripL3Markers('Clean description')).toBe('Clean description')
  })

  it('should handle empty string', () => {
    expect(stripL3Markers('')).toBe('')
  })

  it('should handle marker-only string', () => {
    expect(stripL3Markers(L3_CONFIRMED_MARKER)).toBe('')
  })
})

describe('isCjkLang', () => {
  it('should return false for undefined', () => {
    expect(isCjkLang(undefined)).toBe(false)
  })

  it('should return false for empty string', () => {
    expect(isCjkLang('')).toBe(false)
  })

  it('should return true for short CJK codes', () => {
    expect(isCjkLang('ja')).toBe(true)
    expect(isCjkLang('zh')).toBe(true)
    expect(isCjkLang('ko')).toBe(true)
  })

  it('should return true for full BCP-47 CJK codes', () => {
    expect(isCjkLang('ja-JP')).toBe(true)
    expect(isCjkLang('zh-CN')).toBe(true)
    expect(isCjkLang('zh-TW')).toBe(true)
    expect(isCjkLang('ko-KR')).toBe(true)
  })

  it('should return true for CJK variant codes via startsWith', () => {
    expect(isCjkLang('zh-Hant-TW')).toBe(true)
    expect(isCjkLang('ja-Latn')).toBe(true)
    expect(isCjkLang('ko-Hang')).toBe(true)
  })

  it('should return false for non-CJK languages', () => {
    expect(isCjkLang('en')).toBe(false)
    expect(isCjkLang('en-US')).toBe(false)
    expect(isCjkLang('th')).toBe(false)
    expect(isCjkLang('th-TH')).toBe(false)
    expect(isCjkLang('de-DE')).toBe(false)
  })
})

describe('isFallbackModel', () => {
  it('should return false when aiModel is null', () => {
    expect(isFallbackModel(null, 'L2')).toBe(false)
  })

  it('should return false for L1 findings regardless of aiModel', () => {
    expect(isFallbackModel('gpt-3.5-turbo', 'L1')).toBe(false)
    expect(isFallbackModel('gpt-4o-mini', 'L1')).toBe(false)
  })

  it('should return false when aiModel matches L2 primary model', () => {
    expect(isFallbackModel('gpt-4o-mini', 'L2')).toBe(false)
  })

  it('should return true when aiModel differs from L2 primary model', () => {
    expect(isFallbackModel('gpt-3.5-turbo', 'L2')).toBe(true)
  })

  it('should return false when aiModel matches L3 primary model', () => {
    expect(isFallbackModel('claude-sonnet-4-5-20250929', 'L3')).toBe(false)
  })

  it('should return true when aiModel differs from L3 primary model', () => {
    expect(isFallbackModel('claude-haiku-4-5-20251001', 'L3')).toBe(true)
  })
})

describe('computeConfidenceMin', () => {
  it('should return l2ConfidenceMin for L2 layer', () => {
    expect(computeConfidenceMin('L2', 70, 85)).toBe(70)
  })

  it('should return l3ConfidenceMin for L3 layer', () => {
    expect(computeConfidenceMin('L3', 70, 85)).toBe(85)
  })

  it('should return l2ConfidenceMin for L1 layer (falls through to l2)', () => {
    expect(computeConfidenceMin('L1', 70, 85)).toBe(70)
  })

  it('should return null when value is null', () => {
    expect(computeConfidenceMin('L2', null, 85)).toBe(null)
    expect(computeConfidenceMin('L3', 70, null)).toBe(null)
  })

  it('should return null when value is undefined', () => {
    expect(computeConfidenceMin('L2', undefined, 85)).toBe(null)
    expect(computeConfidenceMin('L3', 70, undefined)).toBe(null)
  })

  it('should return 0 as valid threshold (not null)', () => {
    expect(computeConfidenceMin('L2', 0, 85)).toBe(0)
  })

  it('should return null for NaN', () => {
    expect(computeConfidenceMin('L2', NaN, 85)).toBe(null)
  })

  it('should return null for Infinity', () => {
    expect(computeConfidenceMin('L2', Infinity, 85)).toBe(null)
  })
})

describe('truncate', () => {
  it('should return original text when at maxLength', () => {
    expect(truncate('abcde', 5)).toBe('abcde')
  })

  it('should return original text when below maxLength', () => {
    expect(truncate('abc', 5)).toBe('abc')
  })

  it('should truncate with ellipsis when above maxLength', () => {
    expect(truncate('abcdef', 5)).toBe('abcde...')
  })

  it('should handle empty string', () => {
    expect(truncate('', 5)).toBe('')
  })

  it('should handle maxLength of 0', () => {
    expect(truncate('abc', 0)).toBe('...')
  })

  it('should handle single character at boundary', () => {
    expect(truncate('a', 1)).toBe('a')
    expect(truncate('ab', 1)).toBe('a...')
  })
})
