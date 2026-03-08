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

describe('golden segmenter — ICU version drift detection (R-005)', () => {
  // These golden values are pinned to Node 20 full-ICU.
  // If word counts change, it means ICU was updated — review impact before updating golden values.

  const goldenCases: Array<{ locale: string; text: string; expectedWords: number; label: string }> =
    [
      { locale: 'th', text: 'สวัสดีครับ', expectedWords: 2, label: 'Thai greeting' },
      { locale: 'th', text: 'โรงพยาบาล', expectedWords: 2, label: 'Thai compound word' },
      {
        locale: 'th',
        text: 'ฉันชอบกินข้าวผัด',
        expectedWords: 5,
        label: 'Thai sentence',
      },
      {
        locale: 'th',
        text: 'คลิกที่นี่เพื่อดำเนินการต่อ',
        expectedWords: 7,
        label: 'Thai UI string',
      },
      { locale: 'ja', text: '東京タワー', expectedWords: 1, label: 'Japanese compound' },
      {
        locale: 'ja',
        text: 'これはテストです',
        expectedWords: 4,
        label: 'Japanese sentence',
      },
      { locale: 'zh', text: '你好世界', expectedWords: 2, label: 'Chinese hello world' },
      {
        locale: 'zh',
        text: '请点击此处继续',
        expectedWords: 6,
        label: 'Chinese UI string',
      },
      { locale: 'ko', text: '안녕하세요', expectedWords: 1, label: 'Korean greeting' },
      {
        locale: 'ko',
        text: '서울특별시',
        expectedWords: 1,
        label: 'Korean city name',
      },
    ]

  for (const { locale, text, expectedWords, label } of goldenCases) {
    it(`should segment "${label}" (${locale}) into ${expectedWords} words`, () => {
      const segmenter = getSegmenter(locale)
      const words = Array.from(segmenter.segment(text)).filter((s) => s.isWordLike)
      expect(words.length).toBe(expectedWords)
    })
  }
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

describe('isNoSpaceLanguage — extended locales (TA expansion)', () => {
  it('should return true for Myanmar (my)', () => {
    expect(isNoSpaceLanguage('my')).toBe(true)
  })

  it('should return true for Khmer (km)', () => {
    expect(isNoSpaceLanguage('km')).toBe(true)
  })
})
