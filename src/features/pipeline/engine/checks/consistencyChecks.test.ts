import { describe, expect, it } from 'vitest'

import { buildSegment } from '@/test/factories'

import type { FileCheckContext, GlossaryTermRecord } from '../types'

import {
  checkKeyTermConsistency,
  checkSameSourceDiffTarget,
  checkSameTargetDiffSource,
} from './consistencyChecks'

function buildCtx(
  segments: ReturnType<typeof buildSegment>[],
  glossaryTerms: GlossaryTermRecord[] = [],
  targetLang = 'th-TH',
): FileCheckContext {
  return { segments, glossaryTerms, targetLang }
}

// ═══════════════════════════════════════════════
// Same Source → Different Target (10 tests)
// ═══════════════════════════════════════════════

describe('checkSameSourceDiffTarget', () => {
  it('should return empty when all sources are unique', () => {
    const segments = [
      buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' }),
      buildSegment({ sourceText: 'World', targetText: 'โลก' }),
    ]
    expect(checkSameSourceDiffTarget(buildCtx(segments))).toEqual([])
  })

  it('should return empty when same source has same target', () => {
    const segments = [
      buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' }),
      buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' }),
    ]
    expect(checkSameSourceDiffTarget(buildCtx(segments))).toEqual([])
  })

  it('should flag when same source has different targets', () => {
    const segments = [
      buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' }),
      buildSegment({ sourceText: 'Hello', targetText: 'หวัดดี' }),
    ]
    const results = checkSameSourceDiffTarget(buildCtx(segments))
    expect(results).toHaveLength(1)
    expect(results[0]!.category).toBe('consistency')
    expect(results[0]!.severity).toBe('minor')
  })

  it('should flag 2 variants when source maps to 3 different targets', () => {
    const segments = [
      buildSegment({ sourceText: 'OK', targetText: 'ตกลง' }),
      buildSegment({ sourceText: 'OK', targetText: 'โอเค' }),
      buildSegment({ sourceText: 'OK', targetText: 'ได้' }),
    ]
    const results = checkSameSourceDiffTarget(buildCtx(segments))
    expect(results).toHaveLength(2)
  })

  it('should use NFKC normalization for source comparison', () => {
    // Fullwidth A (U+FF21) normalizes to A under NFKC
    const segments = [
      buildSegment({ sourceText: '\uFF21', targetText: 'เอ' }),
      buildSegment({ sourceText: 'A', targetText: 'เอ' }),
    ]
    // After NFKC, both sources become "A" → same group, same target → no finding
    expect(checkSameSourceDiffTarget(buildCtx(segments))).toEqual([])
  })

  // ── Thai particle exemption ──

  it('should NOT flag Thai particle-only difference (ครับ vs ค่ะ)', () => {
    const segments = [
      buildSegment({ sourceText: 'Thank you', targetText: 'ขอบคุณครับ' }),
      buildSegment({ sourceText: 'Thank you', targetText: 'ขอบคุณค่ะ' }),
    ]
    // After stripping particles: both → "ขอบคุณ" → same → no finding
    expect(checkSameSourceDiffTarget(buildCtx(segments, [], 'th-TH'))).toEqual([])
  })

  it('should NOT flag compound Thai particle difference (นะครับ vs ค่ะ)', () => {
    const segments = [
      buildSegment({ sourceText: 'Thanks', targetText: 'ขอบคุณนะครับ' }),
      buildSegment({ sourceText: 'Thanks', targetText: 'ขอบคุณค่ะ' }),
    ]
    // After stripping: "ขอบคุณนะครับ" → "ขอบคุณ", "ขอบคุณค่ะ" → "ขอบคุณ"
    expect(checkSameSourceDiffTarget(buildCtx(segments, [], 'th-TH'))).toEqual([])
  })

  it('should flag real difference even with particles for Thai', () => {
    const segments = [
      buildSegment({ sourceText: 'Hello', targetText: 'สวัสดีครับ' }),
      buildSegment({ sourceText: 'Hello', targetText: 'หวัดดีค่ะ' }),
    ]
    // After stripping: "สวัสดี" vs "หวัดดี" → different → finding
    const results = checkSameSourceDiffTarget(buildCtx(segments, [], 'th-TH'))
    expect(results).toHaveLength(1)
  })

  it('should NOT strip particles for non-Thai languages', () => {
    const segments = [
      buildSegment({ sourceText: 'Hello', targetText: 'Halloครับ' }),
      buildSegment({ sourceText: 'Hello', targetText: 'Hallo' }),
    ]
    // de-DE target: particles NOT stripped → "Halloครับ" vs "Hallo" → finding
    const results = checkSameSourceDiffTarget(buildCtx(segments, [], 'de-DE'))
    expect(results).toHaveLength(1)
  })

  it('should handle single occurrence (no duplicate) with no finding', () => {
    const segments = [buildSegment({ sourceText: 'Unique text', targetText: 'ข้อความเดียว' })]
    expect(checkSameSourceDiffTarget(buildCtx(segments))).toEqual([])
  })
})

