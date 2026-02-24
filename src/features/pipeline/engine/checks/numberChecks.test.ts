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
})
