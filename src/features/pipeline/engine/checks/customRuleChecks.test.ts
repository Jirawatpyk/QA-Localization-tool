import { describe, expect, it, vi } from 'vitest'

import { buildSegment } from '@/test/factories'

import type { SegmentCheckContext, SuppressionRuleRecord } from '../types'

import { checkCustomRules } from './customRuleChecks'

// Mock logger to capture warnings without console output
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const ctx: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'th-TH' }

function makeCustomRule(pattern: string, reason: string): SuppressionRuleRecord {
  return {
    id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
    projectId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
    tenantId: 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f',
    pattern,
    category: 'custom_rule',
    scope: 'all',
    duration: 'until_improved',
    reason,
    createdBy: 'd4e5f6a1-b2c3-4d4e-bf5a-6b7c8d9e0f1a',
    isActive: true,
    fileId: null,
    sourceLang: null,
    targetLang: null,
    matchCount: 0,
    createdAt: new Date(),
  }
}

describe('checkCustomRules', () => {
  it('should return empty when no custom rules', () => {
    const segment = buildSegment({ targetText: 'สวัสดี' })
    expect(checkCustomRules(segment, [], ctx)).toEqual([])
  })

  it('should flag when regex matches target text', () => {
    const segment = buildSegment({ targetText: 'Do not use TODO here' })
    const rules = [makeCustomRule('TODO', 'TODO markers should not appear in translations')]
    const results = checkCustomRules(segment, rules, ctx)
    expect(results).toHaveLength(1)
    expect(results[0]!.category).toBe('custom_rule')
    expect(results[0]!.description).toBe('TODO markers should not appear in translations')
  })

  it('should return empty when regex does not match', () => {
    const segment = buildSegment({ targetText: 'สวัสดีโลก' })
    const rules = [makeCustomRule('TODO', 'No TODOs')]
    expect(checkCustomRules(segment, rules, ctx)).toEqual([])
  })

  it('should be case-insensitive', () => {
    const segment = buildSegment({ targetText: 'This has a todo item' })
    const rules = [makeCustomRule('TODO', 'No TODOs')]
    const results = checkCustomRules(segment, rules, ctx)
    expect(results).toHaveLength(1)
  })

  it('should skip invalid regex gracefully', () => {
    const segment = buildSegment({ targetText: 'test' })
    const rules = [makeCustomRule('[invalid(', 'Bad regex')]
    const results = checkCustomRules(segment, rules, ctx)
    expect(results).toEqual([]) // skipped, no crash
  })

  it('should handle multiple rules', () => {
    const segment = buildSegment({ targetText: 'Contains TODO and FIXME markers' })
    const rules = [
      makeCustomRule('TODO', 'No TODOs'),
      { ...makeCustomRule('FIXME', 'No FIXMEs'), id: 'rule-2' },
    ]
    const results = checkCustomRules(segment, rules, ctx)
    expect(results).toHaveLength(2)
  })

  it('should match regex patterns (not just literal strings)', () => {
    const segment = buildSegment({ targetText: 'Version 1.2.3 is released' })
    const rules = [makeCustomRule('\\d+\\.\\d+\\.\\d+', 'Version numbers should be localized')]
    const results = checkCustomRules(segment, rules, ctx)
    expect(results).toHaveLength(1)
  })

  it('should set severity to major', () => {
    const segment = buildSegment({ targetText: 'TODO: fix this' })
    const rules = [makeCustomRule('TODO', 'No TODOs')]
    const results = checkCustomRules(segment, rules, ctx)
    expect(results[0]!.severity).toBe('major')
  })

  it('should set suggestedFix to null', () => {
    const segment = buildSegment({ targetText: 'TODO: fix' })
    const rules = [makeCustomRule('TODO', 'No TODOs')]
    const results = checkCustomRules(segment, rules, ctx)
    expect(results[0]!.suggestedFix).toBeNull()
  })

  it('should include segmentId in result', () => {
    const segment = buildSegment({ id: 'test-seg', targetText: 'TODO' })
    const rules = [makeCustomRule('TODO', 'No TODOs')]
    const results = checkCustomRules(segment, rules, ctx)
    expect(results[0]!.segmentId).toBe('test-seg')
  })

  // ── H2: MAX_CUSTOM_REGEX_LENGTH boundary tests ──

  it('should allow pattern at exactly MAX_CUSTOM_REGEX_LENGTH (500 chars)', () => {
    // Guard is `> MAX_CUSTOM_REGEX_LENGTH`, not `>=` — exactly 500 is allowed.
    // Pattern: 'TODO' (4 chars) + '(?:)' * 124 (496 chars) = exactly 500 chars.
    // '(?:)' is a non-capturing empty group — matches empty string (no-op suffix).
    const segment = buildSegment({ targetText: 'Do not use TODO here' })
    const pattern500 = 'TODO' + '(?:)'.repeat(124) // 4 + 496 = 500 chars
    expect(pattern500.length).toBe(500) // guard: ensure we built it right
    const rules = [makeCustomRule(pattern500, 'Exact boundary pattern')]
    const results = checkCustomRules(segment, rules, ctx)
    // 500 <= MAX (not >) → NOT skipped → compiled → matches "TODO" in target
    expect(results).toHaveLength(1)
  })

  it('should skip pattern of 501 chars (exceeds MAX_CUSTOM_REGEX_LENGTH)', () => {
    const segment = buildSegment({ targetText: 'aaa' })
    const pattern501 = 'a'.repeat(501)
    const rules = [makeCustomRule(pattern501, 'Over boundary — should be skipped')]
    const results = checkCustomRules(segment, rules, ctx)
    // 501 > 500 → skipped → no result
    expect(results).toEqual([])
  })

  // ── P0-03: ReDoS defense tests ──

  it('should gracefully skip regex that throws during execution', () => {
    // regex.test() wrapped in try-catch — any V8 error is caught and skipped
    const segment = buildSegment({ targetText: 'test' })
    const rules = [makeCustomRule('(?:', 'Broken group')]
    const results = checkCustomRules(segment, rules, ctx)
    expect(results).toEqual([]) // invalid regex → skipped
  })
})

