/// <reference types="vitest/globals" />
/**
 * G2 Tag Gap Diagnostic — Why Engine Finds 10 vs Xbench's 27 Tag Mismatches
 *
 * Correlates Xbench "Tag Mismatch" findings with our parsed segments using
 * source text matching (segment numbers differ between Xbench and our parser).
 *
 * Root cause categories expected:
 *   A) inlineTags = null  → parser didn't extract tags (tag type not supported?)
 *   B) inlineTags populated, engine catches it  → already found
 *   C) inlineTags populated, engine MISSES it  → logic gap
 *   D) Segment not found by text match  → text normalization or parsing difference
 *
 * Run: npx vitest run --project integration src/__tests__/integration/tag-gap-diagnostic.test.ts
 */

// ── Mocks ──
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
import type { InlineTagsData } from '@/features/parser/types'
import { checkTagIntegrity } from '@/features/pipeline/engine/checks/tagChecks'
import type { SegmentCheckContext, SegmentRecord } from '@/features/pipeline/engine/types'

// ── Paths ──

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

type XbenchTagFinding = {
  fileName: string
  segmentNumber: number // Xbench's segment number (may be mrk @mid, not 1-based)
  sourceText: string
  targetText: string
}

type ParsedFile = {
  fileName: string
  segments: SegmentRecord[]
}

// ── Helpers ──

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

/** Strip XLIFF inline tags from text (Xbench shows raw XML in source column) */
function stripXmlTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalize text for loose matching: lowercase, collapse whitespace */
function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Normalize Xbench source text: strip XML tags first, then normalize */
function normalizeXbench(s: string): string {
  return normalizeText(stripXmlTags(s))
}

/**
 * Squash normalization: lowercase + remove ALL whitespace.
 * Handles whitespace-at-tag-boundary issues:
 *   "<g>A</g>sk" → stripped "A sk" → squash "ask"
 *   "Ask" → squash "ask"  ← match!
 */
function squash(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '')
}

function squashXbench(s: string): string {
  return squash(stripXmlTags(s))
}

/** Find segment by squash match (strips all whitespace) — handles tag-boundary spaces */
function findBySquash(segs: SegmentRecord[], xbenchSource: string): SegmentRecord | undefined {
  const xbSquash = squashXbench(xbenchSource)
  if (xbSquash.length < 10) return undefined

  // Exact squash match
  let match = segs.find((s) => squash(s.sourceText) === xbSquash)
  if (match) return match

  // Prefix squash match (Xbench may truncate long segments)
  const prefix = xbSquash.slice(0, 40)
  match = segs.find((s) => squash(s.sourceText).startsWith(prefix))
  if (match) return match

  // Substring squash match: our text contains Xbench prefix
  match = segs.find((s) => squash(s.sourceText).includes(xbSquash.slice(0, 30)))
  return match
}

async function readXbenchTagFindings(filePath: string): Promise<XbenchTagFinding[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  const sheet = workbook.getWorksheet('Xbench QA')
  if (!sheet) throw new Error('Xbench QA sheet not found')

  const findings: XbenchTagFinding[] = []
  let inTagSection = false

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 12) return

    const colA = getCellText(row.getCell(1))

    if (colA === 'Tag Mismatch') {
      inTagSection = true
      return
    }

    // Stop at next section header (non-empty colA that's not a data row)
    const fileMatch = colA.match(/^(.+\.sdlxliff)\s*\((\d+)\)$/)
    if (!fileMatch && colA && inTagSection) {
      inTagSection = false
      return
    }

    if (inTagSection && fileMatch) {
      findings.push({
        fileName: fileMatch[1]!,
        segmentNumber: parseInt(fileMatch[2]!, 10),
        sourceText: getCellText(row.getCell(3)),
        targetText: getCellText(row.getCell(4)),
      })
    }
  })

  return findings
}

function hasGoldenCorpus(): boolean {
  return existsSync(GOLDEN_DIR) && existsSync(XBENCH_REPORT_PATH)
}

// ── Test Suite ──

