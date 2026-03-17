/**
 * Story 4.6: Suppress False Positive Patterns — Pattern Detection Algorithm
 */
import { describe, it, expect } from 'vitest'

import type { FindingForDisplay, SuppressionRule } from '@/features/review/types'
import {
  trackRejection,
  extractKeywords,
  computeWordOverlap,
  resetPatternCounter,
  isAlreadySuppressed,
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

function makeRule(overrides: Partial<SuppressionRule> = {}): SuppressionRule {
  return {
    id: crypto.randomUUID(),
    projectId: crypto.randomUUID(),
    tenantId: crypto.randomUUID(),
    pattern: 'bank, terminology, translation',
    category: 'Terminology',
    scope: 'language_pair',
    duration: 'until_improved',
    reason: 'Auto-generated',
    fileId: null,
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    matchCount: 3,
    createdBy: crypto.randomUUID(),
    createdByName: null,
    isActive: true,
    createdAt: new Date().toISOString(),
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
    let tracker: RejectionTracker = new Map()
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
    let pattern = null
    for (const f of findings) {
      const result = trackRejection(tracker, f, 'en-US', 'th-TH')
      tracker = result.tracker
      if (result.pattern) pattern = result.pattern
    }
    expect(pattern).not.toBeNull()
    expect(pattern!.category).toBe('Terminology')
    expect(pattern!.matchingFindingIds).toHaveLength(3)
  })

  it('[P0] should return SAME tracker reference when keywords < 4 (no unnecessary clone)', () => {
    const tracker: RejectionTracker = new Map()
    const result = trackRejection(
      tracker,
      makeFinding({ description: 'bad tag' }), // < 4 keywords → early return
      'en-US',
      'th-TH',
    )
    expect(result.tracker).toBe(tracker) // Same reference — no clone on early return
    expect(result.pattern).toBeNull()
  })

  it('[P0] should return new tracker reference (immutable pattern for Zustand)', () => {
    const tracker: RejectionTracker = new Map()
    const result = trackRejection(
      tracker,
      makeFinding({ description: 'incorrect bank terminology translation in financial context' }),
      'en-US',
      'th-TH',
    )
    // New tracker returned even when no pattern detected
    expect(result.tracker).not.toBe(tracker)
    expect(result.pattern).toBeNull()
  })

  it('[P0] should NOT detect pattern with only 2 rejections', () => {
    let tracker: RejectionTracker = new Map()
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
    let pattern = null
    for (const f of findings) {
      const result = trackRejection(tracker, f, 'en-US', 'th-TH')
      tracker = result.tracker
      if (result.pattern) pattern = result.pattern
    }
    expect(pattern).toBeNull()
  })

  it('[P0] should NOT detect pattern with <3 word overlap', () => {
    let tracker: RejectionTracker = new Map()
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
    let pattern = null
    for (const f of findings) {
      const result = trackRejection(tracker, f, 'en-US', 'th-TH')
      tracker = result.tracker
      if (result.pattern) pattern = result.pattern
    }
    expect(pattern).toBeNull()
  })

  it('[P1] should exclude findings with <4 unique keywords from detection', () => {
    let tracker: RejectionTracker = new Map()
    // "bad tag" = only 2 keywords → excluded
    const findings = [
      makeFinding({ id: '00000000-0000-4000-8000-000000000001', description: 'bad tag' }),
      makeFinding({ id: '00000000-0000-4000-8000-000000000002', description: 'bad tag' }),
      makeFinding({ id: '00000000-0000-4000-8000-000000000003', description: 'bad tag' }),
    ]
    let pattern = null
    for (const f of findings) {
      const result = trackRejection(tracker, f, 'en-US', 'th-TH')
      tracker = result.tracker
      if (result.pattern) pattern = result.pattern
    }
    expect(pattern).toBeNull()
  })

  it('[P1] should treat different categories as separate groups', () => {
    let tracker: RejectionTracker = new Map()
    let r = trackRejection(
      tracker,
      makeFinding({
        category: 'Terminology',
        description: 'incorrect bank terminology translation in financial context',
      }),
      'en-US',
      'th-TH',
    )
    tracker = r.tracker
    r = trackRejection(
      tracker,
      makeFinding({
        category: 'Terminology',
        description: 'wrong bank term used in financial document translation',
      }),
      'en-US',
      'th-TH',
    )
    tracker = r.tracker
    r = trackRejection(
      tracker,
      makeFinding({
        category: 'Accuracy',
        description: 'bank terminology error in translated financial text',
      }),
      'en-US',
      'th-TH',
    )
    // 2 in Terminology, 1 in Accuracy → no group reaches 3
    expect(r.pattern).toBeNull()
  })

  it('[P1] should treat different language pairs as separate groups', () => {
    let tracker: RejectionTracker = new Map()
    let r = trackRejection(
      tracker,
      makeFinding({
        description: 'incorrect bank terminology translation in financial context',
      }),
      'en-US',
      'th-TH',
    )
    tracker = r.tracker
    r = trackRejection(
      tracker,
      makeFinding({
        description: 'wrong bank term used in financial document translation',
      }),
      'en-US',
      'th-TH',
    )
    tracker = r.tracker
    r = trackRejection(
      tracker,
      makeFinding({ description: 'bank terminology error in translated financial text' }),
      'en-US',
      'ja-JP',
    )
    // 2 in en-US→th-TH, 1 in en-US→ja-JP → no group reaches 3
    expect(r.pattern).toBeNull()
  })
})

