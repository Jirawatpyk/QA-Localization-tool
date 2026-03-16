/**
 * Direct unit tests for findingMatchesFilters + getConfidenceBucket.
 * Story 4.5 CR M2: core filtering logic must have co-located direct tests.
 */
import { describe, it, expect } from 'vitest'

import type { FilterableFinding, FilterState } from './filter-helpers'
import { DEFAULT_FILTER_STATE, findingMatchesFilters, getConfidenceBucket } from './filter-helpers'

// ── Factory ──

function makeFinding(overrides: Partial<FilterableFinding> = {}): FilterableFinding {
  return {
    severity: 'major',
    category: 'accuracy',
    status: 'pending',
    description: 'Test finding description',
    detectedByLayer: 'L1',
    aiConfidence: null,
    suggestedFix: null,
    sourceTextExcerpt: 'Source text',
    targetTextExcerpt: 'Target text',
    ...overrides,
  }
}

const ALL_PASS: FilterState = {
  severity: null,
  status: null,
  layer: null,
  category: null,
  confidence: null,
}

// ── getConfidenceBucket ──

describe('getConfidenceBucket', () => {
  it('should return high for >85', () => {
    expect(getConfidenceBucket(85.01)).toBe('high')
    expect(getConfidenceBucket(100)).toBe('high')
    expect(getConfidenceBucket(86)).toBe('high')
  })

  it('should return medium for 70–85 inclusive', () => {
    expect(getConfidenceBucket(70)).toBe('medium')
    expect(getConfidenceBucket(85)).toBe('medium')
    expect(getConfidenceBucket(77.5)).toBe('medium')
  })

  it('should return low for <70', () => {
    expect(getConfidenceBucket(69.99)).toBe('low')
    expect(getConfidenceBucket(0)).toBe('low')
    expect(getConfidenceBucket(50)).toBe('low')
  })
})

// ── findingMatchesFilters ──

