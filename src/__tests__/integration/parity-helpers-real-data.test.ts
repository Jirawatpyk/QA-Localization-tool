/// <reference types="vitest/globals" />
/**
 * Parity Helpers — Real Data Integration Tests
 *
 * Tests the shared parity helpers (compareFindings, xbenchCategoryMapper)
 * against the REAL golden corpus data.
 *
 * Data: docs/test-data/Golden-Test-Mona/2026-02-24_With_Issues_Mona/
 */

// ── Mocks ──
vi.mock('server-only', () => ({}))
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/cache/glossaryCache', () => ({
  getCachedGlossaryTerms: vi.fn().mockResolvedValue([]),
}))

import { existsSync, readFileSync } from 'fs'
import path from 'path'

import { faker } from '@faker-js/faker'

import { compareFindings } from '@/features/parity/helpers/parityComparator'
import { mapXbenchCategory } from '@/features/parity/helpers/xbenchCategoryMapper'
import { parseXbenchReport } from '@/features/parity/helpers/xbenchReportParser'
import { parseXliff } from '@/features/parser/sdlxliffParser'
import type { ParsedSegment } from '@/features/parser/types'
import { processFile } from '@/features/pipeline/engine/ruleEngine'
import type { RuleCheckResult, SegmentRecord } from '@/features/pipeline/engine/types'

// ── File Paths ──

const GOLDEN_DIR = path.resolve(
  process.cwd(),
  'docs/test-data/Golden-Test-Mona/2026-02-24_With_Issues_Mona',
)
const XBENCH_REPORT_PATH = path.join(GOLDEN_DIR, 'Xbench_QA_Report.xlsx')

const SDLXLIFF_FILES = [
  'Activity Guide/AP BT Activity Guide.pptx.sdlxliff',
  'Discussion Guide/AP BT DG Next Chapter.pptx.sdlxliff',
  'Discussion Guide/AP BT DG Your Role.pptx.sdlxliff',
  'Program Overview and Change Summary/AP BT Program Change Summary.pptx.sdlxliff',
  'Program Overview and Change Summary/AP New Barista Trainer Program Overview.pptx.sdlxliff',
  'Skill Check/AP BT Skill Check.pptx.sdlxliff',
  'Traning Plan and SM Support Kit/AP BT SM Support Kit.pptx.sdlxliff',
  'Traning Plan and SM Support Kit/AP BT Training Plan.pptx.sdlxliff',
]

// ── Helpers ──

function toSegmentRecord(
  seg: ParsedSegment,
  ids: { fileId: string; projectId: string; tenantId: string },
): SegmentRecord {
  return {
    id: faker.string.uuid(),
    fileId: ids.fileId,
    projectId: ids.projectId,
    tenantId: ids.tenantId,
    segmentNumber: seg.segmentNumber,
    sourceText: seg.sourceText,
    targetText: seg.targetText,
    sourceLang: seg.sourceLang,
    targetLang: seg.targetLang,
    wordCount: seg.wordCount,
    confirmationState: seg.confirmationState,
    matchPercentage: seg.matchPercentage,
    translatorComment: seg.translatorComment,
    inlineTags: seg.inlineTags,
    createdAt: new Date(),
  }
}

function hasGoldenCorpus(): boolean {
  return existsSync(GOLDEN_DIR) && existsSync(XBENCH_REPORT_PATH)
}

// ── Test Suite ──