describe.skipIf(!hasGoldenCorpus())('G2 Tag Gap Diagnostic', () => {
  let parsedFiles: ParsedFile[]
  let xbenchTagFindings: XbenchTagFinding[]

  beforeAll(async () => {
    const projectId = faker.string.uuid()
    const tenantId = faker.string.uuid()

    parsedFiles = []

    for (const relPath of SDLXLIFF_FILES) {
      const fullPath = path.join(GOLDEN_DIR, relPath)
      const xml = readFileSync(fullPath, 'utf-8')
      const result = parseXliff(xml)

      if (!result.success) {
        if (result.error.code === 'FILE_TOO_LARGE') continue
        throw new Error(`Parse failed: ${relPath} — ${result.error.message}`)
      }

      const fileId = faker.string.uuid()
      const segments: SegmentRecord[] = result.data.segments.map((seg) => ({
        id: faker.string.uuid(),
        fileId,
        projectId,
        tenantId,
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
      }))

      parsedFiles.push({ fileName: path.basename(relPath), segments })
    }

    xbenchTagFindings = await readXbenchTagFindings(XBENCH_REPORT_PATH)
    // Filter to parsed files only
    const parsedNames = new Set(parsedFiles.map((f) => f.fileName))
    xbenchTagFindings = xbenchTagFindings.filter((f) => parsedNames.has(f.fileName))
  }, 120_000)

  it('should produce a G2 tag gap diagnostic report', () => {
    const w = (msg: string) => process.stderr.write(msg + '\n')
    const trunc = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 3) + '...')

    const ctx: SegmentCheckContext = { sourceLang: 'en-US', targetLang: 'th-TH' }

    w('')
    w('='.repeat(100))
    w('  G2 TAG GAP DIAGNOSTIC')
    w("  Why Engine Finds 10 vs Xbench's 27 Tag Mismatches")
    w('='.repeat(100))
    w('')
    w(`  Xbench tag findings (in parsed files): ${xbenchTagFindings.length}`)
    w('')

    // Categorize outcomes
    let countNotFound = 0
    let countNullInlineTags = 0
    let countEngineFound = 0
    let countEngineMissed = 0

    // Build lookup: fileName → segments indexed by normalized sourceText
    const fileIndex = new Map<string, SegmentRecord[]>()
    for (const file of parsedFiles) {
      fileIndex.set(file.fileName, file.segments)
    }

    w('-'.repeat(100))
    w('  PER-FINDING ANALYSIS')
    w('-'.repeat(100))
    w('')

    type OutcomeLabel = 'NOT_FOUND' | 'NULL_TAGS' | 'ENGINE_FOUND' | 'ENGINE_MISSED'

    const byOutcome: Record<OutcomeLabel, XbenchTagFinding[]> = {
      NOT_FOUND: [],
      NULL_TAGS: [],
      ENGINE_FOUND: [],
      ENGINE_MISSED: [],
    }

    for (const xf of xbenchTagFindings) {
      const segments = fileIndex.get(xf.fileName) ?? []
      // Use squash matching to handle whitespace-at-tag-boundary issues
      const match = findBySquash(segments, xf.sourceText)

      if (!match) {
        byOutcome.NOT_FOUND.push(xf)
        countNotFound++
        continue
      }

      if (match.inlineTags === null || match.inlineTags === undefined) {
        byOutcome.NULL_TAGS.push(xf)
        countNullInlineTags++
        continue
      }

      // Run checkTagIntegrity
      const engineResults = checkTagIntegrity(match, ctx)

      if (engineResults.length > 0) {
        byOutcome.ENGINE_FOUND.push(xf)
        countEngineFound++
      } else {
        byOutcome.ENGINE_MISSED.push(xf)
        countEngineMissed++
      }
    }

    // ── NOT FOUND — debug first 3 with stripped text + nearest parsed segment ──
    if (byOutcome.NOT_FOUND.length > 0) {
      w(
        `  [NOT_FOUND] ${byOutcome.NOT_FOUND.length} segments — source text not matched in parsed data`,
      )
      w('')
      for (const xf of byOutcome.NOT_FOUND.slice(0, 3)) {
        const segs = fileIndex.get(xf.fileName) ?? []
        const xbSquashed = squashXbench(xf.sourceText)

        w(`  File: ${xf.fileName} seg#${xf.segmentNumber}`)
        w(`  Xbench raw:     "${trunc(xf.sourceText, 80)}"`)
        w(`  Xbench squashed:"${trunc(xbSquashed, 80)}"`)

        // Show why squash match still fails: show squashed versions of first few segs
        w(`  First 3 parsed segs (squashed):`)
        for (const s of segs.slice(0, 3)) {
          w(`    #${s.segmentNumber}: "${trunc(squash(s.sourceText), 70)}"`)
        }
        w('')
      }
    }

    // ── NULL_TAGS ──
    if (byOutcome.NULL_TAGS.length > 0) {
      w(`  [NULL_TAGS] ${byOutcome.NULL_TAGS.length} segments — parser extracted inlineTags = null`)
      w('  Root cause: parser did not find any inline tags in source or target')
      w('  (Possible: tag type not in INLINE_TAG_TYPES, or Xbench reads raw XML differently)')
      w('')
      for (const xf of byOutcome.NULL_TAGS.slice(0, 5)) {
        const segs = fileIndex.get(xf.fileName) ?? []
        const match = findBySquash(segs, xf.sourceText)

        w(`    File: ${xf.fileName} seg#${xf.segmentNumber} (our#${match?.segmentNumber ?? '?'})`)
        w(`    Source: "${trunc(xf.sourceText, 80)}"`)
        w(`    Target: "${trunc(xf.targetText, 80)}"`)
        w('')
      }
    }

    // ── ENGINE_FOUND ──
    w(
      `  [ENGINE_FOUND] ${byOutcome.ENGINE_FOUND.length} segments — engine correctly detected tag issue`,
    )
    w('')

    // ── ENGINE_MISSED ──
    if (byOutcome.ENGINE_MISSED.length > 0) {
      w(
        `  [ENGINE_MISSED] ${byOutcome.ENGINE_MISSED.length} segments — inlineTags populated but engine missed`,
      )
      w('  Root cause: checkTagIntegrity logic does not catch this type of tag mismatch')
      w('')
      for (const xf of byOutcome.ENGINE_MISSED.slice(0, 5)) {
        const segs = fileIndex.get(xf.fileName) ?? []
        const match = findBySquash(segs, xf.sourceText)

        if (!match) continue

        const tagsData = match.inlineTags as InlineTagsData
        const srcTags = tagsData.source
        const tgtTags = tagsData.target
        const engineResults = checkTagIntegrity(match, ctx)

        w(`    File: ${xf.fileName} seg#${xf.segmentNumber} (our#${match.segmentNumber})`)
        w(`    Source: "${trunc(xf.sourceText, 80)}"`)
        w(`    Target: "${trunc(xf.targetText, 80)}"`)
        w(`    inlineTags.source: [${srcTags.map((t) => `${t.type}:${t.id}`).join(', ')}]`)
        w(`    inlineTags.target: [${tgtTags.map((t) => `${t.type}:${t.id}`).join(', ')}]`)
        w(
          `    Engine results: ${engineResults.length === 0 ? 'none (missed!)' : engineResults.map((r) => r.description).join('; ')}`,
        )
        w('')
      }
    }

    w('-'.repeat(100))
    w('  SUMMARY')
    w('-'.repeat(100))
    w('')
    w(`  Total Xbench tag findings (parsed files): ${xbenchTagFindings.length}`)
    w(
      `  NOT_FOUND   (text match failed):         ${countNotFound.toString().padStart(4)} — segment numbering/text mismatch`,
    )
    w(
      `  NULL_TAGS   (parser got no tags):         ${countNullInlineTags.toString().padStart(4)} — tag types not extracted`,
    )
    w(
      `  ENGINE_FOUND (correctly detected):        ${countEngineFound.toString().padStart(4)} — already working`,
    )
    w(
      `  ENGINE_MISSED (logic gap):                ${countEngineMissed.toString().padStart(4)} — needs logic fix`,
    )
    w('')

    // ── Inspect a sample NULL_TAGS segment to see what the raw SDLXLIFF looks like ──
    if (byOutcome.NULL_TAGS.length > 0) {
      w('-'.repeat(100))
      w('  NULL_TAGS SAMPLE — FULL inlineTags INSPECTION')
      w('-'.repeat(100))
      w('')
      const sample = byOutcome.NULL_TAGS[0]!
      const segs = fileIndex.get(sample.fileName) ?? []
      const match = findBySquash(segs, sample.sourceText)
      if (match) {
        w(`  Segment our#${match.segmentNumber} from ${sample.fileName}`)
        w(`  inlineTags value: ${JSON.stringify(match.inlineTags)}`)
        w(`  sourceText: "${match.sourceText}"`)
        w(`  targetText: "${match.targetText}"`)
      }
      w('')
    }

    w('='.repeat(100))
    w('  END G2 TAG GAP DIAGNOSTIC')
    w('='.repeat(100))
    w('')

    // Assertions — this test always passes; it's diagnostic only
    expect(xbenchTagFindings.length).toBeGreaterThan(0)
    expect(countEngineFound + countNullInlineTags + countEngineMissed + countNotFound).toBe(
      xbenchTagFindings.length,
    )
  })
})
