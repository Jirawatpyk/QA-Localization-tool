import { describe, expect, it } from 'vitest'

import { isBuddhistYearEquivalent, normalizeThaiNumerals, stripThaiParticles } from './thaiRules'

describe('normalizeThaiNumerals', () => {
  it.each([
    ['๐', '0'],
    ['๑', '1'],
    ['๒', '2'],
    ['๓', '3'],
    ['๔', '4'],
    ['๕', '5'],
    ['๖', '6'],
    ['๗', '7'],
    ['๘', '8'],
    ['๙', '9'],
  ])('should convert Thai %s to Arabic %s', (thai, arabic) => {
    expect(normalizeThaiNumerals(thai)).toBe(arabic)
  })

  it('should convert mixed text with Thai numerals', () => {
    expect(normalizeThaiNumerals('ปี ๒๕๖๙')).toBe('ปี 2569')
  })

  it('should leave Arabic numerals unchanged', () => {
    expect(normalizeThaiNumerals('2026')).toBe('2026')
  })

  it('should leave text without numerals unchanged', () => {
    expect(normalizeThaiNumerals('สวัสดี')).toBe('สวัสดี')
  })
})

describe('stripThaiParticles', () => {
  it('should strip trailing ครับ', () => {
    expect(stripThaiParticles('ขอบคุณครับ')).toBe('ขอบคุณ')
  })

  it('should strip trailing ค่ะ', () => {
    expect(stripThaiParticles('ขอบคุณค่ะ')).toBe('ขอบคุณ')
  })

  it('should strip compound particle นะครับ (two passes)', () => {
    expect(stripThaiParticles('ขอบคุณนะครับ')).toBe('ขอบคุณ')
  })

  it('should strip trailing นะ', () => {
    expect(stripThaiParticles('ไปนะ')).toBe('ไป')
  })

  it('should strip trailing ไหม', () => {
    expect(stripThaiParticles('ดีไหม')).toBe('ดี')
  })

  it('should strip trailing เถอะ', () => {
    expect(stripThaiParticles('ไปเถอะ')).toBe('ไป')
  })

  it('should strip trailing จ้า', () => {
    expect(stripThaiParticles('สวัสดีจ้า')).toBe('สวัสดี')
  })

  it('should strip trailing ค่า', () => {
    expect(stripThaiParticles('สวัสดีค่า')).toBe('สวัสดี')
  })

  it('should strip trailing ครับผม', () => {
    expect(stripThaiParticles('ขอบคุณครับผม')).toBe('ขอบคุณ')
  })

  it('should NOT strip particle in the middle of text', () => {
    // "ครับ" appears in the middle, not at end
    expect(stripThaiParticles('ครับท่าน')).toBe('ครับท่าน')
  })

  it('should return empty string when text is just a particle', () => {
    expect(stripThaiParticles('ครับ')).toBe('')
  })

  it('should leave non-Thai text unchanged', () => {
    expect(stripThaiParticles('Hello World')).toBe('Hello World')
  })

  // ── M8: whitespace between text and particle (trimEnd behavior) ──

  it('should strip particle preceded by a space', () => {
    // "ขอบคุณ ครับ" — space before ครับ
    // slice(-3) removes "ครับ" → "ขอบคุณ " → trimEnd() → "ขอบคุณ"
    expect(stripThaiParticles('ขอบคุณ ครับ')).toBe('ขอบคุณ')
  })

  it('should strip compound particles separated by whitespace', () => {
    // "ขอบคุณ นะ ครับ"
    // Pass 1: ends with "ครับ" → strip → "ขอบคุณ นะ " → trimEnd → "ขอบคุณ นะ"
    // Pass 2: ends with "นะ" → strip → "ขอบคุณ " → trimEnd → "ขอบคุณ"
    expect(stripThaiParticles('ขอบคุณ นะ ครับ')).toBe('ขอบคุณ')
  })
})

describe('isBuddhistYearEquivalent', () => {
  it('should return true for EN→TH year (+543)', () => {
    expect(isBuddhistYearEquivalent(2026, 2569)).toBe(true)
  })

  it('should return true for TH→EN year (-543)', () => {
    expect(isBuddhistYearEquivalent(2569, 2026)).toBe(true)
  })

  it('should return false for non-year numbers', () => {
    expect(isBuddhistYearEquivalent(100, 200)).toBe(false)
  })

  it('should return false for same number', () => {
    expect(isBuddhistYearEquivalent(2026, 2026)).toBe(false)
  })

  it('should return true for historical years', () => {
    expect(isBuddhistYearEquivalent(1990, 2533)).toBe(true)
  })
})
