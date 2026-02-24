import { describe, expect, it } from 'vitest'

import { buildSegment } from '@/test/factories'

import type { SegmentCheckContext } from '../types'

import { checkTagIntegrity } from './tagChecks'

const ctx: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'th-TH' }

describe('checkTagIntegrity', () => {
  // ── Null / empty cases ──

  it('should return no findings when inlineTags is null', () => {
    const segment = buildSegment({ inlineTags: null })
    expect(checkTagIntegrity(segment, ctx)).toEqual([])
  })

  it('should return no findings when both source and target tag arrays are empty', () => {
    const segment = buildSegment({ inlineTags: { source: [], target: [] } })
    expect(checkTagIntegrity(segment, ctx)).toEqual([])
  })

  it('should return no findings when source and target tags match exactly', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [{ type: 'g', id: '1', position: 5 }],
        target: [{ type: 'g', id: '1', position: 3 }],
      },
    })
    expect(checkTagIntegrity(segment, ctx)).toEqual([])
  })

  // ── Missing tags (source has, target does not) ──

  it('should flag missing tag when source has tag but target does not', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [{ type: 'ph', id: '1', position: 10 }],
        target: [],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results).toHaveLength(1)
    expect(results[0]!.severity).toBe('critical')
    expect(results[0]!.category).toBe('tag_integrity')
    expect(results[0]!.description).toContain('Missing tag')
    expect(results[0]!.description).toContain('ph')
  })

  it('should flag multiple missing tags individually', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [
          { type: 'g', id: '1', position: 0 },
          { type: 'x', id: '2', position: 5 },
        ],
        target: [],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.severity === 'critical')).toBe(true)
  })

  it('should report correct missing count when source has 2 of same tag but target has 1', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [
          { type: 'ph', id: '1', position: 0 },
          { type: 'ph', id: '1', position: 10 },
        ],
        target: [{ type: 'ph', id: '1', position: 3 }],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results).toHaveLength(1)
    expect(results[0]!.description).toContain('1 missing')
  })

  // ── Extra tags (target has, source does not) ──

  it('should flag extra tag when target has tag but source does not', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [],
        target: [{ type: 'bpt', id: '1', position: 0 }],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results).toHaveLength(1)
    expect(results[0]!.severity).toBe('critical')
    expect(results[0]!.description).toContain('Extra tag')
    expect(results[0]!.description).toContain('bpt')
  })

  it('should report correct extra count when target has more tags than source', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [{ type: 'x', id: '1', position: 0 }],
        target: [
          { type: 'x', id: '1', position: 0 },
          { type: 'x', id: '1', position: 5 },
          { type: 'x', id: '1', position: 10 },
        ],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results).toHaveLength(1)
    expect(results[0]!.description).toContain('2 extra')
  })

  // ── Combined missing + extra ──

  it('should flag both missing and extra when tags are different', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [{ type: 'g', id: '1', position: 0 }],
        target: [{ type: 'x', id: '2', position: 0 }],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results).toHaveLength(2)
    const descriptions = results.map((r) => r.description)
    expect(descriptions.some((d) => d.includes('Missing'))).toBe(true)
    expect(descriptions.some((d) => d.includes('Extra'))).toBe(true)
  })

  // ── Reordered tags (same set, different order) ──

  it('should flag reordered tags as minor when tag set matches but order differs', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [
          { type: 'g', id: '1', position: 0 },
          { type: 'x', id: '2', position: 10 },
        ],
        target: [
          { type: 'x', id: '2', position: 0 },
          { type: 'g', id: '1', position: 8 },
        ],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results).toHaveLength(1)
    expect(results[0]!.severity).toBe('minor')
    expect(results[0]!.description).toContain('order differs')
  })

  it('should NOT flag reorder when only 1 tag exists (order is trivial)', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [{ type: 'g', id: '1', position: 0 }],
        target: [{ type: 'g', id: '1', position: 5 }],
      },
    })
    expect(checkTagIntegrity(segment, ctx)).toEqual([])
  })

  it('should NOT flag reorder when tags are in same order', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [
          { type: 'bpt', id: '1', position: 0 },
          { type: 'ept', id: '1', position: 10 },
        ],
        target: [
          { type: 'bpt', id: '1', position: 0 },
          { type: 'ept', id: '1', position: 8 },
        ],
      },
    })
    expect(checkTagIntegrity(segment, ctx)).toEqual([])
  })

  // ── Paired tags (bpt/ept, bx/ex) ──

  it('should flag missing ept when source has bpt+ept but target only has bpt', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [
          { type: 'bpt', id: '1', position: 0 },
          { type: 'ept', id: '1', position: 10 },
        ],
        target: [{ type: 'bpt', id: '1', position: 0 }],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results).toHaveLength(1)
    expect(results[0]!.description).toContain('ept')
    expect(results[0]!.description).toContain('Missing')
  })

  it('should flag missing bx/ex pair when both missing from target', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [
          { type: 'bx', id: '1', position: 5 },
          { type: 'ex', id: '1', position: 11 },
        ],
        target: [],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results).toHaveLength(2)
    const types = results.map((r) => r.description)
    expect(types.some((d) => d.includes('bx'))).toBe(true)
    expect(types.some((d) => d.includes('ex'))).toBe(true)
  })

  // ── Edge cases ──

  it('should include segmentId in result', () => {
    const segment = buildSegment({
      id: 'test-seg-id',
      inlineTags: {
        source: [{ type: 'ph', id: '1', position: 0 }],
        target: [],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results[0]!.segmentId).toBe('test-seg-id')
  })

  it('should include suggestedFix in missing tag result', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [{ type: 'g', id: '1', position: 0 }],
        target: [],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results[0]!.suggestedFix).toContain('Add')
  })

  it('should include suggestedFix in extra tag result', () => {
    const segment = buildSegment({
      inlineTags: {
        source: [],
        target: [{ type: 'g', id: '1', position: 0 }],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results[0]!.suggestedFix).toContain('Remove')
  })

  it('should truncate excerpts to 100 chars', () => {
    const longText = 'A'.repeat(200)
    const segment = buildSegment({
      sourceText: longText,
      targetText: longText,
      inlineTags: {
        source: [{ type: 'ph', id: '1', position: 0 }],
        target: [],
      },
    })
    const results = checkTagIntegrity(segment, ctx)
    expect(results[0]!.sourceExcerpt.length).toBe(100)
    expect(results[0]!.targetExcerpt.length).toBe(100)
  })
})
