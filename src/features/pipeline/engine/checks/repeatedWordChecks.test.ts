import { describe, expect, it } from 'vitest'

import { buildSegment } from '@/test/factories'

import type { SegmentCheckContext } from '../types'

import { checkRepeatedWords } from './repeatedWordChecks'

const ctx: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'th-TH' }
const ctxEn: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'en-US' }

describe('checkRepeatedWords', () => {
  // ── No repeated words ──

  it('should return null when target has no repeated words', () => {
    const segment = buildSegment({ sourceText: 'Hello world', targetText: 'สวัสดีโลก' })
    expect(checkRepeatedWords(segment, ctx)).toBeNull()
  })

  it('should return null when target is empty', () => {
    const segment = buildSegment({ sourceText: 'Hello', targetText: '' })
    expect(checkRepeatedWords(segment, ctx)).toBeNull()
  })

  it('should return null when target is whitespace only', () => {
    const segment = buildSegment({ sourceText: 'Hello', targetText: '   ' })
    expect(checkRepeatedWords(segment, ctx)).toBeNull()
  })

  it('should return null for single-word target', () => {
    const segment = buildSegment({ sourceText: 'Hello', targetText: 'Hello' })
    expect(checkRepeatedWords(segment, ctx)).toBeNull()
  })

  it('should return null for different adjacent words', () => {
    const segment = buildSegment({
      sourceText: 'Quick brown fox',
      targetText: 'Quick brown fox',
    })
    expect(checkRepeatedWords(segment, ctxEn)).toBeNull()
  })

  // ── Repeated words detected ──

  it('should flag repeated word in English target', () => {
    const segment = buildSegment({
      sourceText: 'The translation is correct',
      targetText: 'The the translation is correct',
    })
    const result = checkRepeatedWords(segment, ctxEn)
    expect(result).not.toBeNull()
    expect(result!.category).toBe('repeated_word')
    expect(result!.severity).toBe('minor')
    expect(result!.description).toContain('the')
  })

  it('should flag repeated word regardless of source (source repetition is NOT flagged)', () => {
    const segment = buildSegment({
      sourceText: 'the the source is intentional',
      targetText: 'this this target has a typo',
    })
    const result = checkRepeatedWords(segment, ctxEn)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('this')
  })

  it('should include segmentId in result', () => {
    const segment = buildSegment({
      id: 'test-seg-id',
      sourceText: 'Hello',
      targetText: 'Hello hello world',
    })
    const result = checkRepeatedWords(segment, ctxEn)
    expect(result!.segmentId).toBe('test-seg-id')
  })

  it('should flag repeated word at end of sentence', () => {
    const segment = buildSegment({
      sourceText: 'Please confirm',
      targetText: 'Please confirm confirm',
    })
    const result = checkRepeatedWords(segment, ctxEn)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('confirm')
  })

  it('should include suggestedFix with the duplicated word', () => {
    const segment = buildSegment({
      sourceText: 'Step one',
      targetText: 'Step step one',
    })
    const result = checkRepeatedWords(segment, ctxEn)
    expect(result!.suggestedFix).toContain('step')
  })

  // ── Case-insensitive matching ──

  it('should match case-insensitively ("The the")', () => {
    const segment = buildSegment({
      sourceText: 'The result',
      targetText: 'The the result',
    })
    const result = checkRepeatedWords(segment, ctxEn)
    expect(result).not.toBeNull()
  })

  it('should match case-insensitively ("WORD word")', () => {
    const segment = buildSegment({
      sourceText: 'Important note',
      targetText: 'IMPORTANT important note',
    })
    const result = checkRepeatedWords(segment, ctxEn)
    expect(result).not.toBeNull()
  })

  // ── False positive guards ──

  it('should NOT flag different words that look similar ("there their")', () => {
    const segment = buildSegment({
      sourceText: 'Look there',
      targetText: 'Look there their',
    })
    expect(checkRepeatedWords(segment, ctxEn)).toBeNull()
  })

  it('should NOT flag partial word matches ("test testing")', () => {
    const segment = buildSegment({
      sourceText: 'Run the test',
      targetText: 'Run the test testing',
    })
    expect(checkRepeatedWords(segment, ctxEn)).toBeNull()
  })

  it('should flag single-character repeated words ("a a")', () => {
    // Single chars like "a" are matched — "a a" is still a repeated word
    const segment = buildSegment({
      sourceText: 'Item a',
      targetText: 'Item a a result',
    })
    const result = checkRepeatedWords(segment, ctxEn)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('a')
  })

  it('should NOT flag Thai text (Thai chars not matched by \\w+)', () => {
    // Thai uses non-ASCII chars — \w+ (Latin/digit/underscore) does not match them
    const segment = buildSegment({
      sourceText: 'Step one',
      targetText: 'ขั้นตอน ขั้นตอน หนึ่ง',
    })
    expect(checkRepeatedWords(segment, ctx)).toBeNull()
  })

  // ── Number repetition ──

  it('should flag repeated numbers in target', () => {
    const segment = buildSegment({
      sourceText: 'Page 5',
      targetText: 'Page 5 5',
    })
    const result = checkRepeatedWords(segment, ctxEn)
    expect(result).not.toBeNull()
    expect(result!.description).toContain('5')
  })
})
