/// <reference types="vitest/globals" />
/**
 * Golden Corpus Diagnostic -- Detailed Findings Report
 * Run: npx vitest run --project integration src/__tests__/integration/golden-corpus-diagnostic.test.ts
 */

// ── Mocks (server-only + side-effect modules) ──
vi.mock('server-only', () => ({}))
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/cache/glossaryCache', () => ({
  getCachedGlossaryTerms: vi.fn().mockResolvedValue([]),
}))

import { existsSync, readFileSync } from 'fs'
import path from 'path'

import { faker } from '@faker-js/faker'
import ExcelJS from 'exceljs'

import { parseXliff } from '@/features/parser/sdlxliffParser'
import type { ParsedSegment } from '@/features/parser/types'
import { processFile } from '@/features/pipeline/engine/ruleEngine'
import type {
  GlossaryTermRecord,
  RuleCheckResult,
  SegmentRecord,
} from '@/features/pipeline/engine/types'

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

// ── Types ──

type XbenchFinding = {
  category: string
  fileName: string
  segmentNumber: number
  sourceText: string
  targetText: string
}

type FileParseResult = {
  fileName: string
  segments: SegmentRecord[]
  segmentCount: number
}

// ── Helpers ──

/** Get plain text from ExcelJS cell (handles richText, strings, numbers) */
function getCellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object' && 'richText' in value) {
    return (value as { richText: { text: string }[] }).richText
      .map((rt) => rt.text)
      .join('')
      .trim()
  }
  return String(value).trim()
}

/** Convert ParsedSegment → SegmentRecord (bridge parser → engine) */
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

/** Parse Xbench QA report xlsx → structured findings + glossary terms */
async function readXbenchReport(filePath: string): Promise<{
  findings: XbenchFinding[]
  glossaryTerms: GlossaryTermRecord[]
}> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.getWorksheet('Xbench QA')
  if (!sheet) throw new Error('Xbench QA sheet not found')

  const findings: XbenchFinding[] = []
  const glossaryTerms: GlossaryTermRecord[] = []
  const glossaryId = faker.string.uuid()
  let currentCategory = ''

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 12) return // skip metadata + header rows

    const colA = getCellText(row.getCell(1))
    const colC = getCellText(row.getCell(3))

    // Data row: "filename.sdlxliff (segmentNumber)"
    const fileMatch = colA.match(/^(.+\.sdlxliff)\s*\((\d+)\)$/)

    if (fileMatch) {
      findings.push({
        category: currentCategory,
        fileName: fileMatch[1]!,
        segmentNumber: parseInt(fileMatch[2]!, 10),
        sourceText: colC,
        targetText: getCellText(row.getCell(4)),
      })
    } else if (colA) {
      // Category / sub-category header row
      if (colA.includes('Inconsistency in Source')) currentCategory = 'Inconsistency in Source'
      else if (colA.includes('Inconsistency in Target')) currentCategory = 'Inconsistency in Target'
      else if (colA === 'Tag Mismatch') currentCategory = 'Tag Mismatch'
      else if (colA === 'Numeric Mismatch') currentCategory = 'Numeric Mismatch'
      else if (colA === 'Repeated Word') currentCategory = 'Repeated Word'
      else if (colA.startsWith('Key Term Mismatch')) {
        currentCategory = 'Key Term Mismatch'
        // Extract glossary term pair from sub-header: "Key Term Mismatch (source / target)"
        const termMatch = colA.match(/Key Term Mismatch\s*\((.+?)\s*\/\s*(.+?)\)/)
        if (termMatch) {
          glossaryTerms.push({
            id: faker.string.uuid(),
            glossaryId,
            sourceTerm: termMatch[1]!.trim(),
            targetTerm: termMatch[2]!.trim(),
            caseSensitive: false,
            createdAt: new Date(),
          })
        }
      }
    }
  })

  return { findings, glossaryTerms }
}

/** Count findings per category */
function countByCategory(findings: { category: string }[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const f of findings) {
    counts[f.category] = (counts[f.category] ?? 0) + 1
  }
  return counts
}

/** Check if golden corpus test data exists */
function hasGoldenCorpus(): boolean {
  return existsSync(GOLDEN_DIR) && existsSync(XBENCH_REPORT_PATH)
}

// ── Test Suite ──

