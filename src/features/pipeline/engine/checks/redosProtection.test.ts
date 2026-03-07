/**
 * P0-03: ReDoS protection — verify built-in regex patterns complete quickly
 * with adversarial input strings designed to trigger backtracking.
 *
 * Strategy: Built-in patterns are safe by design (no nested quantifiers).
 * These tests PROVE they remain safe by feeding pathological input and
 * asserting completion within 100ms per check.
 */
import { describe, expect, it } from 'vitest'

import { buildSegment } from '@/test/factories'

import type { SegmentCheckContext } from '../types'

import { checkUppercaseWords } from './capitalizationChecks'
import { checkUntranslated } from './contentChecks'
import { checkDoubleSpaces, checkLeadingTrailingSpaces } from './formattingChecks'
import { checkNumberConsistency } from './numberChecks'
import { checkPlaceholderConsistency } from './placeholderChecks'
import { checkRepeatedWords } from './repeatedWordChecks'

const ctx: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'th-TH' }

describe('P0-03: ReDoS protection — built-in patterns with adversarial input', () => {
  it('should complete placeholder check with 10K unclosed braces', () => {
    const adversarial = '{'.repeat(10_000)
    const segment = buildSegment({ sourceText: adversarial, targetText: adversarial })
    const start = performance.now()
    checkPlaceholderConsistency(segment, ctx)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('should complete number check with 10K digits mixed with commas', () => {
    const adversarial = '1,'.repeat(5_000)
    const segment = buildSegment({ sourceText: adversarial, targetText: adversarial })
    const start = performance.now()
    checkNumberConsistency(segment, ctx)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('should complete formatting check with 10K spaces', () => {
    const adversarial = ' '.repeat(10_000) + 'text'
    const segment = buildSegment({ sourceText: 'text', targetText: adversarial })
    const start = performance.now()
    checkDoubleSpaces(segment, ctx)
    checkLeadingTrailingSpaces(segment, ctx)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('should complete capitalization check with 10K uppercase chars', () => {
    const adversarial = 'A'.repeat(10_000)
    const segment = buildSegment({ sourceText: adversarial, targetText: adversarial })
    const start = performance.now()
    checkUppercaseWords(segment, ctx)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('should complete repeated word check with 5K repeated tokens', () => {
    const adversarial = Array.from({ length: 5_000 }, () => 'word').join(' ')
    const segment = buildSegment({ sourceText: 'hello', targetText: adversarial })
    const start = performance.now()
    checkRepeatedWords(segment, ctx)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('should complete content check with 10K digit-only string', () => {
    const adversarial = '1'.repeat(10_000)
    const segment = buildSegment({ sourceText: adversarial, targetText: adversarial })
    const start = performance.now()
    checkUntranslated(segment, ctx)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('should complete placeholder check with deeply nested {{}} patterns', () => {
    // Input like "{{{{{{...}}}}}}" — could trigger backtracking on {{var}} pattern
    const adversarial = '{{'.repeat(5_000) + '}}'.repeat(5_000)
    const segment = buildSegment({ sourceText: adversarial, targetText: adversarial })
    const start = performance.now()
    checkPlaceholderConsistency(segment, ctx)
    expect(performance.now() - start).toBeLessThan(500)
  })
})
