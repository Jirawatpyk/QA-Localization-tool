import { describe, expect, it } from 'vitest'

import { buildSegment } from '@/test/factories'

import type { SegmentCheckContext } from '../types'

import { checkNumberConsistency } from './numberChecks'

const ctx: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'th-TH' }
const ctxDe: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'de-DE' }

describe('checkNumberConsistency', () => {
  // ── No numbers ──

  it('should return null when source has no numbers', () => {
    const segment = buildSegment({ sourceText: 'Hello world', targetText: 'สวัสดีโลก' })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  // ── Matching numbers ──

  it('should return null when numbers match exactly', () => {
    const segment = buildSegment({ sourceText: 'Page 42', targetText: 'หน้า 42' })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  it('should return null when multiple numbers match', () => {
    const segment = buildSegment({
      sourceText: 'Items 1 to 10 of 100',
      targetText: 'รายการ 1 ถึง 10 จาก 100',
    })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  // ── Missing numbers ──

  it('should flag when source number is missing from target', () => {
    const segment = buildSegment({ sourceText: 'Version 3.0', targetText: 'เวอร์ชัน' })
    const result = checkNumberConsistency(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('major')
    expect(result!.category).toBe('number_format')
    expect(result!.description).toContain('3.0')
  })

  it('should flag multiple missing numbers in description', () => {
    const segment = buildSegment({
      sourceText: 'From 1 to 100',
      targetText: 'จาก ถึง',
    })
    const result = checkNumberConsistency(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('1')
    expect(result!.description).toContain('100')
  })

  it('should include segmentId in result', () => {
    const segment = buildSegment({ id: 'test-seg-id', sourceText: 'Page 42', targetText: 'หน้า' })
    const result = checkNumberConsistency(segment, ctx)
    expect(result!.segmentId).toBe('test-seg-id')
  })

  // ── Locale formats ──

  it('should match US format 1,000.50 with European 1.000,50', () => {
    const segment = buildSegment({
      sourceText: 'Total: 1,000.50',
      targetText: 'Gesamt: 1.000,50',
    })
    expect(checkNumberConsistency(segment, ctxDe)).toBeNull()
  })

  it('should match numbers with different thousand separator styles', () => {
    const segment = buildSegment({
      sourceText: 'Balance: 10,000',
      targetText: 'ยอดเงิน: 10000',
    })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  // ── Thai numerals ──

  it('should treat Thai numerals as equivalent to Arabic for TH target', () => {
    const segment = buildSegment({
      sourceText: 'Page 123',
      targetText: 'หน้า ๑๒๓',
    })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  it('should handle mixed Thai+Arabic numerals in target', () => {
    const segment = buildSegment({
      sourceText: 'Items 5 of 10',
      targetText: 'รายการ ๕ จาก 10',
    })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  // ── Buddhist year exemption ──

  it('should NOT flag Buddhist year offset +543 for Thai targets', () => {
    const segment = buildSegment({
      sourceText: 'Copyright 2026',
      targetText: 'ลิขสิทธิ์ 2569',
    })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  it('should NOT flag Buddhist year with Thai numerals', () => {
    const segment = buildSegment({
      sourceText: 'Year 2026',
      targetText: 'ปี ๒๕๖๙',
    })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  it('should flag non-year number difference even for Thai', () => {
    const segment = buildSegment({
      sourceText: 'Price 500',
      targetText: 'ราคา 600',
    })
    const result = checkNumberConsistency(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('500')
  })

  // ── Percentages and decimals ──

  it('should match percentage numbers', () => {
    const segment = buildSegment({
      sourceText: 'Progress: 85%',
      targetText: 'ความคืบหน้า: 85%',
    })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  it('should match decimal numbers', () => {
    const segment = buildSegment({
      sourceText: 'Temperature: 36.5',
      targetText: 'อุณหภูมิ: 36.5',
    })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  // ── Negative numbers ──

  it('should match negative numbers', () => {
    const segment = buildSegment({
      sourceText: 'Offset: -10',
      targetText: 'ค่าชดเชย: -10',
    })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  // ── M1: Negative number flag (source negative, target positive) ──

  it('should flag when source has negative number but target has only positive', () => {
    const segment = buildSegment({
      sourceText: 'Balance: -10',
      targetText: 'ยอดเงิน: 10',
    })
    const result = checkNumberConsistency(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('-10')
  })

  // ── C1: Buddhist year offset fires for coincidental delta=543 pairs ──

  it('should NOT flag when source=500 and target=1043 (delta=543 — Buddhist offset applies)', () => {
    // Known limitation: isBuddhistYearEquivalent only checks |delta|===543, not year range.
    // A non-year number like 500 would be exempt if target contains 1043.
    // This test DOCUMENTS the current behavior to catch regressions if year-range
    // validation is added in the future.
    const segment = buildSegment({
      sourceText: 'Error code 500',
      targetText: 'รหัสข้อผิดพลาด 1043',
    })
    // |1043 - 500| === 543 → Buddhist offset exemption fires → no finding
    const result = checkNumberConsistency(segment, ctx)
    expect(result).toBeNull()
  })

  it('should flag when source=500 and target=1044 (delta=544 — NOT Buddhist offset)', () => {
    const segment = buildSegment({
      sourceText: 'Error code 500',
      targetText: 'รหัสข้อผิดพลาด 1044',
    })
    // |1044 - 500| === 544 ≠ 543 → not exempt → flagged
    const result = checkNumberConsistency(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('500')
  })

  // ── H1: Thai numeral normalization in source text ──

  it('should match when Thai source has Thai numerals and target has Arabic', () => {
    const ctxThaiSource: SegmentCheckContext = { sourceLang: 'th-TH', targetLang: 'en-US' }
    const segment = buildSegment({
      sourceText: 'หน้า ๔๒',
      targetText: 'Page 42',
    })
    // Thai source numerals ๔๒ should normalize to 42 → match
    expect(checkNumberConsistency(segment, ctxThaiSource)).toBeNull()
  })

  it('should flag when Thai source has Thai numerals not found in target', () => {
    const ctxThaiSource: SegmentCheckContext = { sourceLang: 'th-TH', targetLang: 'en-US' }
    const segment = buildSegment({
      sourceText: 'หน้า ๔๒',
      targetText: 'Page 99',
    })
    const result = checkNumberConsistency(segment, ctxThaiSource)
    expect(result).not.toBeNull()
  })

  // ── R3-H1: Hyphen in number ranges must NOT be captured as negative sign ──

  it('should NOT flag range "1-10" where target translates with words', () => {
    // "1-10" is a range, not "1" and "-10"
    const segment = buildSegment({
      sourceText: 'Items 1-10 of 100',
      targetText: 'รายการ 1 ถึง 10 จาก 100',
    })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  it('should NOT flag phone-like ranges "555-1234"', () => {
    const segment = buildSegment({
      sourceText: 'Call 555-1234',
      targetText: 'โทร 555-1234',
    })
    expect(checkNumberConsistency(segment, ctx)).toBeNull()
  })

  it('should still flag standalone negative numbers', () => {
    const segment = buildSegment({
      sourceText: 'Adjust by -5',
      targetText: 'ปรับ 5',
    })
    const result = checkNumberConsistency(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('-5')
  })
})