describe('findingMatchesFilters', () => {
  // ── AI toggle ──

  it('should hide L2 when AI disabled', () => {
    const f = makeFinding({ detectedByLayer: 'L2' })
    expect(findingMatchesFilters(f, ALL_PASS, '', false)).toBe(false)
  })

  it('should hide L3 when AI disabled', () => {
    const f = makeFinding({ detectedByLayer: 'L3' })
    expect(findingMatchesFilters(f, ALL_PASS, '', false)).toBe(false)
  })

  it('should show L1 when AI disabled', () => {
    const f = makeFinding({ detectedByLayer: 'L1' })
    expect(findingMatchesFilters(f, ALL_PASS, '', false)).toBe(true)
  })

  it('should show Manual when AI disabled', () => {
    const f = makeFinding({ detectedByLayer: 'Manual' })
    expect(findingMatchesFilters(f, ALL_PASS, '', false)).toBe(true)
  })

  // ── Severity ──

  it('should filter by severity', () => {
    const f = makeFinding({ severity: 'critical' })
    const filter = { ...ALL_PASS, severity: 'major' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(false)
  })

  // ── Status ──

  it('should filter by status', () => {
    const f = makeFinding({ status: 'rejected' })
    const filter = { ...ALL_PASS, status: 'pending' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(false)
  })

  it('should match re_accepted when filter is accepted', () => {
    const f = makeFinding({ status: 're_accepted' })
    const filter = { ...ALL_PASS, status: 'accepted' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(true)
  })

  it('should match accepted when filter is accepted', () => {
    const f = makeFinding({ status: 'accepted' })
    const filter = { ...ALL_PASS, status: 'accepted' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(true)
  })

  // ── Layer: AI group (L2+L3) ──

  it('should match L2 when layer filter is L2 (AI)', () => {
    const f = makeFinding({ detectedByLayer: 'L2' })
    const filter = { ...ALL_PASS, layer: 'L2' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(true)
  })

  it('should match L3 when layer filter is L2 (AI group)', () => {
    const f = makeFinding({ detectedByLayer: 'L3' })
    const filter = { ...ALL_PASS, layer: 'L2' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(true)
  })

  it('should NOT match L1 when layer filter is L2 (AI)', () => {
    const f = makeFinding({ detectedByLayer: 'L1' })
    const filter = { ...ALL_PASS, layer: 'L2' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(false)
  })

  it('should match L1 when layer filter is L1', () => {
    const f = makeFinding({ detectedByLayer: 'L1' })
    const filter = { ...ALL_PASS, layer: 'L1' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(true)
  })

  // ── Category ──

  it('should filter by category', () => {
    const f = makeFinding({ category: 'terminology' })
    const filter = { ...ALL_PASS, category: 'accuracy' }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(false)
  })

  // ── Confidence ──

  it('should exclude null confidence when confidence filter active', () => {
    const f = makeFinding({ aiConfidence: null })
    const filter = { ...ALL_PASS, confidence: 'high' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(false)
  })

  it('should include null confidence when confidence filter null (All)', () => {
    const f = makeFinding({ aiConfidence: null })
    expect(findingMatchesFilters(f, ALL_PASS, '', true)).toBe(true)
  })

  it('should match confidence=high for >85', () => {
    const f = makeFinding({ aiConfidence: 90 })
    const filter = { ...ALL_PASS, confidence: 'high' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(true)
  })

  it('should NOT match confidence=high for exactly 85', () => {
    const f = makeFinding({ aiConfidence: 85 })
    const filter = { ...ALL_PASS, confidence: 'high' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(false)
  })

  it('should match confidence=medium for exactly 85', () => {
    const f = makeFinding({ aiConfidence: 85 })
    const filter = { ...ALL_PASS, confidence: 'medium' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(true)
  })

  it('should match confidence=medium for exactly 70', () => {
    const f = makeFinding({ aiConfidence: 70 })
    const filter = { ...ALL_PASS, confidence: 'medium' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(true)
  })

  it('should match confidence=low for 69.99', () => {
    const f = makeFinding({ aiConfidence: 69.99 })
    const filter = { ...ALL_PASS, confidence: 'low' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(true)
  })

  it('should match confidence=low for 0', () => {
    const f = makeFinding({ aiConfidence: 0 })
    const filter = { ...ALL_PASS, confidence: 'low' as const }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(true)
  })

  // ── Search query ──

  it('should match search in description', () => {
    const f = makeFinding({ description: 'Critical mistranslation detected' })
    expect(findingMatchesFilters(f, ALL_PASS, 'mistranslation', true)).toBe(true)
  })

  it('should be case-insensitive', () => {
    const f = makeFinding({ description: 'Critical MISTRANSLATION' })
    expect(findingMatchesFilters(f, ALL_PASS, 'mistranslation', true)).toBe(true)
  })

  it('should match search in sourceTextExcerpt', () => {
    const f = makeFinding({ sourceTextExcerpt: 'Save changes' })
    expect(findingMatchesFilters(f, ALL_PASS, 'save', true)).toBe(true)
  })

  it('should match search in targetTextExcerpt', () => {
    const f = makeFinding({ targetTextExcerpt: 'บันทึกการเปลี่ยน' })
    expect(findingMatchesFilters(f, ALL_PASS, 'บันทึก', true)).toBe(true)
  })

  it('should match search in suggestedFix', () => {
    const f = makeFinding({ suggestedFix: 'Use correct glossary term' })
    expect(findingMatchesFilters(f, ALL_PASS, 'glossary', true)).toBe(true)
  })

  it('should handle Thai text search', () => {
    const f = makeFinding({ targetTextExcerpt: 'คำแปลผิดพลาดร้ายแรง' })
    expect(findingMatchesFilters(f, ALL_PASS, 'คำแปล', true)).toBe(true)
  })

  it('should handle CJK text search', () => {
    const f = makeFinding({ targetTextExcerpt: '翻訳が不正確です' })
    expect(findingMatchesFilters(f, ALL_PASS, '翻訳', true)).toBe(true)
  })

  it('should handle Korean text search', () => {
    const f = makeFinding({ targetTextExcerpt: '번역이 부정확합니다' })
    expect(findingMatchesFilters(f, ALL_PASS, '번역', true)).toBe(true)
  })

  it('should ignore whitespace-only search', () => {
    const f = makeFinding()
    expect(findingMatchesFilters(f, ALL_PASS, '   ', true)).toBe(true)
  })

  it('should handle null text fields without error', () => {
    const f = makeFinding({
      sourceTextExcerpt: null,
      targetTextExcerpt: null,
      suggestedFix: null,
      description: 'match here',
    })
    expect(findingMatchesFilters(f, ALL_PASS, 'match', true)).toBe(true)
  })

  it('should handle special regex characters in search', () => {
    const f = makeFinding({ description: 'Error (code: [123])' })
    expect(findingMatchesFilters(f, ALL_PASS, '(code:', true)).toBe(true)
  })

  // ── AND logic ──

  it('should apply all filters with AND logic', () => {
    const f = makeFinding({
      severity: 'major',
      status: 'pending',
      detectedByLayer: 'L2',
      category: 'accuracy',
      aiConfidence: 90,
      description: 'test match',
    })
    const filter: FilterState = {
      severity: 'major',
      status: 'pending',
      layer: 'L2',
      category: 'accuracy',
      confidence: 'high',
    }
    expect(findingMatchesFilters(f, filter, 'test', true)).toBe(true)
  })

  it('should reject when any single filter fails', () => {
    const f = makeFinding({
      severity: 'minor',
      status: 'pending',
      detectedByLayer: 'L1',
    })
    const filter: FilterState = {
      severity: 'major',
      status: 'pending',
      layer: null,
      category: null,
      confidence: null,
    }
    expect(findingMatchesFilters(f, filter, '', true)).toBe(false)
  })
})
