import { describe, expect, it } from 'vitest'

import { buildSegment } from '@/test/factories'

import type { SegmentCheckContext } from '../types'

import { checkPlaceholderConsistency } from './placeholderChecks'

const ctx: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'th-TH' }

describe('checkPlaceholderConsistency', () => {
  // ── No placeholders ──

  it('should return null when no placeholders in source or target', () => {
    const segment = buildSegment({ sourceText: 'Hello world', targetText: 'สวัสดีโลก' })
    expect(checkPlaceholderConsistency(segment, ctx)).toBeNull()
  })

  // ── Matching placeholders ──

  it('should return null when {0} placeholder matches', () => {
    const segment = buildSegment({
      sourceText: 'Hello {0}',
      targetText: 'สวัสดี {0}',
    })
    expect(checkPlaceholderConsistency(segment, ctx)).toBeNull()
  })

  it('should return null when %s placeholder matches', () => {
    const segment = buildSegment({
      sourceText: 'Hello %s',
      targetText: 'สวัสดี %s',
    })
    expect(checkPlaceholderConsistency(segment, ctx)).toBeNull()
  })

  it('should return null when %d placeholder matches', () => {
    const segment = buildSegment({
      sourceText: '%d items',
      targetText: '%d รายการ',
    })
    expect(checkPlaceholderConsistency(segment, ctx)).toBeNull()
  })

  it('should return null when {{var}} placeholder matches', () => {
    const segment = buildSegment({
      sourceText: 'Hello {{userName}}',
      targetText: 'สวัสดี {{userName}}',
    })
    expect(checkPlaceholderConsistency(segment, ctx)).toBeNull()
  })

  it('should return null when ${name} placeholder matches', () => {
    const segment = buildSegment({
      sourceText: 'Welcome ${user}',
      targetText: 'ยินดีต้อนรับ ${user}',
    })
    expect(checkPlaceholderConsistency(segment, ctx)).toBeNull()
  })

  it('should return null when %1$s positional placeholder matches', () => {
    const segment = buildSegment({
      sourceText: '%1$s and %2$d',
      targetText: '%1$s และ %2$d',
    })
    expect(checkPlaceholderConsistency(segment, ctx)).toBeNull()
  })

  it('should return null when %@ placeholder matches', () => {
    const segment = buildSegment({
      sourceText: 'Hello %@',
      targetText: 'สวัสดี %@',
    })
    expect(checkPlaceholderConsistency(segment, ctx)).toBeNull()
  })

  // ── Missing placeholders ──

  it('should flag missing placeholder {0} in target', () => {
    const segment = buildSegment({
      sourceText: 'Hello {0}',
      targetText: 'สวัสดี',
    })
    const result = checkPlaceholderConsistency(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('critical')
    expect(result!.category).toBe('placeholder_integrity')
    expect(result!.description).toContain('{0}')
    expect(result!.description).toContain('missing')
  })

  it('should flag missing %s in target', () => {
    const segment = buildSegment({
      sourceText: 'File %s not found',
      targetText: 'ไม่พบไฟล์',
    })
    const result = checkPlaceholderConsistency(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('%s')
  })

  it('should flag missing {{var}} in target', () => {
    const segment = buildSegment({
      sourceText: 'Hello {{name}}',
      targetText: 'สวัสดี',
    })
    const result = checkPlaceholderConsistency(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('{{name}}')
  })

  // ── Extra placeholders ──

  it('should flag extra placeholder in target not in source', () => {
    const segment = buildSegment({
      sourceText: 'Hello world',
      targetText: 'สวัสดี {0} โลก',
    })
    const result = checkPlaceholderConsistency(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('extra')
    expect(result!.description).toContain('{0}')
  })

  // ── Mixed placeholders ──

  it('should handle multiple placeholder types in one segment', () => {
    const segment = buildSegment({
      sourceText: '{0} items (%d total, {{count}} max)',
      targetText: '{0} รายการ (%d ทั้งหมด, {{count}} สูงสุด)',
    })
    expect(checkPlaceholderConsistency(segment, ctx)).toBeNull()
  })

  it('should report both missing and extra when placeholders differ', () => {
    const segment = buildSegment({
      sourceText: 'Hello {0}',
      targetText: 'สวัสดี {1}',
    })
    const result = checkPlaceholderConsistency(segment, ctx)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('missing')
    expect(result!.description).toContain('extra')
  })

  // ── Edge cases ──

  it('should include suggestedFix for missing placeholders', () => {
    const segment = buildSegment({
      sourceText: 'Error: %s',
      targetText: 'ข้อผิดพลาด:',
    })
    const result = checkPlaceholderConsistency(segment, ctx)
    expect(result!.suggestedFix).toContain('Add')
  })
})
