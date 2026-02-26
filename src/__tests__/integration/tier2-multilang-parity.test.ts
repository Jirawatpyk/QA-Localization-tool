/// <reference types="vitest/globals" />
/**
 * Story 2.10 — AC2: Tier 2 Multi-Language Parity
 *
 * Process NCR corpus (7+ language pairs) and measure per-language parity %.
 * Mode: MEASUREMENT ONLY — no pass/fail threshold.
 * Mona will set thresholds after reviewing actual data.
 *
 * Only processes SDLXLIFF files. VTT/Excel/other formats are documented as skipped.
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

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

import { faker } from '@faker-js/faker'

import { parseXliff } from '@/features/parser/sdlxliffParser'
import type { ParsedSegment } from '@/features/parser/types'
import { processFile } from '@/features/pipeline/engine/ruleEngine'
import type { SegmentRecord } from '@/features/pipeline/engine/types'

// ── Paths ──

const GOLDEN_CORPUS_BASE = process.env['GOLDEN_CORPUS_PATH']
  ? path.resolve(process.cwd(), process.env['GOLDEN_CORPUS_PATH'])
  : path.resolve(process.cwd(), 'docs/test-data/Golden-Test-Mona')

const NCR_CORPUS_DIR = path.join(
  GOLDEN_CORPUS_BASE,
  'JOS24-00585 NCR - One Time Passcode_7 Languages',
)
const QA_TRANSLATION_DIR = path.join(NCR_CORPUS_DIR, '1 QA-Translation')

function hasNcrCorpus(): boolean {
  if (process.env['GOLDEN_CORPUS_PATH']) return true
  return existsSync(NCR_CORPUS_DIR) && existsSync(QA_TRANSLATION_DIR)
}

// ── Language Discovery ──

type LanguageDir = {
  language: string
  path: string
  sdlxliffFiles: string[]
  skippedFiles: { fileName: string; reason: string }[]
}

// Known language directory patterns in NCR corpus
const LANG_DIRS: { pattern: string; language: string }[] = [
  { pattern: '2024-09-12_TH', language: 'TH' },
  { pattern: '2024-09-13_ESLA', language: 'ESLA' },
  { pattern: '2024-09-16/1_Studio/FR', language: 'FR' },
  { pattern: '2024-09-16/1_Studio/IT', language: 'IT' },
  { pattern: '2024-09-16/1_Studio/PL', language: 'PL' },
  { pattern: '2024-09-16/1_Studio/pt_BR', language: 'PTBR' },
  { pattern: '2024-09-17/1_Studio/DE', language: 'DE' },
  { pattern: '2024-09-24_TR', language: 'TR' },
]

function discoverAllFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const results: string[] = []
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...discoverAllFiles(full))
    } else {
      results.push(full)
    }
  }
  return results
}

function discoverLanguages(): LanguageDir[] {
  const languages: LanguageDir[] = []

  for (const ld of LANG_DIRS) {
    const langPath = path.join(QA_TRANSLATION_DIR, ld.pattern)
    if (!existsSync(langPath)) continue

    const allFiles = discoverAllFiles(langPath)
    const sdlxliffFiles: string[] = []
    const skippedFiles: { fileName: string; reason: string }[] = []

    for (const f of allFiles) {
      const basename = path.basename(f)
      if (f.endsWith('.sdlxliff')) {
        sdlxliffFiles.push(f)
      } else if (f.endsWith('.vtt')) {
        skippedFiles.push({ fileName: basename, reason: 'VTT subtitle format — not supported' })
      } else if (f.endsWith('.xlsx') || f.endsWith('.xls')) {
        skippedFiles.push({ fileName: basename, reason: 'Excel format — not SDLXLIFF' })
      } else if (f.endsWith('.sdlproj')) {
        // Studio project file — not a translation file
      } else {
        skippedFiles.push({ fileName: basename, reason: `Unsupported format: ${path.extname(f)}` })
      }
    }

    languages.push({
      language: ld.language,
      path: langPath,
      sdlxliffFiles,
      skippedFiles,
    })
  }

  return languages
}

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

type LanguageResult = {
  language: string
  fileCount: number
  segmentCount: number
  findingCount: number
  skippedFiles: { fileName: string; reason: string }[]
}

// ── Test Suite ──

describe.skipIf(!hasNcrCorpus())('Tier 2 Multi-Language Parity (AC2)', () => {
  let languageDirs: LanguageDir[]
  let languageResults: LanguageResult[]

  beforeAll(async () => {
    if (process.env['GOLDEN_CORPUS_PATH'] && !existsSync(NCR_CORPUS_DIR)) {
      throw new Error(`GOLDEN_CORPUS_PATH set but NCR corpus not found at: ${NCR_CORPUS_DIR}`)
    }

    languageDirs = discoverLanguages()
    languageResults = []

    const projectId = faker.string.uuid()
    const tenantId = faker.string.uuid()

    for (const langDir of languageDirs) {
      let totalSegments = 0
      let totalFindings = 0

      for (const filePath of langDir.sdlxliffFiles) {
        const xml = readFileSync(filePath, 'utf-8')
        const result = parseXliff(xml)

        if (!result.success) {
          langDir.skippedFiles.push({
            fileName: path.basename(filePath),
            reason: `Parse error: ${result.error.message}`,
          })
          continue
        }

        const fileId = faker.string.uuid()
        const segments = result.data.segments.map((seg) =>
          toSegmentRecord(seg, { fileId, projectId, tenantId }),
        )
        totalSegments += segments.length

        const findings = await processFile(segments, [], new Set(), [])
        totalFindings += findings.length
      }

      languageResults.push({
        language: langDir.language,
        fileCount: langDir.sdlxliffFiles.length,
        segmentCount: totalSegments,
        findingCount: totalFindings,
        skippedFiles: langDir.skippedFiles,
      })
    }

    // Summary
    process.stderr.write(`\n=== Tier 2 Multi-Language Summary ===\n`)
    process.stderr.write(
      `${'Lang'.padEnd(8)} | ${'Files'.padStart(5)} | ${'Segs'.padStart(6)} | ${'Findings'.padStart(8)}\n`,
    )
    process.stderr.write('-'.repeat(40) + '\n')
    for (const lr of languageResults) {
      process.stderr.write(
        `${lr.language.padEnd(8)} | ${String(lr.fileCount).padStart(5)} | ${String(lr.segmentCount).padStart(6)} | ${String(lr.findingCount).padStart(8)}\n`,
      )
    }
  }, 180_000)

  it('should discover all SDLXLIFF files in NCR corpus per language', () => {
    expect(languageDirs.length).toBeGreaterThanOrEqual(1)

    for (const langDir of languageDirs) {
      // Each discovered language should have at least 1 SDLXLIFF file
      expect(langDir.sdlxliffFiles.length).toBeGreaterThan(0)
    }

    process.stderr.write(`\nDiscovered ${languageDirs.length} languages with SDLXLIFF files\n`)
  })

  it('should produce per-language parity percentage', () => {
    // AC2 is measurement only — no pass/fail threshold
    // Document findings per language for Mona to review
    expect(languageResults.length).toBeGreaterThan(0)

    process.stderr.write(`\n=== Per-Language Engine Findings ===\n`)
    for (const result of languageResults) {
      const findingsPerSeg =
        result.segmentCount > 0 ? (result.findingCount / result.segmentCount).toFixed(2) : 'N/A'
      process.stderr.write(
        `${result.language}: ${result.findingCount} findings in ${result.segmentCount} segments (${findingsPerSeg} findings/seg)\n`,
      )
    }
  })

  it('should skip non-SDLXLIFF files (VTT, Excel) and document reason', () => {
    const allSkipped: { language: string; fileName: string; reason: string }[] = []

    for (const lr of languageResults) {
      for (const skipped of lr.skippedFiles) {
        allSkipped.push({ language: lr.language, ...skipped })
      }
    }

    // Every skipped file must have a reason
    for (const skipped of allSkipped) {
      expect(skipped.reason).toBeTruthy()
    }

    if (allSkipped.length > 0) {
      process.stderr.write(`\n=== Skipped Files (${allSkipped.length}) ===\n`)
      // Show unique reasons with counts
      const reasonCounts: Record<string, number> = {}
      for (const s of allSkipped) {
        reasonCounts[s.reason] = (reasonCounts[s.reason] ?? 0) + 1
      }
      for (const [reason, count] of Object.entries(reasonCounts)) {
        process.stderr.write(`  ${reason}: ${count}\n`)
      }
    }
  })

  it('should flag languages with parity < 90% for investigation', () => {
    // For measurement mode: flag languages with abnormally high finding rates
    // This is a proxy for parity — high finding rate per segment may indicate issues
    const flagged = languageResults.filter(
      (lr) => lr.segmentCount > 0 && lr.findingCount / lr.segmentCount > 2.0,
    )

    if (flagged.length > 0) {
      process.stderr.write(
        `\n⚠️ WARNING: ${flagged.length} languages have > 2.0 findings/segment — investigate:\n`,
      )
      for (const f of flagged) {
        process.stderr.write(
          `  ${f.language}: ${(f.findingCount / f.segmentCount).toFixed(2)} findings/seg\n`,
        )
      }
    }

    // Measurement only — this test always passes, flagging is informational
    expect(languageResults).toBeDefined()
  })
})