// ── resetPatternCounter ──

describe('resetPatternCounter', () => {
  it('[P0] should prevent same cluster from re-triggering after "Keep checking"', () => {
    let tracker: RejectionTracker = new Map()
    let r = trackRejection(
      tracker,
      makeFinding({
        description: 'incorrect bank terminology translation in financial context',
      }),
      'en-US',
      'th-TH',
    )
    tracker = r.tracker
    r = trackRejection(
      tracker,
      makeFinding({
        description: 'wrong bank term used in financial document translation',
      }),
      'en-US',
      'th-TH',
    )
    tracker = r.tracker
    const detected = trackRejection(
      tracker,
      makeFinding({ description: 'bank terminology error in translated financial text' }),
      'en-US',
      'th-TH',
    )
    tracker = detected.tracker
    expect(detected.pattern).not.toBeNull()

    // User clicks "Keep checking" — returns new tracker (immutable)
    tracker = resetPatternCounter(
      tracker,
      'Terminology::en-US::th-TH',
      detected.pattern!.patternName,
    )

    // Adding 4th similar finding should NOT re-trigger same cluster
    const again = trackRejection(
      tracker,
      makeFinding({ description: 'mistranslated bank financial terminology issue' }),
      'en-US',
      'th-TH',
    )
    expect(again.pattern).toBeNull()
  })

  it('[P0] should return new tracker reference (immutable pattern)', () => {
    const tracker: RejectionTracker = new Map()
    tracker.set('Terminology::en-US::th-TH', { entries: [], dismissedPatterns: new Set() })
    const newTracker = resetPatternCounter(tracker, 'Terminology::en-US::th-TH', 'test-pattern')
    expect(newTracker).not.toBe(tracker)
  })

  it('[P1] should allow new rejections after reset to form a new cluster', () => {
    let tracker: RejectionTracker = new Map()
    // First 3 trigger
    let r = trackRejection(
      tracker,
      makeFinding({
        description: 'incorrect bank terminology translation in financial context',
      }),
      'en-US',
      'th-TH',
    )
    tracker = r.tracker
    r = trackRejection(
      tracker,
      makeFinding({
        description: 'wrong bank term used in financial document translation',
      }),
      'en-US',
      'th-TH',
    )
    tracker = r.tracker
    const detected = trackRejection(
      tracker,
      makeFinding({ description: 'bank terminology error in translated financial text' }),
      'en-US',
      'th-TH',
    )
    tracker = detected.tracker
    tracker = resetPatternCounter(
      tracker,
      'Terminology::en-US::th-TH',
      detected.pattern!.patternName,
    )

    // 3 NEW rejections with different keyword overlap should form new cluster
    r = trackRejection(
      tracker,
      makeFinding({
        description: 'glossary mismatch bank account translation error detected',
      }),
      'en-US',
      'th-TH',
    )
    tracker = r.tracker
    r = trackRejection(
      tracker,
      makeFinding({
        description: 'glossary mismatch bank balance translation error found',
      }),
      'en-US',
      'th-TH',
    )
    tracker = r.tracker
    const newCluster = trackRejection(
      tracker,
      makeFinding({
        description: 'glossary mismatch bank statement translation error reported',
      }),
      'en-US',
      'th-TH',
    )
    expect(newCluster.pattern).not.toBeNull()
  })
})

