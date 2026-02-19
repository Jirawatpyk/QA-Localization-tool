// 🔴 TDD RED PHASE — tests will fail until segmenterCache.ts is implemented
// Story 1.5: Glossary Matching Engine for No-space Languages

import { beforeEach, describe, expect, it } from 'vitest'

import { clearSegmenterCache, getSegmenter, isNoSpaceLanguage } from './segmenterCache'

describe('getSegmenter', () => {
  beforeEach(() => {
    clearSegmenterCache()
  })

  it('should return Intl.Segmenter instance for Thai locale', () => {
    const segmenter = getSegmenter('th')
    expect(segmenter).toBeInstanceOf(Intl.Segmenter)
  })

  it('should return same cached instance on second call', () => {
    const first = getSegmenter('th')
    const second = getSegmenter('th')
    expect(first).toBe(second)
  })

  it('should return different instances for different locales', () => {
    const th = getSegmenter('th')
    const ja = getSegmenter('ja')
    expect(th).not.toBe(ja)
  })

  it('should create fresh instance after clearSegmenterCache', () => {
    const before = getSegmenter('th')
    clearSegmenterCache()
    const after = getSegmenter('th')
    expect(before).not.toBe(after)
  })

  it('should segmenter produce word-level segments for Thai text', () => {
    const segmenter = getSegmenter('th')
    const segments = Array.from(segmenter.segment('โรงพยาบาล'))
    expect(segments.length).toBeGreaterThan(0)
  })
})

describe('isNoSpaceLanguage', () => {
  it('should return true for Thai (th)', () => {
    expect(isNoSpaceLanguage('th')).toBe(true)
  })

  it('should return true for Japanese (ja)', () => {
    expect(isNoSpaceLanguage('ja')).toBe(true)
  })

  it('should return true for Chinese (zh)', () => {
    expect(isNoSpaceLanguage('zh')).toBe(true)
  })

  it('should return true for Korean (ko)', () => {
    expect(isNoSpaceLanguage('ko')).toBe(true)
  })

  it('should return true for zh-Hans BCP-47 subtag (primary subtag match)', () => {
    expect(isNoSpaceLanguage('zh-Hans')).toBe(true)
  })

  it('should return true for zh-TW BCP-47 subtag', () => {
    expect(isNoSpaceLanguage('zh-TW')).toBe(true)
  })

  it('should return false for English (en)', () => {
    expect(isNoSpaceLanguage('en')).toBe(false)
  })

  it('should return false for French (fr)', () => {
    expect(isNoSpaceLanguage('fr')).toBe(false)
  })

  it('should return false for German (de)', () => {
    expect(isNoSpaceLanguage('de')).toBe(false)
  })

  it('should be case-insensitive — TH → true', () => {
    expect(isNoSpaceLanguage('TH')).toBe(true)
  })
})
