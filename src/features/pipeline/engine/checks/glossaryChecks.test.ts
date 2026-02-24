import { describe, expect, it, vi } from 'vitest'

import type { GlossaryCheckResult } from '@/features/glossary/matching/matchingTypes'
import { buildSegment } from '@/test/factories'

import type { GlossaryTermRecord, SegmentCheckContext } from '../types'

import { checkGlossaryComplianceRule } from './glossaryChecks'
import type { GlossaryCheckFn } from './glossaryChecks'

const ctx: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'th-TH' }

const GLOSSARY_UUID = 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b'
const TERM_UUID_1 = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
const TERM_UUID_2 = 'a2b3c4d5-e6f7-4a8b-9c0d-1e2f3a4b5c6d'

function makeGlossaryTerm(id: string, sourceTerm: string, targetTerm: string): GlossaryTermRecord {
  return {
    id,
    glossaryId: GLOSSARY_UUID,
    sourceTerm,
    targetTerm,
    caseSensitive: false,
    createdAt: new Date(),
  }
}

function mockCheckFn(result: GlossaryCheckResult): GlossaryCheckFn {
  return vi.fn((..._args: unknown[]) => Promise.resolve(result)) as unknown as GlossaryCheckFn
}

describe('checkGlossaryComplianceRule', () => {
  it('should return empty when no glossary terms match source', async () => {
    const segment = buildSegment({ sourceText: 'Hello world', targetText: 'สวัสดีโลก' })
    const terms = [makeGlossaryTerm(TERM_UUID_1, 'database', 'ฐานข้อมูล')]
    const checkFn = mockCheckFn({ matches: [], missingTerms: [], lowConfidenceMatches: [] })
    const results = await checkGlossaryComplianceRule(segment, terms, ctx, checkFn)
    expect(results).toEqual([])
    // checkFn should NOT have been called (pre-filter removed all terms)
    expect(checkFn).not.toHaveBeenCalled()
  })

  it('should call checkFn with pre-filtered terms', async () => {
    const segment = buildSegment({ sourceText: 'Use the database', targetText: 'ใช้ฐานข้อมูล' })
    const terms = [
      makeGlossaryTerm(TERM_UUID_1, 'database', 'ฐานข้อมูล'),
      makeGlossaryTerm(TERM_UUID_2, 'server', 'เซิร์ฟเวอร์'),
    ]
    const checkFn = mockCheckFn({ matches: [], missingTerms: [], lowConfidenceMatches: [] })
    await checkGlossaryComplianceRule(segment, terms, ctx, checkFn)
    // Only 'database' should be passed (pre-filtered)
    expect(checkFn).toHaveBeenCalledTimes(1)
    const calledTerms = (checkFn as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as GlossaryTermRecord[]
    expect(calledTerms).toHaveLength(1)
    expect(calledTerms[0]!.sourceTerm).toBe('database')
  })

  it('should return empty when all terms are found (no missingTerms)', async () => {
    const segment = buildSegment({ sourceText: 'Use the database', targetText: 'ใช้ฐานข้อมูล' })
    const terms = [makeGlossaryTerm(TERM_UUID_1, 'database', 'ฐานข้อมูล')]
    const checkFn = mockCheckFn({ matches: [], missingTerms: [], lowConfidenceMatches: [] })
    const results = await checkGlossaryComplianceRule(segment, terms, ctx, checkFn)
    expect(results).toEqual([])
  })

  it('should create finding for each missing term', async () => {
    const segment = buildSegment({ sourceText: 'Use the database', targetText: 'ใช้ดาต้าเบส' })
    const terms = [makeGlossaryTerm(TERM_UUID_1, 'database', 'ฐานข้อมูล')]
    const checkFn = mockCheckFn({
      matches: [],
      missingTerms: [TERM_UUID_1],
      lowConfidenceMatches: [],
    })
    const results = await checkGlossaryComplianceRule(segment, terms, ctx, checkFn)
    expect(results).toHaveLength(1)
    expect(results[0]!.category).toBe('glossary_compliance')
    expect(results[0]!.severity).toBe('major')
    expect(results[0]!.description).toContain('database')
    expect(results[0]!.description).toContain('ฐานข้อมูล')
    expect(results[0]!.suggestedFix).toBe('ฐานข้อมูล')
  })

  it('should create multiple findings for multiple missing terms', async () => {
    const segment = buildSegment({
      sourceText: 'Check database and server',
      targetText: 'ตรวจสอบดาต้าเบสและเซิร์ฟ',
    })
    const terms = [
      makeGlossaryTerm(TERM_UUID_1, 'database', 'ฐานข้อมูล'),
      makeGlossaryTerm(TERM_UUID_2, 'server', 'เซิร์ฟเวอร์'),
    ]
    const checkFn = mockCheckFn({
      matches: [],
      missingTerms: [TERM_UUID_1, TERM_UUID_2],
      lowConfidenceMatches: [],
    })
    const results = await checkGlossaryComplianceRule(segment, terms, ctx, checkFn)
    expect(results).toHaveLength(2)
  })

  it('should NOT create findings for lowConfidenceMatches', async () => {
    const segment = buildSegment({ sourceText: 'Use the database', targetText: 'ใช้ฐานข้อมูล' })
    const terms = [makeGlossaryTerm(TERM_UUID_1, 'database', 'ฐานข้อมูล')]
    const checkFn = mockCheckFn({
      matches: [],
      missingTerms: [],
      lowConfidenceMatches: [
        {
          termId: TERM_UUID_1,
          sourceTerm: 'database',
          expectedTarget: 'ฐานข้อมูล',
          foundText: 'ฐานข้อมูล',
          position: 3,
          boundaryConfidence: 'low',
        },
      ],
    })
    const results = await checkGlossaryComplianceRule(segment, terms, ctx, checkFn)
    expect(results).toEqual([])
  })

  it('should build SegmentContext from segment fields', async () => {
    const segment = buildSegment({
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      projectId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
      tenantId: 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f',
      sourceText: 'Check database',
      targetText: 'ตรวจสอบ',
    })
    const terms = [makeGlossaryTerm(TERM_UUID_1, 'database', 'ฐานข้อมูล')]
    const checkFn = mockCheckFn({
      matches: [],
      missingTerms: [TERM_UUID_1],
      lowConfidenceMatches: [],
    })
    await checkGlossaryComplianceRule(segment, terms, ctx, checkFn)
    const calledCtx = (checkFn as ReturnType<typeof vi.fn>).mock.calls[0]?.[3]
    expect(calledCtx).toEqual({
      segmentId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      projectId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
      tenantId: 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f',
    })
  })

  it('should be case-insensitive in pre-filter', async () => {
    const segment = buildSegment({
      sourceText: 'The DATABASE is ready',
      targetText: 'ฐานข้อมูลพร้อม',
    })
    const terms = [makeGlossaryTerm(TERM_UUID_1, 'database', 'ฐานข้อมูล')]
    const checkFn = mockCheckFn({ matches: [], missingTerms: [], lowConfidenceMatches: [] })
    await checkGlossaryComplianceRule(segment, terms, ctx, checkFn)
    expect(checkFn).toHaveBeenCalledTimes(1) // term passed through pre-filter
  })
})
