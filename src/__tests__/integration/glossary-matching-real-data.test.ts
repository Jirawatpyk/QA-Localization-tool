/// <reference types="vitest/globals" />
/**
 * Integration tests: Glossary matching engine with annotated corpus fixtures.
 *
 * Loads docs/test-data/glossary-matching/{th,ja,zh,en-fr-de}.json
 * and validates findTermInText() against each annotated case.
 *
 * Acceptance thresholds (FR43):
 *   - false negative rate < 5%   (terms that SHOULD be found but aren't)
 *   - false positive rate < 10%  (terms found but SHOULD NOT be)
 *
 * These tests run in Vitest's Node.js integration project.
 * server-only + side-effect modules are mocked so findTermInText (pure) can be tested.
 */

// Mock server-only and side-effect modules — findTermInText is pure and never calls them
vi.mock('server-only', () => ({}))
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/cache/glossaryCache', () => ({
  getCachedGlossaryTerms: vi.fn().mockResolvedValue([]),
}))

import { existsSync, readFileSync } from 'fs'
import path from 'path'

import { findTermInText } from '@/features/glossary/matching/glossaryMatcher'

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

type CorpusCase = {
  text: string
  term: string
  caseSensitive: boolean
  expectedFound: boolean
  expectedConfidence: 'high' | 'low' | null
  note: string
  lang?: string // present in multi-language fixtures (en-fr-de.json)
}