describe.skipIf(!hasGoldenCorpus())('Golden Corpus Diagnostic Report', () => {
  let parsedFiles: FileParseResult[]
  let skippedFiles: string[]
  let xbenchFindings: XbenchFinding[]
  let glossaryTerms: GlossaryTermRecord[]
  let engineFindings: RuleCheckResult[]
  let engineFindingsWithGlossary: RuleCheckResult[]

  beforeAll(async () => {
    const projectId = faker.string.uuid()
    const tenantId = faker.string.uuid()

    parsedFiles = []
    skippedFiles = []

    for (const relPath of SDLXLIFF_FILES) {
      const fullPath = path.join(GOLDEN_DIR, relPath)
      const xml = readFileSync(fullPath, 'utf-8')
      const result = parseXliff(xml)

      if (!result.success) {
        if (result.error.code === 'FILE_TOO_LARGE') {
          skippedFiles.push(path.basename(relPath))
          continue
        }
        throw new Error('Parse failed: ' + relPath + ' -- ' + result.error.message)
      }

      const fileId = faker.string.uuid()
      const segments = result.data.segments.map((seg) =>
        toSegmentRecord(seg, { fileId, projectId, tenantId }),
      )

      parsedFiles.push({
        fileName: path.basename(relPath),
        segments,
        segmentCount: result.data.segmentCount,
      })
    }

    const report = await readXbenchReport(XBENCH_REPORT_PATH)
    glossaryTerms = report.glossaryTerms
    const parsedFileNames = new Set(parsedFiles.map((f) => f.fileName))
    xbenchFindings = report.findings.filter((f) => parsedFileNames.has(f.fileName))

    engineFindings = []
    for (const file of parsedFiles) {
      const findings = await processFile(file.segments, [], new Set(), [])
      engineFindings.push(...findings)
    }

    engineFindingsWithGlossary = []
    for (const file of parsedFiles) {
      const findings = await processFile(file.segments, glossaryTerms, new Set(), [])
      engineFindingsWithGlossary.push(...findings)
    }
  }, 180_000)

  it('should produce a comprehensive diagnostic report', () => {
    const w = (msg: string) => process.stderr.write(msg + String.fromCharCode(10))
    const trunc = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 3) + '...')

    w('')
    w('='.repeat(100))
    w('  GOLDEN CORPUS DIAGNOSTIC REPORT')
    w('  Rule Engine L1 vs Real SDLXLIFF Files')
    w('='.repeat(100))
    w('')

    if (skippedFiles.length > 0) {
      w('SKIPPED (>15MB): ' + skippedFiles.join(', '))
      w('')
    }

    w('-'.repeat(100))
    w('  PER-FILE SUMMARY')
    w('-'.repeat(100))
    w('')

    for (const file of parsedFiles) {
      const noGloss = engineFindings.filter((f) => file.segments.some((s) => s.id === f.segmentId))
      const withGloss = engineFindingsWithGlossary.filter((f) =>
        file.segments.some((s) => s.id === f.segmentId),
      )

      w('  FILE: ' + file.fileName)
      w('    Segments: ' + file.segmentCount)
      w('    Findings (no glossary):   ' + noGloss.length)
      w('    Findings (with glossary): ' + withGloss.length)

      const catCounts = new Map<string, number>()
      for (const f of withGloss) {
        catCounts.set(f.category, (catCounts.get(f.category) ?? 0) + 1)
      }
      if (catCounts.size > 0) {
        w('    Category breakdown:')
        const sorted = [...catCounts.entries()].sort((a, b) => b[1] - a[1])
        for (const [cat, count] of sorted) {
          w('      ' + cat.padEnd(25) + ' ' + String(count).padStart(4))
        }
      }
      w('')
    }

    const totalSegments = parsedFiles.reduce((s, f) => s + f.segmentCount, 0)

    w('-'.repeat(100))
    w('  TOTALS')
    w('-'.repeat(100))
    w('  Files parsed:                   ' + parsedFiles.length)
    w('  Files skipped (>15MB):          ' + skippedFiles.length)
    w('  Total segments:                 ' + totalSegments)
    w('  Xbench findings (parsed files): ' + xbenchFindings.length)
    w('  Engine findings (no glossary):  ' + engineFindings.length)
    w('  Engine findings (with glossary):' + engineFindingsWithGlossary.length)
    w('  Glossary terms extracted:       ' + glossaryTerms.length)
    w('')

    w('-'.repeat(100))
    w('  AGGREGATE FINDINGS BY CATEGORY (with glossary)')
    w('-'.repeat(100))
    w('')

    const catMap = new Map<string, RuleCheckResult[]>()
    for (const f of engineFindingsWithGlossary) {
      if (!catMap.has(f.category)) catMap.set(f.category, [])
      catMap.get(f.category)!.push(f)
    }
    const sortedCats = [...catMap.entries()].sort((a, b) => b[1].length - a[1].length)
    for (const [cat, findings] of sortedCats) {
      w('  ' + cat.padEnd(25) + ' ' + String(findings.length).padStart(4) + ' findings')
    }

    w('')
    w('-'.repeat(100))
    w('  SEVERITY BREAKDOWN')
    w('-'.repeat(100))
    w('')
    const sevMap = new Map<string, number>()
    for (const f of engineFindingsWithGlossary) {
      sevMap.set(f.severity, (sevMap.get(f.severity) ?? 0) + 1)
    }
    for (const sev of ['critical', 'major', 'minor']) {
      w('  ' + sev.padEnd(12) + ' ' + String(sevMap.get(sev) ?? 0).padStart(4))
    }

    w('')
    w('-'.repeat(100))
    w('  SAMPLE FINDINGS (first 3 per category)')
    w('-'.repeat(100))

    for (const [cat, findings] of sortedCats) {
      w('')
      w('  === ' + cat.toUpperCase() + ' (' + findings.length + ' total) ===')
      w('')
      const samples = findings.slice(0, 3)
      for (let i = 0; i < samples.length; i++) {
        const f = samples[i]!
        let segRef = '?'
        for (const file of parsedFiles) {
          const seg = file.segments.find((s) => s.id === f.segmentId)
          if (seg) {
            segRef = file.fileName + ' #' + seg.segmentNumber
            break
          }
        }
        w('  [' + (i + 1) + '] segment: ' + segRef)
        w('      severity:    ' + f.severity)
        w('      description: ' + f.description)
        w('      source:      "' + trunc(f.sourceExcerpt, 120) + '"')
        w('      target:      "' + trunc(f.targetExcerpt, 120) + '"')
        if (f.suggestedFix) {
          w('      suggestFix:  "' + trunc(f.suggestedFix, 80) + '"')
        }
        w('')
      }
    }

    w('-'.repeat(100))
    w('  GLOSSARY TERMS FROM XBENCH')
    w('-'.repeat(100))
    w('')
    for (const term of glossaryTerms) {
      w('  "' + term.sourceTerm + '" => "' + term.targetTerm + '"')
    }
    w('')

    w('-'.repeat(100))
    w('  COMPARISON: NO GLOSSARY vs WITH GLOSSARY')
    w('-'.repeat(100))
    w('')
    const catNG = new Map<string, number>()
    const catWG = new Map<string, number>()
    for (const f of engineFindings) catNG.set(f.category, (catNG.get(f.category) ?? 0) + 1)
    for (const f of engineFindingsWithGlossary)
      catWG.set(f.category, (catWG.get(f.category) ?? 0) + 1)
    const allCats = [...new Set([...catNG.keys(), ...catWG.keys()])].sort()
    w(
      '  ' +
        'Category'.padEnd(25) +
        ' ' +
        'NoGloss'.padStart(8) +
        ' ' +
        'WithGloss'.padStart(10) +
        ' ' +
        'Delta'.padStart(8),
    )
    w('  ' + '-'.repeat(25) + ' ' + '-'.repeat(8) + ' ' + '-'.repeat(10) + ' ' + '-'.repeat(8))
    for (const cat of allCats) {
      const ng = catNG.get(cat) ?? 0
      const wg = catWG.get(cat) ?? 0
      const d = wg - ng
      const ds = d > 0 ? '+' + d : String(d)
      w(
        '  ' +
          cat.padEnd(25) +
          ' ' +
          String(ng).padStart(8) +
          ' ' +
          String(wg).padStart(10) +
          ' ' +
          ds.padStart(8),
      )
    }
    w('')
    w('='.repeat(100))
    w('  END OF DIAGNOSTIC REPORT')
    w('='.repeat(100))
    w('')

    expect(parsedFiles.length).toBeGreaterThanOrEqual(6)
    expect(engineFindingsWithGlossary.length).toBeGreaterThan(0)
  })
})
