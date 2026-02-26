import { describe, expect, it } from 'vitest'

import {
  GOLDEN_SEGMENTS,
  NEGATIVE_SEGMENTS,
  POSITIVE_SEGMENTS,
} from '../evaluation/golden-segments'

describe('Golden Segments Data Quality', () => {
  it('should have non-empty source and target for all segments', () => {
    for (const seg of GOLDEN_SEGMENTS) {
      expect(seg.source.length).toBeGreaterThan(0)
      expect(seg.target.length).toBeGreaterThan(0)
    }
  })

  it('should have valid BCP-47 source language codes', () => {
    const validSourceLangs = ['en', 'de', 'fr', 'es', 'ja', 'zh-CN', 'zh-TW', 'ko', 'th', 'pt']
    for (const seg of GOLDEN_SEGMENTS) {
      expect(validSourceLangs).toContain(seg.sourceLang)
    }
  })

  it('should have valid BCP-47 target language codes', () => {
    const validTargetLangs = ['en', 'de', 'fr', 'es', 'ja', 'zh-CN', 'zh-TW', 'ko', 'th', 'pt']
    for (const seg of GOLDEN_SEGMENTS) {
      expect(validTargetLangs).toContain(seg.targetLang)
    }
  })

  it('should have non-empty labels for all segments', () => {
    for (const seg of GOLDEN_SEGMENTS) {
      expect(seg.label.length).toBeGreaterThan(5)
    }
  })

  it('should have description keywords for all positive findings', () => {
    for (const seg of POSITIVE_SEGMENTS) {
      for (const finding of seg.expectedFindings) {
        expect(finding.descriptionKeywords.length).toBeGreaterThanOrEqual(1)
        for (const kw of finding.descriptionKeywords) {
          expect(kw.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('positive and negative segments should sum to total', () => {
    expect(POSITIVE_SEGMENTS.length + NEGATIVE_SEGMENTS.length).toBe(GOLDEN_SEGMENTS.length)
  })

  describe('positive segment issue diversity', () => {
    it('should include at least one critical mistranslation', () => {
      const hasCritical = POSITIVE_SEGMENTS.some((s) =>
        s.expectedFindings.some((f) => f.severity === 'critical' && f.category === 'accuracy'),
      )
      expect(hasCritical).toBe(true)
    })

    it('should include at least one omission', () => {
      const hasOmission = POSITIVE_SEGMENTS.some((s) =>
        s.expectedFindings.some((f) =>
          f.descriptionKeywords.some(
            (kw) => kw.toLowerCase().includes('omit') || kw.toLowerCase().includes('missing'),
          ),
        ),
      )
      expect(hasOmission).toBe(true)
    })

    it('should include at least one register/style mismatch', () => {
      const hasStyle = POSITIVE_SEGMENTS.some((s) =>
        s.expectedFindings.some((f) => f.category === 'style'),
      )
      expect(hasStyle).toBe(true)
    })

    it('should include at least one fluency issue', () => {
      const hasFluency = POSITIVE_SEGMENTS.some((s) =>
        s.expectedFindings.some((f) => f.category === 'fluency'),
      )
      expect(hasFluency).toBe(true)
    })

    it('should include at least one terminology issue', () => {
      const hasTerm = POSITIVE_SEGMENTS.some((s) =>
        s.expectedFindings.some((f) => f.category === 'terminology'),
      )
      expect(hasTerm).toBe(true)
    })
  })

  describe('negative segment quality', () => {
    it('should include at least one formally correct translation', () => {
      const hasFormal = NEGATIVE_SEGMENTS.some(
        (s) =>
          s.label.toLowerCase().includes('formal') || s.label.toLowerCase().includes('correct'),
      )
      expect(hasFormal).toBe(true)
    })

    it('should include at least one segment with placeholders', () => {
      const hasPlaceholder = NEGATIVE_SEGMENTS.some(
        (s) => s.source.includes('{0}') || s.source.includes('{'),
      )
      expect(hasPlaceholder).toBe(true)
    })

    it('should include at least one natural adaptation (non-literal)', () => {
      const hasAdaptation = NEGATIVE_SEGMENTS.some(
        (s) =>
          s.label.toLowerCase().includes('adaptation') || s.label.toLowerCase().includes('natural'),
      )
      expect(hasAdaptation).toBe(true)
    })
  })
})