// ═══════════════════════════════════════════════
// Same Target → Different Source (6 tests)
// ═══════════════════════════════════════════════

describe('checkSameTargetDiffSource', () => {
  it('should return empty when all targets are unique', () => {
    const segments = [
      buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' }),
      buildSegment({ sourceText: 'World', targetText: 'โลก' }),
    ]
    expect(checkSameTargetDiffSource(buildCtx(segments))).toEqual([])
  })

  it('should return empty when same target comes from same source', () => {
    const segments = [
      buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' }),
      buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' }),
    ]
    expect(checkSameTargetDiffSource(buildCtx(segments))).toEqual([])
  })

  it('should flag when same target comes from different sources', () => {
    const segments = [
      buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' }),
      buildSegment({ sourceText: 'Hi', targetText: 'สวัสดี' }),
    ]
    const results = checkSameTargetDiffSource(buildCtx(segments))
    expect(results).toHaveLength(1)
    expect(results[0]!.category).toBe('consistency')
  })

  it('should skip empty targets', () => {
    const segments = [
      buildSegment({ sourceText: 'Hello', targetText: '' }),
      buildSegment({ sourceText: 'World', targetText: '' }),
    ]
    expect(checkSameTargetDiffSource(buildCtx(segments))).toEqual([])
  })

  it('should handle Thai particle normalization in target grouping', () => {
    const segments = [
      buildSegment({ sourceText: 'Hello', targetText: 'สวัสดีครับ' }),
      buildSegment({ sourceText: 'Hi', targetText: 'สวัสดีค่ะ' }),
    ]
    // After stripping: both → "สวัสดี" group, different sources → finding
    const results = checkSameTargetDiffSource(buildCtx(segments, [], 'th-TH'))
    expect(results).toHaveLength(1)
  })

  it('should use NFKC normalization for target comparison', () => {
    const segments = [
      buildSegment({ sourceText: 'Hello', targetText: '\uFF21' }),
      buildSegment({ sourceText: 'Hi', targetText: 'A' }),
    ]
    // After NFKC: both targets = "A", different sources → finding
    const results = checkSameTargetDiffSource(buildCtx(segments))
    expect(results).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════
// Key Term Consistency (8 tests)
// ═══════════════════════════════════════════════

describe('checkKeyTermConsistency', () => {
  const makeGlossaryTerm = (sourceTerm: string, targetTerm: string): GlossaryTermRecord => ({
    id: 'term-1',
    glossaryId: 'glossary-1',
    sourceTerm,
    targetTerm,
    caseSensitive: false,
    createdAt: new Date(),
  })

  it('should return empty when no glossary terms', () => {
    const segments = [buildSegment({ sourceText: 'Hello', targetText: 'สวัสดี' })]
    expect(checkKeyTermConsistency(buildCtx(segments, []))).toEqual([])
  })

  it('should return empty when term appears in only one segment', () => {
    const term = makeGlossaryTerm('database', 'ฐานข้อมูล')
    const segments = [
      buildSegment({ sourceText: 'The database is ready', targetText: 'ฐานข้อมูลพร้อม' }),
    ]
    expect(checkKeyTermConsistency(buildCtx(segments, [term]))).toEqual([])
  })

  it('should return empty when term is used consistently', () => {
    const term = makeGlossaryTerm('database', 'ฐานข้อมูล')
    const segments = [
      buildSegment({ sourceText: 'The database is ready', targetText: 'ฐานข้อมูลพร้อม' }),
      buildSegment({ sourceText: 'Check the database', targetText: 'ตรวจสอบฐานข้อมูล' }),
    ]
    expect(checkKeyTermConsistency(buildCtx(segments, [term]))).toEqual([])
  })

  it('should flag when term is used inconsistently', () => {
    const term = makeGlossaryTerm('database', 'ฐานข้อมูล')
    const segments = [
      buildSegment({ sourceText: 'The database is ready', targetText: 'ฐานข้อมูลพร้อม' }),
      buildSegment({ sourceText: 'Check the database', targetText: 'ตรวจสอบดาต้าเบส' }),
    ]
    const results = checkKeyTermConsistency(buildCtx(segments, [term]))
    expect(results).toHaveLength(1)
    expect(results[0]!.severity).toBe('major')
    expect(results[0]!.category).toBe('consistency')
    expect(results[0]!.description).toContain('database')
  })

  it('should flag multiple inconsistent segments', () => {
    const term = makeGlossaryTerm('file', 'ไฟล์')
    const segments = [
      buildSegment({ sourceText: 'Open the file', targetText: 'เปิดไฟล์' }),
      buildSegment({ sourceText: 'Save the file', targetText: 'บันทึกแฟ้ม' }),
      buildSegment({ sourceText: 'Delete the file', targetText: 'ลบเอกสาร' }),
    ]
    const results = checkKeyTermConsistency(buildCtx(segments, [term]))
    expect(results).toHaveLength(2) // 2 segments without "ไฟล์"
  })

  it('should be case-insensitive when matching source term', () => {
    const term = makeGlossaryTerm('API', 'เอพีไอ')
    const segments = [
      buildSegment({ sourceText: 'The API is ready', targetText: 'เอพีไอพร้อม' }),
      buildSegment({ sourceText: 'Use the api endpoint', targetText: 'ใช้จุดเชื่อมต่อ' }),
    ]
    const results = checkKeyTermConsistency(buildCtx(segments, [term]))
    expect(results).toHaveLength(1)
  })

  it('should handle multiple glossary terms', () => {
    const terms = [makeGlossaryTerm('file', 'ไฟล์'), makeGlossaryTerm('folder', 'โฟลเดอร์')]
    // Give second term a different id
    terms[1] = { ...terms[1]!, id: 'term-2' }
    const segments = [
      buildSegment({ sourceText: 'Open the file in the folder', targetText: 'เปิดไฟล์ในโฟลเดอร์' }),
      buildSegment({
        sourceText: 'Save the file to the folder',
        targetText: 'บันทึกไฟล์ไปที่โฟลเดอร์',
      }),
    ]
    // All consistent
    expect(checkKeyTermConsistency(buildCtx(segments, terms))).toEqual([])
  })

  it('should return empty when source term not found in any segment', () => {
    const term = makeGlossaryTerm('blockchain', 'บล็อกเชน')
    const segments = [buildSegment({ sourceText: 'Hello world', targetText: 'สวัสดีโลก' })]
    expect(checkKeyTermConsistency(buildCtx(segments, [term]))).toEqual([])
  })

  // ── H4: caseSensitive: true path ──

  it('should match source term with exact case when caseSensitive is true', () => {
    const term: GlossaryTermRecord = {
      id: 'term-cs-1',
      glossaryId: 'glossary-1',
      sourceTerm: 'Database',
      targetTerm: 'ฐานข้อมูล',
      caseSensitive: true,
      createdAt: new Date(),
    }
    const segments = [
      buildSegment({ sourceText: 'The Database is ready', targetText: 'ฐานข้อมูลพร้อม' }),
      buildSegment({ sourceText: 'Check the Database', targetText: 'ตรวจสอบดาต้าเบส' }),
    ]
    // Both segments contain "Database" (exact case) → term found in both
    // Seg 1 target has "ฐานข้อมูล", seg 2 does not → 1 finding
    const results = checkKeyTermConsistency(buildCtx(segments, [term]))
    expect(results).toHaveLength(1)
    expect(results[0]!.category).toBe('consistency')
  })

  it('should NOT match source when case differs and caseSensitive is true', () => {
    const term: GlossaryTermRecord = {
      id: 'term-cs-2',
      glossaryId: 'glossary-1',
      sourceTerm: 'Database',
      targetTerm: 'ฐานข้อมูล',
      caseSensitive: true,
      createdAt: new Date(),
    }
    const segments = [
      // "database" (lowercase d) — does NOT match caseSensitive "Database"
      buildSegment({ sourceText: 'The database is ready', targetText: 'ฐานข้อมูลพร้อม' }),
      buildSegment({ sourceText: 'Check the database', targetText: 'ตรวจสอบดาต้าเบส' }),
    ]
    // Neither segment matches "Database" (exact case) → matchingSegments < 2 → no findings
    expect(checkKeyTermConsistency(buildCtx(segments, [term]))).toEqual([])
  })

  it('should apply caseSensitive target match when caseSensitive is true', () => {
    const term: GlossaryTermRecord = {
      id: 'term-cs-3',
      glossaryId: 'glossary-1',
      sourceTerm: 'API',
      targetTerm: 'เอพีไอ',
      caseSensitive: true,
      createdAt: new Date(),
    }
    const segments = [
      buildSegment({ sourceText: 'The API is ready', targetText: 'เอพีไอพร้อม' }),
      buildSegment({ sourceText: 'Use the API', targetText: 'ใช้เอพีไอ' }),
    ]
    // Both use correct target term consistently
    expect(checkKeyTermConsistency(buildCtx(segments, [term]))).toEqual([])
  })
})
