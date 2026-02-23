import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

import { countWords } from './wordCounter'

type CorpusEntry = { text: string; expected_tokens: number }
type CorpusFile = { locale: string; segments: CorpusEntry[] }

function loadCorpus(language: string): CorpusFile {
  const corpusPath = join(process.cwd(), 'docs', 'test-data', 'segmenter', `${language}.json`)
  return JSON.parse(readFileSync(corpusPath, 'utf-8')) as CorpusFile
}

describe('countWords', () => {
  describe('English (space-separated)', () => {
    it('should match corpus expected_tokens exactly (±0%)', () => {
      const corpus = loadCorpus('english')
      for (const { text, expected_tokens } of corpus.segments) {
        expect(countWords(text, corpus.locale), `"${text}" → expected ${expected_tokens}`).toBe(
          expected_tokens,
        )
      }
    })
  })

  describe('Thai (Intl.Segmenter)', () => {
    it('should match corpus expected_tokens exactly (±0%)', () => {
      const corpus = loadCorpus('thai')
      for (const { text, expected_tokens } of corpus.segments) {
        expect(countWords(text, corpus.locale), `"${text}" → expected ${expected_tokens}`).toBe(
          expected_tokens,
        )
      }
    })
  })

  describe('Japanese (Intl.Segmenter)', () => {
    it('should match corpus expected_tokens exactly (±0%)', () => {
      const corpus = loadCorpus('japanese')
      for (const { text, expected_tokens } of corpus.segments) {
        expect(countWords(text, corpus.locale), `"${text}" → expected ${expected_tokens}`).toBe(
          expected_tokens,
        )
      }
    })
  })

  describe('Chinese (Intl.Segmenter)', () => {
    it('should match corpus expected_tokens exactly (±0%)', () => {
      const corpus = loadCorpus('chinese')
      for (const { text, expected_tokens } of corpus.segments) {
        expect(countWords(text, corpus.locale), `"${text}" → expected ${expected_tokens}`).toBe(
          expected_tokens,
        )
      }
    })
  })

  describe('Korean (Intl.Segmenter)', () => {
    it('should match corpus expected_tokens exactly (±0%)', () => {
      const corpus = loadCorpus('korean')
      for (const { text, expected_tokens } of corpus.segments) {
        expect(countWords(text, corpus.locale), `"${text}" → expected ${expected_tokens}`).toBe(
          expected_tokens,
        )
      }
    })
  })

  describe('edge cases', () => {
    it('should return 0 for empty string', () => {
      expect(countWords('', 'en-US')).toBe(0)
    })

    it('should return 0 for whitespace-only string', () => {
      expect(countWords('   ', 'en-US')).toBe(0)
    })

    it('should return 0 for tag-only string (English)', () => {
      expect(countWords('<g id="1"></g>', 'en-US')).toBe(0)
    })

    it('should return 0 for tag-only string (Thai)', () => {
      expect(countWords('<x id="1"/>', 'th-TH')).toBe(0)
    })

    it('should strip inline markup before counting (English)', () => {
      // "<g id='1'>Hello</g> world" → "Hello world" → 2 words
      expect(countWords("<g id='1'>Hello</g> world", 'en-US')).toBe(2)
    })

    it('should strip placeholders before counting', () => {
      // "Item {0} is ready" → 3 words (Item, is, ready)
      expect(countWords('Item {0} is ready', 'en-US')).toBe(3)
    })

    it('should handle mixed Thai and inline tags', () => {
      // Thai text with inline tag — strip tag, count Thai words
      // "สวัสดี" (1 word) + "ครับ" (1 word) = 2
      expect(countWords('<g id="1">สวัสดี</g>ครับ', 'th-TH')).toBe(2)
    })

    it('should handle very short single-word English', () => {
      expect(countWords('Yes', 'en-US')).toBe(1)
    })

    it('should handle locale with region code for no-space language', () => {
      // zh-TW uses same isWordLike segmenter as zh-CN
      const result = countWords('你好世界', 'zh-TW')
      expect(result).toBeGreaterThan(0)
    })

    it('should return 0 for placeholder-only text after markup stripping', () => {
      // stripMarkup replaces {0}, {name}, %s with spaces → stripped = whitespace → 0 words
      expect(countWords('{0}', 'en-US')).toBe(0)
      expect(countWords('{username}', 'th-TH')).toBe(0)
      expect(countWords('%s %d', 'en-US')).toBe(0)
    })

    it('should count Arabic numerals as tokens in CJK/Thai context', () => {
      // Intl.Segmenter marks numbers as isWordLike
      expect(countWords('100', 'th-TH')).toBeGreaterThan(0)
      expect(countWords('12345', 'zh-CN')).toBeGreaterThan(0)
    })
  })

  describe('long text > 30,000 chars (chunking path)', () => {
    it('should count Thai words correctly when text spans multiple chunks', () => {
      // "บันทึก" = 6 chars, 1 token per corpus
      // 30,000 / 6 = 5,000 exactly → 5,001 repetitions crosses chunk boundary
      const unit = 'บันทึก'
      const repetitions = 5_001
      const longText = unit.repeat(repetitions)
      const perUnit = countWords(unit, 'th-TH')
      expect(countWords(longText, 'th-TH')).toBe(perUnit * repetitions)
    })

    it('should count Thai words correctly when chunk boundary falls mid-word', () => {
      // "ยกเลิก" = 6 chars but offset 1 from "บันทึก" boundary so boundaries differ
      // Build text that guarantees non-aligned boundary: mix two words
      // "สวัสดีครับ" = 10 chars, 2 tokens; repeat 3,001 = 30,010 chars → 2 chunks
      const unit = 'สวัสดีครับ'
      const repetitions = 3_001
      const longText = unit.repeat(repetitions)
      const perUnit = countWords(unit, 'th-TH') // = 2
      expect(countWords(longText, 'th-TH')).toBe(perUnit * repetitions)
    })

    it('should count Japanese words correctly across chunk boundaries', () => {
      // "テスト" = 3 chars, 1 token per corpus
      // 30,000 / 3 = 10,000 exactly → 10,001 repetitions crosses boundary
      const unit = 'テスト'
      const repetitions = 10_001
      const longText = unit.repeat(repetitions)
      const perUnit = countWords(unit, 'ja-JP')
      expect(countWords(longText, 'ja-JP')).toBe(perUnit * repetitions)
    })

    it('should produce same per-unit count regardless of text length', () => {
      // Verify chunking is additive: count(A+A) == count(A) * 2
      const unit = 'การแปลภาษา'
      const shortCount = countWords(unit, 'th-TH')
      const doubledCount = countWords(unit.repeat(2), 'th-TH')
      const longCount = countWords(unit.repeat(6_000), 'th-TH') // > 30k chars
      expect(doubledCount).toBe(shortCount * 2)
      expect(longCount).toBe(shortCount * 6_000)
    })
  })
})