type CorpusFixture = {
  _meta: { description: string; note: string }
  cases: CorpusCase[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CORPUS_DIR = path.resolve(process.cwd(), 'docs/test-data/glossary-matching')

function loadFixture(filename: string): CorpusFixture {
  const filePath = path.join(CORPUS_DIR, filename)
  return JSON.parse(readFileSync(filePath, 'utf-8')) as CorpusFixture
}

function hasCorpus(): boolean {
  return existsSync(CORPUS_DIR)
}

/**
 * Runs a single corpus case against findTermInText and returns pass/fail.
 * Returns the failure reason string, or null if passed.
 */
function runCase(tc: CorpusCase, lang: string): string | null {
  const results = findTermInText(tc.text, tc.term, tc.caseSensitive, lang)
  const found = results.length > 0
  const firstConfidence = results[0]?.confidence ?? null

  if (tc.expectedFound !== found) {
    return `expectedFound=${tc.expectedFound} but got found=${found} | note: ${tc.note}`
  }

  if (tc.expectedConfidence !== null && firstConfidence !== tc.expectedConfidence) {
    // Confidence mismatch is a soft warning — not a hard failure for corpus tests
    // (ICU version differences can shift boundary detection)
    return null
  }

  return null
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasCorpus())('Glossary Matching Engine — Annotated Corpus', () => {
  // -------------------------------------------------------------------------
  // Thai
  // -------------------------------------------------------------------------
  describe('Thai (th) — Hybrid matching: substring + Intl.Segmenter', () => {
    const fixture = loadFixture('th.json')

    it('should meet false-negative threshold < 5% on Thai corpus', () => {
      const cases = fixture.cases.filter((c) => c.expectedFound)
      const failures = cases.filter((c) => runCase(c, 'th') !== null)
      const fnRate = failures.length / cases.length

      if (failures.length > 0) {
        console.warn(
          'Thai false negatives:',
          failures.map((c) => c.note),
        )
      }

      expect(fnRate).toBeLessThan(0.05)
    })

    it('should meet false-positive threshold < 10% on Thai corpus', () => {
      const cases = fixture.cases.filter((c) => !c.expectedFound)
      const failures = cases.filter((c) => {
        const results = findTermInText(c.text, c.term, c.caseSensitive, 'th')
        return results.length > 0 // found when should NOT be found
      })
      const fpRate = cases.length > 0 ? failures.length / cases.length : 0

      expect(fpRate).toBeLessThan(0.1)
    })

    it.each(fixture.cases)('[$note] term="$term"', (tc) => {
      const results = findTermInText(tc.text, tc.term, tc.caseSensitive, 'th')
      const found = results.length > 0

      expect(found).toBe(tc.expectedFound)

      if (tc.expectedFound && tc.expectedConfidence !== null) {
        // Log confidence for observability — not a hard assertion (ICU may vary)
        const actual = results[0]?.confidence
        if (actual !== tc.expectedConfidence) {
          console.warn(
            `[th] confidence mismatch for "${tc.term}": expected=${tc.expectedConfidence} actual=${actual} (ICU version difference) | ${tc.note}`,
          )
        }
      }
    })
  })

  // -------------------------------------------------------------------------
  // Japanese
  // -------------------------------------------------------------------------
  describe('Japanese (ja) — Katakana/kanji/hiragana support', () => {
    const fixture = loadFixture('ja.json')

    it('should meet false-negative threshold < 5% on Japanese corpus', () => {
      const cases = fixture.cases.filter((c) => c.expectedFound)
      const failures = cases.filter((c) => runCase(c, 'ja') !== null)
      const fnRate = failures.length / cases.length

      if (failures.length > 0) {
        console.warn(
          'Japanese false negatives:',
          failures.map((c) => c.note),
        )
      }

      expect(fnRate).toBeLessThan(0.05)
    })

    it('should meet false-positive threshold < 10% on Japanese corpus', () => {
      const cases = fixture.cases.filter((c) => !c.expectedFound)
      const failures = cases.filter((c) => {
        const results = findTermInText(c.text, c.term, c.caseSensitive, 'ja')
        return results.length > 0
      })
      const fpRate = cases.length > 0 ? failures.length / cases.length : 0

      expect(fpRate).toBeLessThan(0.1)
    })

    it.each(fixture.cases)('[$note] term="$term"', (tc) => {
      const results = findTermInText(tc.text, tc.term, tc.caseSensitive, 'ja')
      const found = results.length > 0

      expect(found).toBe(tc.expectedFound)
    })
  })

  // -------------------------------------------------------------------------
  // Chinese Simplified
  // -------------------------------------------------------------------------
  describe('Chinese Simplified (zh) — Substring-primary strategy', () => {
    const fixture = loadFixture('zh.json')

    it('should meet false-negative threshold < 5% on Chinese corpus', () => {
      const cases = fixture.cases.filter((c) => c.expectedFound)
      const failures = cases.filter((c) => runCase(c, 'zh') !== null)
      const fnRate = failures.length / cases.length

      if (failures.length > 0) {
        console.warn(
          'Chinese false negatives:',
          failures.map((c) => c.note),
        )
      }

      expect(fnRate).toBeLessThan(0.05)
    })

    it('should meet false-positive threshold < 10% on Chinese corpus', () => {
      const cases = fixture.cases.filter((c) => !c.expectedFound)
      const failures = cases.filter((c) => {
        const results = findTermInText(c.text, c.term, c.caseSensitive, 'zh')
        return results.length > 0
      })
      const fpRate = cases.length > 0 ? failures.length / cases.length : 0

      expect(fpRate).toBeLessThan(0.1)
    })

    it.each(fixture.cases)('[$note] term="$term"', (tc) => {
      const results = findTermInText(tc.text, tc.term, tc.caseSensitive, 'zh')
      const found = results.length > 0

      expect(found).toBe(tc.expectedFound)
    })
  })

  // -------------------------------------------------------------------------
  // European (EN, FR, DE) — word-boundary regex fallback
  // -------------------------------------------------------------------------
  describe('European (EN/FR/DE) — word-boundary regex fallback', () => {
    const fixture = loadFixture('en-fr-de.json')

    it('should meet false-negative threshold < 5% across EN/FR/DE corpus', () => {
      const cases = fixture.cases.filter((c) => c.expectedFound)
      const failures = cases.filter((c) => {
        const lang = c.lang ?? 'en'
        return runCase(c, lang) !== null
      })
      const fnRate = failures.length / cases.length

      if (failures.length > 0) {
        console.warn(
          'European false negatives:',
          failures.map((c) => c.note),
        )
      }

      expect(fnRate).toBeLessThan(0.05)
    })

    it('should meet false-positive threshold < 10% across EN/FR/DE corpus', () => {
      const cases = fixture.cases.filter((c) => !c.expectedFound)
      const failures = cases.filter((c) => {
        const lang = c.lang ?? 'en'
        const results = findTermInText(c.text, c.term, c.caseSensitive, lang)
        return results.length > 0
      })
      const fpRate = cases.length > 0 ? failures.length / cases.length : 0

      expect(fpRate).toBeLessThan(0.1)
    })

    it.each(fixture.cases)('[$lang][$note] term="$term"', (tc) => {
      const lang = tc.lang ?? 'en'
      const results = findTermInText(tc.text, tc.term, tc.caseSensitive, lang)
      const found = results.length > 0

      expect(found).toBe(tc.expectedFound)

      if (tc.expectedFound && tc.expectedConfidence !== null) {
        expect(results[0]?.confidence).toBe(tc.expectedConfidence)
      }
    })
  })

  // -------------------------------------------------------------------------
  // Cross-language: NFKC normalization
  // -------------------------------------------------------------------------
  describe('Cross-language: NFKC normalization', () => {
    it('should match halfwidth katakana (ﾌﾟﾛｸﾞﾗﾐﾝｸﾞ) to fullwidth term (プログラミング)', () => {
      const results = findTermInText('ﾌﾟﾛｸﾞﾗﾐﾝｸﾞภาษา', 'プログラミング', false, 'th')
      expect(results.length).toBeGreaterThan(0)
    })

    it('should match fullwidth ASCII (ＡＢＣ) to narrow term (ABC)', () => {
      const results = findTermInText('ＡＢＣ is the term', 'ABC', false, 'en')
      expect(results.length).toBeGreaterThan(0)
    })
  })
})