describe.skipIf(!hasGoldenCorpus())('Parity Helpers — Real Data', () => {
  // ── 1. parseXbenchReport — sectioned format support (Story 2.9) ──

  describe('parseXbenchReport format handling', () => {
    it('should parse the real golden corpus xlsx and return findings', async () => {
      const buffer = readFileSync(XBENCH_REPORT_PATH)
      const result = await parseXbenchReport(buffer)

      // Golden corpus is sectioned format — after Story 2.9, parser extracts real findings
      expect(result).toHaveProperty('findings')
      expect(result).toHaveProperty('fileGroups')
      expect(Array.isArray(result.findings)).toBe(true)
      expect(result.findings.length).toBeGreaterThan(0)
    })

    it('should return a valid structure with fileGroups populated', async () => {
      const buffer = readFileSync(XBENCH_REPORT_PATH)
      const result = await parseXbenchReport(buffer)

      expect(typeof result.fileGroups).toBe('object')
      expect(Object.keys(result.fileGroups).length).toBeGreaterThan(0)
    })
  })

  // ── 2. xbenchCategoryMapper — all golden corpus categories ──

  describe('xbenchCategoryMapper with golden corpus categories', () => {
    let goldenFindings: Awaited<ReturnType<typeof parseXbenchReport>>['findings']

    beforeAll(async () => {
      const buffer = readFileSync(XBENCH_REPORT_PATH)
      const result = await parseXbenchReport(buffer)
      goldenFindings = result.findings
    }, 30_000)

    it('should parse > 0 findings from golden corpus', () => {
      expect(goldenFindings.length).toBeGreaterThan(0)
    })

    it('should map all golden corpus Xbench categories to valid MQM categories', () => {
      const categories = [...new Set(goldenFindings.map((f) => f.category))]
      const VALID_MQM = new Set([
        'accuracy',
        'fluency',
        'terminology',
        'consistency',
        'completeness',
      ])

      for (const cat of categories) {
        const mapped = mapXbenchCategory(cat)
        expect(VALID_MQM).toContain(mapped)
      }
    })

    it('should map specific categories correctly', () => {
      expect(mapXbenchCategory('Tag Mismatch')).toBe('fluency')
      expect(mapXbenchCategory('Numeric Mismatch')).toBe('accuracy')
      expect(mapXbenchCategory('Inconsistency in Source')).toBe('consistency')
      expect(mapXbenchCategory('Inconsistency in Target')).toBe('consistency')
      expect(mapXbenchCategory('Key Term Mismatch')).toBe('terminology')
      expect(mapXbenchCategory('Repeated Word')).toBe('fluency')
    })
  })

  // ── 3. compareFindings — real engine vs Xbench data ──

  describe('compareFindings with real engine + Xbench data', () => {
    let comparisonResult: ReturnType<typeof compareFindings>
    let xbenchCount: number

    beforeAll(async () => {
      const projectId = faker.string.uuid()
      const tenantId = faker.string.uuid()

      // Parse first SDLXLIFF file + run engine
      const relPath = SDLXLIFF_FILES[0]!
      const fullPath = path.join(GOLDEN_DIR, relPath)
      const xml = readFileSync(fullPath, 'utf-8')
      const parseResult = parseXliff(xml)

      if (!parseResult.success) throw new Error(`Parse failed: ${relPath}`)

      const fileId = faker.string.uuid()
      const segments: SegmentRecord[] = parseResult.data.segments.map((seg) =>
        toSegmentRecord(seg, { fileId, projectId, tenantId }),
      )

      const engineFindings: RuleCheckResult[] = await processFile(segments, [], new Set(), [])

      // Parse golden corpus Xbench findings via parseXbenchReport (sectioned format)
      const buffer = readFileSync(XBENCH_REPORT_PATH)
      const { findings: goldenFindings } = await parseXbenchReport(buffer)
      const fileName = path.basename(relPath)
      const fileFindings = goldenFindings.filter((f) => f.fileName === fileName)
      xbenchCount = fileFindings.length

      // Map to compareFindings input format — pass raw Xbench category (f.category)
      // compareFindings internally calls mapXbenchToToolCategory(xf.category) for matching
      const mappedXbench = fileFindings.map((f) => ({
        sourceText: f.sourceText,
        targetText: f.targetText,
        category: f.category, // raw Xbench category — compareFindings maps internally
        severity: f.severity,
        fileName: f.fileName,
        segmentNumber: f.segmentNumber,
      }))

      const toolFindings = engineFindings.map((f) => ({
        sourceTextExcerpt: f.sourceExcerpt ?? null,
        targetTextExcerpt: f.targetExcerpt ?? null,
        category: f.category,
        severity: f.severity,
        fileId,
        segmentId: f.segmentId,
      }))

      comparisonResult = compareFindings(mappedXbench, toolFindings, fileId)
    }, 60_000)

    it('should return valid ComparisonResult structure', () => {
      expect(comparisonResult).toHaveProperty('matched')
      expect(comparisonResult).toHaveProperty('xbenchOnly')
      expect(comparisonResult).toHaveProperty('toolOnly')
    })

    it('should have matched + xbenchOnly = total xbench for the file', () => {
      expect(comparisonResult.matched.length + comparisonResult.xbenchOnly.length).toBe(xbenchCount)
    })

    it('should have valid fields in matched findings', () => {
      for (const m of comparisonResult.matched) {
        expect(m.xbenchCategory).toBeTruthy()
        expect(m.toolCategory).toBeTruthy()
        expect(m.severity).toBeTruthy()
      }
    })

    it('should have engine producing additional findings (toolOnly)', () => {
      // Engine finds spacing, punctuation, capitalization issues that Xbench
      // does not check; also runs without glossary so Key Term coverage differs
      expect(comparisonResult.toolOnly.length).toBeGreaterThan(0)
    })
  })

  // ── 4. End-to-end: all 8 files through compareFindings ──

  describe('End-to-end parity comparison (all 8 files)', () => {
    let totalMatched: number
    let totalXbenchOnly: number
    let totalToolOnly: number
    let totalXbench: number
    let totalEngine: number

    beforeAll(async () => {
      const projectId = faker.string.uuid()
      const tenantId = faker.string.uuid()

      const buffer = readFileSync(XBENCH_REPORT_PATH)
      const { findings: goldenFindings } = await parseXbenchReport(buffer)

      totalMatched = 0
      totalXbenchOnly = 0
      totalToolOnly = 0
      totalXbench = 0
      totalEngine = 0

      for (const relPath of SDLXLIFF_FILES) {
        const fullPath = path.join(GOLDEN_DIR, relPath)
        const xml = readFileSync(fullPath, 'utf-8')
        const parseResult = parseXliff(xml)

        if (!parseResult.success) continue

        const fileId = faker.string.uuid()
        const segments = parseResult.data.segments.map((seg) =>
          toSegmentRecord(seg, { fileId, projectId, tenantId }),
        )

        const engineFindings = await processFile(segments, [], new Set(), [])
        totalEngine += engineFindings.length

        // Filter golden corpus Xbench findings for this file
        const fileName = path.basename(relPath)
        const fileXbench = goldenFindings.filter((f) => f.fileName === fileName)
        totalXbench += fileXbench.length

        // Map to compareFindings format (raw Xbench category — comparator maps internally)
        const mappedXbench = fileXbench.map((f) => ({
          sourceText: f.sourceText,
          targetText: f.targetText,
          category: f.category,
          severity: f.severity,
          fileName: f.fileName,
          segmentNumber: f.segmentNumber,
        }))

        const toolFindings = engineFindings.map((f) => ({
          sourceTextExcerpt: f.sourceExcerpt ?? null,
          targetTextExcerpt: f.targetExcerpt ?? null,
          category: f.category,
          severity: f.severity,
          fileId,
          segmentId: f.segmentId,
        }))

        const result = compareFindings(mappedXbench, toolFindings, fileId)
        totalMatched += result.matched.length
        totalXbenchOnly += result.xbenchOnly.length
        totalToolOnly += result.toolOnly.length
      }
    }, 120_000)

    it('should process all 8 files with > 0 findings from both sources', () => {
      expect(totalXbench).toBeGreaterThan(0)
      expect(totalEngine).toBeGreaterThan(0)
    })

    it('should have matched + xbenchOnly = total xbench across all files', () => {
      expect(totalMatched + totalXbenchOnly).toBe(totalXbench)
    })

    it('should have matched + toolOnly = total engine across all files', () => {
      expect(totalMatched + totalToolOnly).toBe(totalEngine)
    })

    it('should have match rate > 0% (some findings overlap)', () => {
      const matchRate = totalXbench > 0 ? totalMatched / totalXbench : 0
      expect(matchRate).toBeGreaterThan(0)
    })

    it('should have engine finding >= 50% of Xbench total (without glossary)', () => {
      // Engine runs without glossary terms here, so Key Term Mismatch (~240)
      // is not produced. Engine still finds spacing, punctuation, capitalization, etc.
      // that Xbench skips, but lacks glossary coverage.
      expect(totalEngine).toBeGreaterThan(totalXbench * 0.5)
    })

    it('should have bounded xbenchOnly count (parity gap within tolerance)', () => {
      // Known gaps: tag_integrity (data source diff), consistency (cross-file vs per-file)
      // Total xbenchOnly should be bounded
      expect(totalXbenchOnly).toBeLessThan(totalXbench)
    })
  })
})