// ── TA: Coverage Gap Tests — customRuleChecks ──

describe('TA: Coverage Gap Tests — customRuleChecks', () => {
  // G3 (P1): Empty regex pattern "" — now skipped to prevent false positives
  // Fix: empty pattern guard added before RegExp construction
  it('should skip empty pattern and return no findings (G3 — fixed)', () => {
    const segment = buildSegment({ targetText: 'any text at all' })
    const rules = [makeCustomRule('', 'Empty pattern should be skipped')]
    const results = checkCustomRules(segment, rules, ctx)
    expect(results).toEqual([])
  })

  it('should skip empty pattern even with empty target (G3 variant)', () => {
    const segment = buildSegment({ targetText: '' })
    const rules = [makeCustomRule('', 'Catches everything')]
    const results = checkCustomRules(segment, rules, ctx)
    expect(results).toEqual([])
  })

  // G33 (P2): ReDoS catastrophic backtracking pattern "(a+)+b" — under 500 chars
  // DEFENSIVE: V8 has backtracking limits. Code wraps regex.test() in try-catch.
  // Pattern compiles fine but may timeout on pathological input.
  it('should not crash on ReDoS pattern (a+)+b with safe input (G33)', () => {
    const segment = buildSegment({ targetText: 'aaab' })
    const rules = [makeCustomRule('(a+)+b', 'ReDoS pattern')]
    const results = checkCustomRules(segment, rules, ctx)
    // Pattern matches "aaab" normally — only pathological with "aaa...a" (no 'b')
    expect(results).toHaveLength(1)
  })

  it('should handle ReDoS pattern with non-matching input without hanging (G33)', () => {
    // Short non-matching input — V8 handles quickly even with catastrophic pattern
    const segment = buildSegment({ targetText: 'a'.repeat(20) + 'c' })
    const rules = [makeCustomRule('(a+)+b', 'ReDoS pattern')]
    const results = checkCustomRules(segment, rules, ctx)
    // No match (no 'b') — should return empty, not hang
    expect(results).toEqual([])
  })
})
