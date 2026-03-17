/**
 * Story 4.6: Suppress False Positive Patterns — Pattern Detection Algorithm
 * TDD RED phase: all tests skip (modules don't exist yet)
 */
import { describe, it, expect } from 'vitest'

import type { DetectedPattern, FindingForDisplay } from '@/features/review/types'
import {
  trackRejection,
  extractKeywords,
  computeWordOverlap,
  resetPatternCounter,
} from '@/features/review/utils/pattern-detection'
import type { RejectionTracker } from '@/features/review/utils/pattern-detection'

// ── Helpers ──

function makeFinding(overrides: Partial<FindingForDisplay> = {}): FindingForDisplay {
  return {
    id: crypto.randomUUID(),
    segmentId: null,
    severity: 'major',
    originalSeverity: null,
    category: 'Terminology',
    description: 'incorrect bank terminology translation in financial context',
    status: 'rejected',
    detectedByLayer: 'L2',
    aiConfidence: 85,
    sourceTextExcerpt: 'bank terminology',
    targetTextExcerpt: null,
    suggestedFix: null,
    aiModel: 'gpt-4o-mini',
    ...overrides,
  }
}

// ── extractKeywords ──

describe('extractKeywords', () => {
  it('[P1] should extract lowercase keywords from English text, filtering short words', () => {
    const keywords = extractKeywords('incorrect bank terminology translation in financial context')
    expect(keywords).toContain('incorrect')
    expect(keywords).toContain('bank')
    expect(keywords).toContain('terminology')
    expect(keywords).toContain('translation')
    expect(keywords).toContain('financial')
    expect(keywords).toContain('context')
    // "in" is < 3 chars → excluded
    expect(keywords).not.toContain('in')
    // All lowercase
    keywords.forEach((k) => expect(k).toBe(k.toLowerCase()))
  })

  it('[P1] should extract keywords from Thai text via Intl.Segmenter', () => {
    const keywords = extractKeywords('คำแปลผิดพลาดในเมนูนำทาง')
    expect(keywords.length).toBeGreaterThan(0)
    // Thai has no spaces — Intl.Segmenter should produce multiple tokens
    expect(keywords.length).toBeGreaterThan(1)
  })

  it('[P1] should match keywords case-insensitively', () => {
    const a = extractKeywords('Bank Terminology Translation')
    const b = extractKeywords('bank terminology translation')
    expect(a).toEqual(b)
  })
})

// ── computeWordOverlap ──

describe('computeWordOverlap', () => {
  it('[P0] should return count of shared words between two keyword arrays', () => {
    const a = ['bank', 'terminology', 'translation', 'financial']
    const b = ['bank', 'terminology', 'translation', 'context']
    expect(computeWordOverlap(a, b)).toBe(3)
  })

  it('[P0] should return 0 when no overlap', () => {
    const a = ['accuracy', 'check', 'failed']
    const b = ['glossary', 'term', 'missing']
    expect(computeWordOverlap(a, b)).toBe(0)
  })

  it('[P0] boundary: exactly 2 overlap = below threshold', () => {
    const a = ['bank', 'terminology', 'alpha']
    const b = ['bank', 'terminology', 'beta']
    expect(computeWordOverlap(a, b)).toBe(2)
  })

  it('[P0] boundary: exactly 3 overlap = at threshold', () => {
    const a = ['bank', 'terminology', 'translation', 'alpha']
    const b = ['bank', 'terminology', 'translation', 'beta']
    expect(computeWordOverlap(a, b)).toBe(3)
  })
})

// ── trackRejection ──

