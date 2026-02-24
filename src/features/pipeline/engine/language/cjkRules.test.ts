import { describe, expect, it } from 'vitest'

import {
  applyCjkNfkcNormalization,
  isFullwidthEquivalent,
  normalizeFullwidthPunctuation,
} from './cjkRules'

describe('normalizeFullwidthPunctuation', () => {
  it('should map 。to .', () => {
    expect(normalizeFullwidthPunctuation('。')).toBe('.')
  })

  it('should map ！ to !', () => {
    expect(normalizeFullwidthPunctuation('！')).toBe('!')
  })

  it('should map ？ to ?', () => {
    expect(normalizeFullwidthPunctuation('？')).toBe('?')
  })

  it('should map ， to ,', () => {
    expect(normalizeFullwidthPunctuation('，')).toBe(',')
  })

  it('should return unchanged for non-mapped characters', () => {
    expect(normalizeFullwidthPunctuation('A')).toBe('A')
    expect(normalizeFullwidthPunctuation('.')).toBe('.')
  })
})

describe('isFullwidthEquivalent', () => {
  it('should return true for same character', () => {
    expect(isFullwidthEquivalent('.', '.')).toBe(true)
  })

  it('should return true for 。vs .', () => {
    expect(isFullwidthEquivalent('。', '.')).toBe(true)
    expect(isFullwidthEquivalent('.', '。')).toBe(true)
  })

  it('should return true for ！ vs !', () => {
    expect(isFullwidthEquivalent('！', '!')).toBe(true)
  })

  it('should return true for ？ vs ?', () => {
    expect(isFullwidthEquivalent('？', '?')).toBe(true)
  })

  it('should return false for different characters', () => {
    expect(isFullwidthEquivalent('.', '!')).toBe(false)
    expect(isFullwidthEquivalent('。', '!')).toBe(false)
  })
})

describe('applyCjkNfkcNormalization', () => {
  it('should normalize fullwidth Latin A to halfwidth', () => {
    expect(applyCjkNfkcNormalization('\uFF21')).toBe('A')
  })

  it('should normalize fullwidth digits', () => {
    expect(applyCjkNfkcNormalization('\uFF11\uFF12\uFF13')).toBe('123')
  })

  it('should leave CJK ideographs unchanged', () => {
    expect(applyCjkNfkcNormalization('你好世界')).toBe('你好世界')
  })

  it('should normalize halfwidth katakana to fullwidth', () => {
    // ｱ (U+FF71) normalizes to ア (U+30A2) under NFKC
    expect(applyCjkNfkcNormalization('\uFF71')).toBe('\u30A2')
  })

  it('should leave already normalized text unchanged', () => {
    expect(applyCjkNfkcNormalization('Hello World')).toBe('Hello World')
  })
})
