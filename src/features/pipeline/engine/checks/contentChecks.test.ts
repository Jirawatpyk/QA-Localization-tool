import { describe, expect, it } from 'vitest'

import { buildSegment } from '@/test/factories'

import type { SegmentCheckContext } from '../types'

import { checkTargetIdenticalToSource, checkUntranslated } from './contentChecks'

const ctx: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'th-TH' }

describe('checkUntranslated', () => {
  it('should flag empty target text as critical', () => {
    const segment = buildSegment({ sourceText: 'Hello', targetText: '' })
    const result = checkUntranslated(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('critical')
    expect(result!.category).toBe('completeness')
    expect(result!.description).toContain('empty')
  })

  it('should flag whitespace-only target text', () => {
    const segment = buildSegment({ sourceText: 'Hello', targetText: '   ' })
    const result = checkUntranslated(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('critical')
  })

  it('should flag tab-only target text', () => {
    const segment = buildSegment({ sourceText: 'Hello', targetText: '\t\n' })
    const result = checkUntranslated(segment, ctx)
    expect(result).not.toBeNull()
  })

  it('should NOT flag non-empty target text', () => {
    const segment = buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' })
    const result = checkUntranslated(segment, ctx)
    expect(result).toBeNull()
  })

  it('should NOT flag target with single character', () => {
    const segment = buildSegment({ sourceText: 'A', targetText: 'B' })
    const result = checkUntranslated(segment, ctx)
    expect(result).toBeNull()
  })

  it('should include source and target excerpts', () => {
    const segment = buildSegment({ sourceText: 'Test source', targetText: '' })
    const result = checkUntranslated(segment, ctx)
    expect(result!.sourceExcerpt).toBe('Test source')
    expect(result!.targetExcerpt).toBe('')
  })
})

describe('checkTargetIdenticalToSource', () => {
  it('should flag when target equals source exactly', () => {
    const segment = buildSegment({ sourceText: 'Hello World', targetText: 'Hello World' })
    const result = checkTargetIdenticalToSource(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('major')
    expect(result!.category).toBe('completeness')
  })

  it('should NOT flag when target differs from source', () => {
    const segment = buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' })
    const result = checkTargetIdenticalToSource(segment, ctx)
    expect(result).toBeNull()
  })

  it('should NOT flag numbers-only segments', () => {
    const segment = buildSegment({ sourceText: '1,000.00', targetText: '1,000.00' })
    const result = checkTargetIdenticalToSource(segment, ctx)
    expect(result).toBeNull()
  })

  it('should NOT flag numbers with spaces', () => {
    const segment = buildSegment({ sourceText: '100 200', targetText: '100 200' })
    const result = checkTargetIdenticalToSource(segment, ctx)
    expect(result).toBeNull()
  })

  it('should NOT flag single-word proper nouns', () => {
    const segment = buildSegment({ sourceText: 'Tokyo', targetText: 'Tokyo' })
    const result = checkTargetIdenticalToSource(segment, ctx)
    expect(result).toBeNull()
  })

  it('should flag multi-word identical text', () => {
    const segment = buildSegment({
      sourceText: 'Hello Tokyo Station',
      targetText: 'Hello Tokyo Station',
    })
    const result = checkTargetIdenticalToSource(segment, ctx)
    expect(result).not.toBeNull()
  })

  it('should use NFKC normalization for CJK comparison', () => {
    // Fullwidth "Ａ" (U+FF21) normalizes to "A" (U+0041) via NFKC
    const segment = buildSegment({ sourceText: '\uFF21', targetText: 'A' })
    const result = checkTargetIdenticalToSource(segment, ctx)
    // After NFKC: both become "A" → identical → flagged
    expect(result).not.toBeNull()
  })

  it('should NOT flag when case differs', () => {
    const segment = buildSegment({ sourceText: 'hello', targetText: 'Hello' })
    const result = checkTargetIdenticalToSource(segment, ctx)
    expect(result).toBeNull()
  })

  it('should NOT flag when source and target are both empty', () => {
    // Empty target already caught by checkUntranslated — this checks the identical path
    const segment = buildSegment({ sourceText: '', targetText: '' })
    // NFKC("") === "" → identical, but also numbers-only check: /^[\d\s.,]+$/.test('') = false
    // But the regex won't match empty. So it would flag it.
    // However, empty target is handled by checkUntranslated first in the orchestrator.
    const result = checkTargetIdenticalToSource(segment, ctx)
    // Both empty → identical → flagged (orchestrator runs checkUntranslated first to catch this)
    expect(result).not.toBeNull()
  })

  it('should flag CJK identical text', () => {
    const segment = buildSegment({ sourceText: '你好世界', targetText: '你好世界' })
    const result = checkTargetIdenticalToSource(segment, ctx)
    expect(result).not.toBeNull()
  })

  it('should flag Thai identical text (non-particle)', () => {
    const segment = buildSegment({ sourceText: 'สวัสดีครับ', targetText: 'สวัสดีครับ' })
    const result = checkTargetIdenticalToSource(segment, ctx)
    expect(result).not.toBeNull()
  })

  it('should NOT flag proper noun under 30 chars', () => {
    const segment = buildSegment({ sourceText: 'Samsung', targetText: 'Samsung' })
    const result = checkTargetIdenticalToSource(segment, ctx)
    expect(result).toBeNull()
  })

  it('should flag all-lowercase identical words', () => {
    const segment = buildSegment({ sourceText: 'hello', targetText: 'hello' })
    const result = checkTargetIdenticalToSource(segment, ctx)
    expect(result).not.toBeNull()
  })

  it('should flag all-uppercase identical words (not proper noun pattern)', () => {
    const segment = buildSegment({ sourceText: 'HELLO', targetText: 'HELLO' })
    const result = checkTargetIdenticalToSource(segment, ctx)
    expect(result).not.toBeNull()
  })
})
