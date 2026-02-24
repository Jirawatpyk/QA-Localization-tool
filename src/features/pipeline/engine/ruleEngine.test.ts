import { describe, expect, it, vi } from 'vitest'

import { buildSegment } from '@/test/factories'

import { processFile } from './ruleEngine'
import type { GlossaryTermRecord, SegmentRecord, SuppressionRuleRecord } from './types'

// Mock glossary matcher — server-only module not available in jsdom
vi.mock('@/features/glossary/matching/glossaryMatcher', () => ({
  checkGlossaryCompliance: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ matches: [], missingTerms: [], lowConfidenceMatches: [] }),
  ),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const emptyGlossary: GlossaryTermRecord[] = []
const noSuppression = new Set<string>()
const noCustomRules: SuppressionRuleRecord[] = []

describe('processFile', () => {
  it('should return empty when no segments', async () => {
    const results = await processFile([], emptyGlossary, noSuppression, noCustomRules)
    expect(results).toEqual([])
  })

  it('should run all check types and aggregate results', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Hello world',
        targetText: '', // untranslated → critical
        confirmationState: 'Draft',
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.category === 'completeness')).toBe(true)
  })

  it('should skip ApprovedSignOff segments', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Hello',
        targetText: '', // untranslated, but should be skipped
        confirmationState: 'ApprovedSignOff',
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    expect(results).toEqual([])
  })

  it('should process segments with null confirmationState', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Hello',
        targetText: '',
        confirmationState: null,
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    expect(results.some((r) => r.category === 'completeness')).toBe(true)
  })

  it('should filter out suppressed categories', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Hello',
        targetText: '', // completeness finding
        confirmationState: 'Draft',
      }),
    ]
    const suppressed = new Set(['completeness'])
    const results = await processFile(segments, emptyGlossary, suppressed, noCustomRules)
    expect(results.every((r) => r.category !== 'completeness')).toBe(true)
  })

  it('should detect tag integrity issues', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Hello world',
        targetText: 'สวัสดีโลก',
        confirmationState: 'Draft',
        inlineTags: {
          source: [{ type: 'ph', id: '1', position: 5 }],
          target: [],
        },
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    expect(results.some((r) => r.category === 'tag_integrity')).toBe(true)
  })

  it('should detect number mismatches', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Page 42',
        targetText: 'หน้า',
        confirmationState: 'Draft',
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    expect(results.some((r) => r.category === 'number_format')).toBe(true)
  })

  it('should detect placeholder mismatches', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Hello {0}',
        targetText: 'สวัสดี',
        confirmationState: 'Draft',
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    expect(results.some((r) => r.category === 'placeholder_integrity')).toBe(true)
  })

  it('should detect double spaces', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Hello world',
        targetText: 'สวัสดี  โลก',
        confirmationState: 'Draft',
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    expect(results.some((r) => r.category === 'spacing')).toBe(true)
  })

  it('should detect URL mismatches', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Visit https://example.com',
        targetText: 'เยี่ยมชม',
        confirmationState: 'Draft',
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    expect(results.some((r) => r.category === 'url_integrity')).toBe(true)
  })

  it('should detect consistency issues across segments', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Hello',
        targetText: 'สวัสดี',
        confirmationState: 'Draft',
      }),
      buildSegment({
        sourceText: 'Hello',
        targetText: 'หวัดดี',
        confirmationState: 'Draft',
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    expect(results.some((r) => r.category === 'consistency')).toBe(true)
  })

  it('should run custom rules', async () => {
    const customRule: SuppressionRuleRecord = {
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      projectId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
      tenantId: 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f',
      pattern: 'TODO',
      category: 'custom_rule',
      scope: 'project',
      reason: 'No TODOs',
      createdBy: 'd4e5f6a1-b2c3-4d4e-bf5a-6b7c8d9e0f1a',
      isActive: true,
      createdAt: new Date(),
    }
    const segments = [
      buildSegment({
        sourceText: 'Fix this',
        targetText: 'TODO: fix this',
        confirmationState: 'Draft',
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, [customRule])
    expect(results.some((r) => r.category === 'custom_rule')).toBe(true)
  })

  it('should truncate excerpts to MAX_EXCERPT_LENGTH', async () => {
    const longText = 'A'.repeat(1000)
    const segments = [
      buildSegment({
        sourceText: longText,
        targetText: '',
        confirmationState: 'Draft',
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    for (const r of results) {
      expect(r.sourceExcerpt.length).toBeLessThanOrEqual(500)
      expect(r.targetExcerpt.length).toBeLessThanOrEqual(500)
    }
  })

  it('should handle mixed severity findings', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Hello {0}',
        targetText: '  สวัสดี',
        confirmationState: 'Draft',
        inlineTags: {
          source: [{ type: 'ph', id: '1', position: 6 }],
          target: [],
        },
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    const severities = new Set(results.map((r) => r.severity))
    expect(severities.size).toBeGreaterThan(1)
  })

  it('should process single segment without errors', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Hello world.',
        targetText: 'สวัสดีโลก.',
        confirmationState: 'Translated',
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    // Clean translation with matching end punctuation — should produce no findings
    expect(results).toEqual([])
  })

  it('should handle null inlineTags without errors', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Hello',
        targetText: 'สวัสดี',
        inlineTags: null,
        confirmationState: 'Draft',
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    // Should not crash — tag check should be skipped
    expect(results.every((r) => r.category !== 'tag_integrity')).toBe(true)
  })

  // Performance test with mocked I/O
  it('should process 5000 segments in under 5 seconds', async () => {
    const segments: SegmentRecord[] = Array.from({ length: 5000 }, (_, i) =>
      buildSegment({
        sourceText: `Segment ${i + 1} with some text`,
        targetText: `เซ็กเมนต์ ${i + 1} พร้อมข้อความ`,
        confirmationState: 'Translated',
        inlineTags: null,
      }),
    )

    const start = performance.now()
    await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(5000)
  })

  it('should return empty for all ApprovedSignOff segments', async () => {
    const segments = [
      buildSegment({ sourceText: 'A', targetText: '', confirmationState: 'ApprovedSignOff' }),
      buildSegment({ sourceText: 'B', targetText: '', confirmationState: 'ApprovedSignOff' }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    expect(results).toEqual([])
  })

  it('should only process non-ApprovedSignOff segments in mixed list', async () => {
    const segments = [
      buildSegment({
        sourceText: 'Hello',
        targetText: '',
        confirmationState: 'Draft',
      }),
      buildSegment({
        sourceText: 'World',
        targetText: '',
        confirmationState: 'ApprovedSignOff',
      }),
    ]
    const results = await processFile(segments, emptyGlossary, noSuppression, noCustomRules)
    // Only the Draft segment should produce findings
    const ids = new Set(results.map((r) => r.segmentId))
    expect(ids.has(segments[0]!.id)).toBe(true)
    expect(ids.has(segments[1]!.id)).toBe(false)
  })
})
