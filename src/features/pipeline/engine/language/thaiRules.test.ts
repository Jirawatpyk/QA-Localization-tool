import { describe, expect, it } from 'vitest'

import { isBuddhistYearEquivalent, normalizeThaiNumerals, stripThaiParticles } from './thaiRules'

describe('normalizeThaiNumerals', () => {
  it('should convert Thai ๐ to Arabic 0', () => {
    expect(normalizeThaiNumerals('๐')).toBe('0')
  })

  it('should convert Thai ๑ to Arabic 1', () => {
    expect(normalizeThaiNumerals('๑')).toBe('1')
  })

  it('should convert Thai ๒ to Arabic 2', () => {
    expect(normalizeThaiNumerals('๒')).toBe('2')
  })

  it('should convert Thai ๓ to Arabic 3', () => {
    expect(normalizeThaiNumerals('๓')).toBe('3')
  })

  it('should convert Thai ๔ to Arabic 4', () => {
    expect(normalizeThaiNumerals('๔')).toBe('4')
  })

  it('should convert Thai ๕ to Arabic 5', () => {
    expect(normalizeThaiNumerals('๕')).toBe('5')
  })

  it('should convert Thai ๖ to Arabic 6', () => {
    expect(normalizeThaiNumerals('๖')).toBe('6')
  })

  it('should convert Thai ๗ to Arabic 7', () => {
    expect(normalizeThaiNumerals('๗')).toBe('7')
  })

  it('should convert Thai ๘ to Arabic 8', () => {
    expect(normalizeThaiNumerals('๘')).toBe('8')
  })

  it('should convert Thai ๙ to Arabic 9', () => {
    expect(normalizeThaiNumerals('๙')).toBe('9')
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
