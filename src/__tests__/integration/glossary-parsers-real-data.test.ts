/// <reference types="vitest/globals" />
/**
 * Integration tests: Glossary parsers with real-world test data.
 *
 * Tests TBX parser against Microsoft Terminology Collection (multi-language)
 * and CSV parser against Yaitron EN-TH dictionary.
 *
 * These tests read real files from docs/test-data/ and verify parsers
 * handle production-scale data correctly.
 */

import { readFileSync, existsSync } from 'fs'
import path from 'path'

import { parseCsv } from '@/features/glossary/parsers/csvParser'
import { parseTbx } from '@/features/glossary/parsers/tbxParser'

const TEST_DATA_DIR = path.resolve(process.cwd(), 'docs/test-data')
const MS_TERM_DIR = path.join(TEST_DATA_DIR, 'microsoft-terminology')
const YAITRON_DIR = path.join(TEST_DATA_DIR, 'yaitron-en-th')

// Skip all tests if test data not downloaded
const hasTestData = existsSync(MS_TERM_DIR) && existsSync(YAITRON_DIR)

describe.skipIf(!hasTestData)('Glossary Parsers — Real Data Integration', () => {
  describe('TBX Parser — Microsoft Terminology', () => {
    it('should parse THAI.tbx (EN→TH) with 34K+ terms', () => {
      const filePath = path.join(MS_TERM_DIR, 'THAI.tbx')
      const xmlText = readFileSync(filePath, 'utf-8')

      const result = parseTbx(xmlText, 'en-US', 'th')

      expect(result.terms.length).toBeGreaterThan(30000)
      expect(result.errors.length).toBe(0)

      // Verify first term has valid structure
      const firstTerm = result.terms[0]!
      expect(firstTerm.sourceTerm).toBeTruthy()
      expect(firstTerm.targetTerm).toBeTruthy()
      expect(firstTerm.lineNumber).toBe(1)

      // Verify Thai text is present
      const thaiTerms = result.terms.filter((t) => /[\u0E00-\u0E7F]/.test(t.targetTerm))
      expect(thaiTerms.length).toBeGreaterThan(20000)
    })

    it('should parse JAPANESE.tbx (EN→JA)', () => {
      const filePath = path.join(MS_TERM_DIR, 'JAPANESE.tbx')
      const xmlText = readFileSync(filePath, 'utf-8')

      const result = parseTbx(xmlText, 'en-US', 'ja')

      expect(result.terms.length).toBeGreaterThan(10000)
      expect(result.errors.length).toBe(0)

      // Verify Japanese text (Hiragana/Katakana/Kanji ranges)
      const jaTerms = result.terms.filter((t) =>
        /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(t.targetTerm),
      )
      expect(jaTerms.length).toBeGreaterThan(5000)
    })

    it('should parse CHINESE (SIMPLIFIED).tbx (EN→ZH-Hans)', () => {
      const filePath = path.join(MS_TERM_DIR, 'CHINESE (SIMPLIFIED).tbx')
      const xmlText = readFileSync(filePath, 'utf-8')

      const result = parseTbx(xmlText, 'en-US', 'zh-Hans')

      expect(result.terms.length).toBeGreaterThan(10000)
      expect(result.errors.length).toBe(0)

      // Verify Chinese characters present
      const zhTerms = result.terms.filter((t) => /[\u4E00-\u9FFF]/.test(t.targetTerm))
      expect(zhTerms.length).toBeGreaterThan(5000)
    })

    it('should parse KOREAN.tbx (EN→KO)', () => {
      const filePath = path.join(MS_TERM_DIR, 'KOREAN.tbx')
      const xmlText = readFileSync(filePath, 'utf-8')

      const result = parseTbx(xmlText, 'en-US', 'ko')

      expect(result.terms.length).toBeGreaterThan(10000)
      expect(result.errors.length).toBe(0)

      // Verify Hangul present
      const koTerms = result.terms.filter((t) => /[\uAC00-\uD7AF]/.test(t.targetTerm))
      expect(koTerms.length).toBeGreaterThan(5000)
    })

    it('should parse FRENCH.tbx (EN→FR) — Latin script language', () => {
      const filePath = path.join(MS_TERM_DIR, 'FRENCH.tbx')
      const xmlText = readFileSync(filePath, 'utf-8')

      const result = parseTbx(xmlText, 'en-US', 'fr')

      expect(result.terms.length).toBeGreaterThan(10000)
      expect(result.errors.length).toBe(0)
    })

    it('should parse ARABIC.tbx (EN→AR) — RTL language', () => {
      const filePath = path.join(MS_TERM_DIR, 'ARABIC.tbx')
      const xmlText = readFileSync(filePath, 'utf-8')

      const result = parseTbx(xmlText, 'en-US', 'ar')

      expect(result.terms.length).toBeGreaterThan(10000)
      expect(result.errors.length).toBe(0)

      // Verify Arabic script present
      const arTerms = result.terms.filter((t) => /[\u0600-\u06FF]/.test(t.targetTerm))
      expect(arTerms.length).toBeGreaterThan(5000)
    })

    it('should return errors when requesting non-existent language pair from THAI.tbx', () => {
      const filePath = path.join(MS_TERM_DIR, 'THAI.tbx')
      const xmlText = readFileSync(filePath, 'utf-8')

      // THAI.tbx only has en-US and th — requesting ja should fail
      const result = parseTbx(xmlText, 'en-US', 'ja')

      expect(result.terms.length).toBe(0)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]!.code).toBe('INVALID_PAIR')
    })

    it('should NFKC-normalize all parsed terms', () => {
      const filePath = path.join(MS_TERM_DIR, 'THAI.tbx')
      const xmlText = readFileSync(filePath, 'utf-8')

      const result = parseTbx(xmlText, 'en-US', 'th')

      expect(result.terms.length).toBeGreaterThan(0)

      // Every term should be NFKC-normalized (no change after re-normalizing)
      for (const term of result.terms.slice(0, 500)) {
        expect(term.sourceTerm).toBe(term.sourceTerm.normalize('NFKC'))
        expect(term.targetTerm).toBe(term.targetTerm.normalize('NFKC'))
      }
    })
  })

  describe('CSV Parser — Yaitron EN-TH Dictionary', () => {
    it('should parse yaitron_par.tsv (TSV format, tab delimiter) with 124K+ entries', () => {
      const filePath = path.join(YAITRON_DIR, 'data', 'yaitron_par.tsv')
      const tsvText = readFileSync(filePath, 'utf-8')

      const result = parseCsv(tsvText, {
        sourceColumn: '0',
        targetColumn: '1',
        hasHeader: false,
        delimiter: '\t',
      })

      expect(result.terms.length).toBeGreaterThan(100000)

      // Verify English source + Thai target
      const sample = result.terms[0]!
      expect(sample.sourceTerm).toBeTruthy()
      expect(sample.targetTerm).toBeTruthy()

      // Verify Thai text in targets
      const thaiTerms = result.terms.filter((t) => /[\u0E00-\u0E7F]/.test(t.targetTerm))
      expect(thaiTerms.length).toBeGreaterThan(50000)
    })

    it('should NFKC-normalize all parsed TSV terms', () => {
      const filePath = path.join(YAITRON_DIR, 'data', 'yaitron_par.tsv')
      const tsvText = readFileSync(filePath, 'utf-8')

      const result = parseCsv(tsvText, {
        sourceColumn: '0',
        targetColumn: '1',
        hasHeader: false,
        delimiter: '\t',
      })

      // Check first 500 terms are NFKC-normalized
      for (const term of result.terms.slice(0, 500)) {
        expect(term.sourceTerm).toBe(term.sourceTerm.normalize('NFKC'))
        expect(term.targetTerm).toBe(term.targetTerm.normalize('NFKC'))
      }
    })
  })

  describe('Performance', () => {
    it('should parse THAI.tbx (27MB, 34K terms) in under 30 seconds', () => {
      const filePath = path.join(MS_TERM_DIR, 'THAI.tbx')
      const xmlText = readFileSync(filePath, 'utf-8')

      const start = performance.now()
      const result = parseTbx(xmlText, 'en-US', 'th')
      const elapsed = performance.now() - start

      expect(result.terms.length).toBeGreaterThan(30000)
      expect(elapsed).toBeLessThan(30000) // 30 seconds max
    })

    it('should parse 124K TSV entries in under 10 seconds', () => {
      const filePath = path.join(YAITRON_DIR, 'data', 'yaitron_par.tsv')
      const tsvText = readFileSync(filePath, 'utf-8')

      const start = performance.now()
      const result = parseCsv(tsvText, {
        sourceColumn: '0',
        targetColumn: '1',
        hasHeader: false,
        delimiter: '\t',
      })
      const elapsed = performance.now() - start

      expect(result.terms.length).toBeGreaterThan(100000)
      expect(elapsed).toBeLessThan(10000) // 10 seconds max
    })
  })
})
