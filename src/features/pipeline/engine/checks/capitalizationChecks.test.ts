import { describe, expect, it } from 'vitest'

import { buildSegment } from '@/test/factories'

import type { SegmentCheckContext } from '../types'

import { checkCamelCaseWords, checkUppercaseWords } from './capitalizationChecks'

const ctx: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'th-TH' }

// ═══════════════════════════════════════════════
// UPPERCASE Words (9 tests)
// ═══════════════════════════════════════════════

describe('checkUppercaseWords', () => {
  it('should return empty when no uppercase words in source', () => {
    const segment = buildSegment({ sourceText: 'Hello world', targetText: 'สวัสดีโลก' })
    expect(checkUppercaseWords(segment, ctx)).toEqual([])
  })

  it('should return empty when uppercase word is found in target', () => {
    const segment = buildSegment({
      sourceText: 'Use the API endpoint',
      targetText: 'ใช้งาน API ได้',
    })
    expect(checkUppercaseWords(segment, ctx)).toEqual([])
  })

  it('should flag when uppercase word is missing from target', () => {
    const segment = buildSegment({
      sourceText: 'Check the API key',
      targetText: 'ตรวจสอบคีย์ api',
    })
    const results = checkUppercaseWords(segment, ctx)
    expect(results).toHaveLength(1)
    expect(results[0]!.severity).toBe('minor')
    expect(results[0]!.category).toBe('capitalization')
    expect(results[0]!.description).toContain('API')
  })

  it('should flag multiple missing uppercase words', () => {
    const segment = buildSegment({
      sourceText: 'The HTTP API uses JSON',
      targetText: 'ใช้งาน http api แบบ json',
    })
    const results = checkUppercaseWords(segment, ctx)
    expect(results).toHaveLength(3) // HTTP, API, JSON
  })

  it('should skip when CJK target has zero Latin characters', () => {
    const segment = buildSegment({
      sourceText: 'The API is ready',
      targetText: 'เอพีไอพร้อมแล้ว',
    })
    expect(checkUppercaseWords(segment, ctx)).toEqual([])
  })

  it('should check when Thai target contains Latin characters', () => {
    const segment = buildSegment({
      sourceText: 'Use the API',
      targetText: 'ใช้งาน api ได้',
    })
    const results = checkUppercaseWords(segment, ctx)
    expect(results).toHaveLength(1) // "API" not found (target has "api" lowercase)
  })

  it('should ignore single uppercase letter (requires 2+)', () => {
    const segment = buildSegment({
      sourceText: 'Press A to continue',
      targetText: 'กด a เพื่อดำเนินการ',
    })
    expect(checkUppercaseWords(segment, ctx)).toEqual([])
  })

  it('should detect uppercase words at word boundaries', () => {
    const segment = buildSegment({
      sourceText: 'Enable SSL encryption',
      targetText: 'เปิดใช้ SSL encryption',
    })
    expect(checkUppercaseWords(segment, ctx)).toEqual([])
  })

  it('should include segmentId in result', () => {
    const segment = buildSegment({
      id: 'test-id',
      sourceText: 'Use API',
      targetText: 'ใช้ api',
    })
    const results = checkUppercaseWords(segment, ctx)
    expect(results[0]!.segmentId).toBe('test-id')
  })

  // ── R3-M2: Substring match known limitation — "APIFY" suppresses "API" finding ──

  it('should NOT flag "API" when target contains "APIFY" (known substring limitation)', () => {
    // includes("API") finds "API" within "APIFY" → no finding
    // This is by design: word-boundary matching doesn't work for CJK/Thai scripts
    const segment = buildSegment({
      sourceText: 'Use the API',
      targetText: 'ใช้ APIFY ได้',
    })
    expect(checkUppercaseWords(segment, ctx)).toEqual([])
  })
})

// ═══════════════════════════════════════════════
// CamelCase Words (6 tests)
// ═══════════════════════════════════════════════

describe('checkCamelCaseWords', () => {
  it('should return empty when no camelcase words in source', () => {
    const segment = buildSegment({ sourceText: 'Hello world', targetText: 'สวัสดีโลก' })
    expect(checkCamelCaseWords(segment, ctx)).toEqual([])
  })

  it('should return empty when camelcase word is found in target', () => {
    const segment = buildSegment({
      sourceText: 'Use the JavaScript library',
      targetText: 'ใช้ไลบรารี JavaScript ได้',
    })
    expect(checkCamelCaseWords(segment, ctx)).toEqual([])
  })

  it('should flag when camelcase word is missing from target', () => {
    const segment = buildSegment({
      sourceText: 'Configure TypeScript settings',
      targetText: 'กำหนดค่า typescript',
    })
    const results = checkCamelCaseWords(segment, ctx)
    expect(results).toHaveLength(1)
    expect(results[0]!.description).toContain('TypeScript')
  })

  it('should skip when target has zero Latin characters', () => {
    const segment = buildSegment({
      sourceText: 'Use TypeScript',
      targetText: 'ใช้ไทป์สคริปท์',
    })
    expect(checkCamelCaseWords(segment, ctx)).toEqual([])
  })

  it('should detect multiple camelcase words', () => {
    const segment = buildSegment({
      sourceText: 'Use TypeScript and JavaScript',
      targetText: 'ใช้ typescript และ javascript',
    })
    const results = checkCamelCaseWords(segment, ctx)
    expect(results).toHaveLength(2)
  })

  it('should handle compound camelcase like IntelliSense', () => {
    const segment = buildSegment({
      sourceText: 'Enable IntelliSense',
      targetText: 'เปิดใช้ IntelliSense',
    })
    expect(checkCamelCaseWords(segment, ctx)).toEqual([])
  })

  // ── M6: lowercase-first product names (iPhone, iPad, macOS) — by design NOT flagged ──

  it('should NOT flag iPhone-style lowercase-first names (CAMELCASE_REGEX requires uppercase first)', () => {
    // CAMELCASE_REGEX = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g
    // "iPhone" starts with lowercase "i" → regex does not match → no finding
    const segment = buildSegment({
      sourceText: 'Use iPhone or iPad',
      targetText: 'ใช้ iphone หรือ ipad',
    })
    // Neither "iPhone" nor "iPad" start with uppercase → not detected by CAMELCASE_REGEX
    expect(checkCamelCaseWords(segment, ctx)).toEqual([])
  })

  it('should NOT flag macOS or iOS names (lowercase-first)', () => {
    const segment = buildSegment({
      sourceText: 'Compatible with macOS and iOS',
      targetText: 'ใช้ได้กับ macos และ ios',
    })
    // macOS → starts with 'm' (lowercase), iOS → starts with 'i' (lowercase)
    // CAMELCASE_REGEX requires uppercase first char → no matches → no findings
    expect(checkCamelCaseWords(segment, ctx)).toEqual([])
  })
})