describe('trackRejection', () => {
  it('[P0] should detect pattern when 3 findings share category, lang pair, and >=3 keyword overlap', () => {
    const tracker: RejectionTracker = new Map()
    const findings = [
      makeFinding({
        id: '00000000-0000-4000-8000-000000000001',
        description: 'incorrect bank terminology translation in financial context',
      }),
      makeFinding({
        id: '00000000-0000-4000-8000-000000000002',
        description: 'wrong bank term used in financial document translation',
      }),
      makeFinding({
        id: '00000000-0000-4000-8000-000000000003',
        description: 'bank terminology error in translated financial text',
      }),
    ]
    let result: DetectedPattern | null = null
    for (const f of findings) {
      result = trackRejection(tracker, f, 'en-US', 'th-TH')
    }
    expect(result).not.toBeNull()
    expect(result!.category).toBe('Terminology')
    expect(result!.matchingFindingIds).toHaveLength(3)
  })

  it('[P0] should NOT detect pattern with only 2 rejections', () => {
    const tracker: RejectionTracker = new Map()
    const findings = [
      makeFinding({
        id: '00000000-0000-4000-8000-000000000001',
        description: 'incorrect bank terminology translation in financial context',
      }),
      makeFinding({
        id: '00000000-0000-4000-8000-000000000002',
        description: 'wrong bank term used in financial document translation',
      }),
    ]
    let result: DetectedPattern | null = null
    for (const f of findings) {
      result = trackRejection(tracker, f, 'en-US', 'th-TH')
    }
    expect(result).toBeNull()
  })

  it('[P0] should NOT detect pattern with <3 word overlap', () => {
    const tracker: RejectionTracker = new Map()
    const findings = [
      makeFinding({
        id: '00000000-0000-4000-8000-000000000001',
        description: 'incorrect bank terminology translation',
      }),
      makeFinding({
        id: '00000000-0000-4000-8000-000000000002',
        description: 'wrong glossary term usage detected',
      }),
      makeFinding({
        id: '00000000-0000-4000-8000-000000000003',
        description: 'placeholder format error found',
      }),
    ]
    let result: DetectedPattern | null = null
    for (const f of findings) {
      result = trackRejection(tracker, f, 'en-US', 'th-TH')
    }
    expect(result).toBeNull()
  })

  it('[P1] should exclude findings with <4 unique keywords from detection', () => {
    const tracker: RejectionTracker = new Map()
    // "bad tag" = only 2 keywords → excluded
    const findings = [
      makeFinding({ id: '00000000-0000-4000-8000-000000000001', description: 'bad tag' }),
      makeFinding({ id: '00000000-0000-4000-8000-000000000002', description: 'bad tag' }),
      makeFinding({ id: '00000000-0000-4000-8000-000000000003', description: 'bad tag' }),
    ]
    let result: DetectedPattern | null = null
    for (const f of findings) {
      result = trackRejection(tracker, f, 'en-US', 'th-TH')
    }
    expect(result).toBeNull()
  })

  it('[P1] should treat different categories as separate groups', () => {
    const tracker: RejectionTracker = new Map()
    trackRejection(
      tracker,
      makeFinding({
        id: '1',
        category: 'Terminology',
        description: 'incorrect bank terminology translation in financial context',
      }),
      'en-US',
      'th-TH',
    )
    trackRejection(
      tracker,
      makeFinding({
        id: '2',
        category: 'Terminology',
        description: 'wrong bank term used in financial document translation',
      }),
      'en-US',
      'th-TH',
    )
    const result = trackRejection(
      tracker,
      makeFinding({
        id: '3',
        category: 'Accuracy',
        description: 'bank terminology error in translated financial text',
      }),
      'en-US',
      'th-TH',
    )
    // 2 in Terminology, 1 in Accuracy → no group reaches 3
    expect(result).toBeNull()
  })

  it('[P1] should treat different language pairs as separate groups', () => {
    const tracker: RejectionTracker = new Map()
    trackRejection(
      tracker,
      makeFinding({
        id: '1',
        description: 'incorrect bank terminology translation in financial context',
      }),
      'en-US',
      'th-TH',
    )
    trackRejection(
      tracker,
      makeFinding({
        id: '2',
        description: 'wrong bank term used in financial document translation',
      }),
      'en-US',
      'th-TH',
    )
    const result = trackRejection(
      tracker,
      makeFinding({ id: '3', description: 'bank terminology error in translated financial text' }),
      'en-US',
      'ja-JP',
    )
    // 2 in en-US→th-TH, 1 in en-US→ja-JP → no group reaches 3
    expect(result).toBeNull()
  })
})

// ── resetPatternCounter ──

describe('resetPatternCounter', () => {
  it('[P0] should prevent same cluster from re-triggering after "Keep checking"', () => {
    const tracker: RejectionTracker = new Map()
    trackRejection(
      tracker,
      makeFinding({
        id: '1',
        description: 'incorrect bank terminology translation in financial context',
      }),
      'en-US',
      'th-TH',
    )
    trackRejection(
      tracker,
      makeFinding({
        id: '2',
        description: 'wrong bank term used in financial document translation',
      }),
      'en-US',
      'th-TH',
    )
    const detected = trackRejection(
      tracker,
      makeFinding({ id: '3', description: 'bank terminology error in translated financial text' }),
      'en-US',
      'th-TH',
    )
    expect(detected).not.toBeNull()

    // User clicks "Keep checking"
    resetPatternCounter(tracker, 'Terminology::en-US::th-TH', detected!.patternName)

    // Adding 4th similar finding should NOT re-trigger same cluster
    const again = trackRejection(
      tracker,
      makeFinding({ id: '4', description: 'mistranslated bank financial terminology issue' }),
      'en-US',
      'th-TH',
    )
    expect(again).toBeNull()
  })

  it('[P1] should allow new rejections after reset to form a new cluster', () => {
    const tracker: RejectionTracker = new Map()
    // First 3 trigger
    trackRejection(
      tracker,
      makeFinding({
        id: '1',
        description: 'incorrect bank terminology translation in financial context',
      }),
      'en-US',
      'th-TH',
    )
    trackRejection(
      tracker,
      makeFinding({
        id: '2',
        description: 'wrong bank term used in financial document translation',
      }),
      'en-US',
      'th-TH',
    )
    const detected = trackRejection(
      tracker,
      makeFinding({ id: '3', description: 'bank terminology error in translated financial text' }),
      'en-US',
      'th-TH',
    )
    resetPatternCounter(tracker, 'Terminology::en-US::th-TH', detected!.patternName)

    // 3 NEW rejections with different keyword overlap should form new cluster
    trackRejection(
      tracker,
      makeFinding({
        id: '4',
        description: 'glossary mismatch bank account translation error detected',
      }),
      'en-US',
      'th-TH',
    )
    trackRejection(
      tracker,
      makeFinding({
        id: '5',
        description: 'glossary mismatch bank balance translation error found',
      }),
      'en-US',
      'th-TH',
    )
    const newCluster = trackRejection(
      tracker,
      makeFinding({
        id: '6',
        description: 'glossary mismatch bank statement translation error reported',
      }),
      'en-US',
      'th-TH',
    )
    expect(newCluster).not.toBeNull()
  })
})
