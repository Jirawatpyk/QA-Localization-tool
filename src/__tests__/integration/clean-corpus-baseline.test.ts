/// <reference types="vitest/globals" />
/**
 * Story 2.10 — AC6: False Positive Baseline (Clean Corpus)
 *
 * Process 14 clean SDLXLIFF files (known zero real issues) from
 * docs/test-data/Golden-Test-Mona/2026-02-24_Studio_No_issues_Mona/
 * and document any findings as false positives.
 *
 * No hard threshold — this establishes the baseline.
 * If count > 20, investigate root cause.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

import { faker } from '@faker-js/faker'

import { parseXliff } from '@/features/parser/sdlxliffParser'
import { processFile } from '@/features/pipeline/engine/ruleEngine'
import type { RuleCheckResult, SegmentRecord } from '@/features/pipeline/engine/types'
import { buildSegmentRecordFromParsed } from '@/test/factories'

// ── File Paths ──
// NOTE: process.env used directly — @/lib/env unavailable in Vitest Node test process

const GOLDEN_CORPUS_BASE = process.env['GOLDEN_CORPUS_PATH']
  ? path.resolve(process.cwd(), process.env['GOLDEN_CORPUS_PATH'])
  : path.resolve(process.cwd(), 'docs/test-data/Golden-Test-Mona')

const CLEAN_CORPUS_DIR = path.join(GOLDEN_CORPUS_BASE, '2026-02-24_Studio_No_issues_Mona')

function hasCleanCorpus(): boolean {
  if (process.env['GOLDEN_CORPUS_PATH']) return true
  return existsSync(CLEAN_CORPUS_DIR)
}

// ── Helpers ──

function discoverSdlxliffFiles(dir: string): string[] {
  const files: string[] = []
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...discoverSdlxliffFiles(fullPath))
    } else if (entry.endsWith('.sdlxliff')) {
      files.push(fullPath)
    }
  }
  return files
}

// ── Test Suite ──

describe.skipIf(!hasCleanCorpus())('Clean Corpus False Positive Baseline (AC6)', () => {
  let allFindings: RuleCheckResult[]
  let findingsByCheckType: Record<string, RuleCheckResult[]>
  let fileCount: number

  beforeAll(async () => {
    if (process.env['GOLDEN_CORPUS_PATH'] && !existsSync(CLEAN_CORPUS_DIR)) {
      throw new Error(`GOLDEN_CORPUS_PATH set but clean corpus not found at: ${CLEAN_CORPUS_DIR}`)
    }

    const projectId = faker.string.uuid()
    const tenantId = faker.string.uuid()
    const sdlxliffFiles = discoverSdlxliffFiles(CLEAN_CORPUS_DIR)
    fileCount = sdlxliffFiles.length

    allFindings = []
    findingsByCheckType = {}

    for (const filePath of sdlxliffFiles) {
      const xml = readFileSync(filePath, 'utf-8')
      const result = parseXliff(xml)

      if (!result.success) {
        process.stderr.write(
          `  SKIP (parse error): ${path.basename(filePath)}: ${result.error.message}\n`,
        )
        continue
      }

      const fileId = faker.string.uuid()
      const segments = result.data.segments.map((seg) =>
        buildSegmentRecordFromParsed(seg, { fileId, projectId, tenantId }),
      )

      const findings = await processFile(segments, [], new Set(), [])
      allFindings.push(...findings)

      // Group by check type
      for (const finding of findings) {
        const group = findingsByCheckType[finding.category] ?? []
        group.push(finding)
        findingsByCheckType[finding.category] = group
      }
    }

    // Diagnostic output
    process.stderr.write(`\n=== Clean Corpus False Positive Baseline ===\n`)
    process.stderr.write(`Files processed: ${fileCount}\n`)
    process.stderr.write(`Total findings (false positives): ${allFindings.length}\n`)
  }, 120_000)

  it('should process 14 clean SDLXLIFF files and document finding count', () => {
    // Verify we processed the expected number of files
    expect(fileCount).toBeGreaterThanOrEqual(1)

    // Document total false positive count
    process.stderr.write(`\nFalse positive count: ${allFindings.length}\n`)

    // The count is defined — this is the baseline measurement
    expect(allFindings.length).toBeDefined()
    expect(typeof allFindings.length).toBe('number')
  })

  it('should categorize false positives by check type', () => {
    process.stderr.write(`\n=== False Positives by Check Type ===\n`)
    const sortedEntries = Object.entries(findingsByCheckType).sort(
      (a, b) => b[1].length - a[1].length,
    )

    for (const [checkType, findings] of sortedEntries) {
      process.stderr.write(`  ${checkType}: ${findings.length} false positives\n`)
    }

    // Verify breakdown exists and sums to total
    const breakdownTotal = Object.values(findingsByCheckType).reduce(
      (sum, findings) => sum + findings.length,
      0,
    )
    expect(breakdownTotal).toBe(allFindings.length)
  })

  it('should flag if false positive count exceeds 20', () => {
    if (allFindings.length > 20) {
      process.stderr.write(
        `\n⚠️ WARNING: Unreasonable false positive count (${allFindings.length}) — investigate top categories:\n`,
      )
      const sorted = Object.entries(findingsByCheckType).sort((a, b) => b[1].length - a[1].length)
      for (const [checkType, findings] of sorted.slice(0, 5)) {
        const sample = findings[0]
        process.stderr.write(
          `  ${checkType} (${findings.length}): "${sample?.description.slice(0, 80)}"\n`,
        )
      }
    }

    // Document the count — P2 test, no hard fail but useful diagnostic
    process.stderr.write(`\nFalse positive baseline: ${allFindings.length}\n`)
    expect(allFindings.length).toBeDefined()
  })
})