// ── isAlreadySuppressed (CR-H4) ──

describe('isAlreadySuppressed', () => {
  it('[P0] should return true when active rule matches category + keyword overlap', () => {
    const rules = [makeRule()]
    const finding = makeFinding({
      description: 'incorrect bank terminology translation in financial context',
    })
    expect(isAlreadySuppressed(rules, finding, 'en-US', 'th-TH', null)).toBe(true)
  })

  it('[P0] should skip inactive rules', () => {
    const rules = [makeRule({ isActive: false })]
    const finding = makeFinding({
      description: 'incorrect bank terminology translation in financial context',
    })
    expect(isAlreadySuppressed(rules, finding, 'en-US', 'th-TH', null)).toBe(false)
  })

  it('[P0] should skip rules with different category', () => {
    const rules = [makeRule({ category: 'Accuracy' })]
    const finding = makeFinding({
      category: 'Terminology',
      description: 'incorrect bank terminology translation in financial context',
    })
    expect(isAlreadySuppressed(rules, finding, 'en-US', 'th-TH', null)).toBe(false)
  })

  it('[P0] should skip language_pair scope with mismatched lang', () => {
    const rules = [makeRule({ scope: 'language_pair', sourceLang: 'en-US', targetLang: 'ja-JP' })]
    const finding = makeFinding({
      description: 'incorrect bank terminology translation in financial context',
    })
    expect(isAlreadySuppressed(rules, finding, 'en-US', 'th-TH', null)).toBe(false)
  })

  it('[P0] should match language_pair scope with matching lang', () => {
    const rules = [makeRule({ scope: 'language_pair', sourceLang: 'en-US', targetLang: 'th-TH' })]
    const finding = makeFinding({
      description: 'incorrect bank terminology translation in financial context',
    })
    expect(isAlreadySuppressed(rules, finding, 'en-US', 'th-TH', null)).toBe(true)
  })

  it('[P0] should match "all" scope regardless of language', () => {
    const rules = [makeRule({ scope: 'all', sourceLang: null, targetLang: null })]
    const finding = makeFinding({
      description: 'incorrect bank terminology translation in financial context',
    })
    expect(isAlreadySuppressed(rules, finding, 'ja-JP', 'ko-KR', null)).toBe(true)
  })

  it('[P0] should skip "file" scope with mismatched fileId (CR-M1)', () => {
    const fileA = crypto.randomUUID()
    const fileB = crypto.randomUUID()
    const rules = [makeRule({ scope: 'file', fileId: fileA })]
    const finding = makeFinding({
      description: 'incorrect bank terminology translation in financial context',
    })
    expect(isAlreadySuppressed(rules, finding, 'en-US', 'th-TH', fileB)).toBe(false)
  })

  it('[P0] should match "file" scope with matching fileId', () => {
    const fileId = crypto.randomUUID()
    const rules = [makeRule({ scope: 'file', fileId })]
    const finding = makeFinding({
      description: 'incorrect bank terminology translation in financial context',
    })
    expect(isAlreadySuppressed(rules, finding, 'en-US', 'th-TH', fileId)).toBe(true)
  })

  it('[P0] boundary: 2 keyword overlap = NOT suppressed', () => {
    const rules = [makeRule({ pattern: 'bank, terminology' })]
    const finding = makeFinding({ description: 'bank terminology issues' })
    expect(isAlreadySuppressed(rules, finding, 'en-US', 'th-TH', null)).toBe(false)
  })

  it('[P0] boundary: 3 keyword overlap = suppressed', () => {
    const rules = [makeRule({ pattern: 'bank, terminology, translation' })]
    const finding = makeFinding({
      description: 'incorrect bank terminology translation in context',
    })
    expect(isAlreadySuppressed(rules, finding, 'en-US', 'th-TH', null)).toBe(true)
  })
})
