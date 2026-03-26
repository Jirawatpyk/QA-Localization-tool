/**
 * P2-01: Excel large row count (65K+) — Memory + timing benchmark.
 *
 * Validates that the Excel parser handles enterprise-scale files
 * (65K+ rows, typical of legacy TMS exports) without OOM or timeout.
 *
 * Workbook generation is excluded from timing — only parse is measured.
 */
import ExcelJS from 'exceljs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { parseExcelBilingual } from './excelParser'
import type { ExcelColumnMapping } from './validation/excelMappingSchema'

const MAPPING: ExcelColumnMapping = {
  sourceColumn: 'Source',
  targetColumn: 'Target',
  hasHeader: true,
}

/**
 * Generate a synthetic Excel buffer with N rows of bilingual data.
 * Returns ArrayBuffer + byte length for parseExcelBilingual.
 */
async function generateExcelBuffer(rowCount: number): Promise<{
  arrayBuffer: ArrayBuffer
  byteLength: number
}> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Sheet1')
  sheet.addRow(['Source', 'Target'])

  for (let i = 0; i < rowCount; i++) {
    sheet.addRow([`Source text row ${i + 1}`, `Target text row ${i + 1}`])
  }

  // @ts-expect-error ExcelJS Buffer type conflict
  const nodeBuffer: Buffer = await workbook.xlsx.writeBuffer()
  const uint8 = new Uint8Array(nodeBuffer)
  const arrayBuffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength)

  return { arrayBuffer, byteLength: nodeBuffer.byteLength }
}

describe('P2-01: Excel large row parsing performance', () => {
  // ROW_COUNT is 45,000 — under MAX_SEGMENT_COUNT (50,000) to stay within the parser limit.
  // The original 65K test was written before the segment cap was introduced.
  it('should parse 45,000 rows within 15 seconds', async () => {
    const ROW_COUNT = 45_000
    const HARD_LIMIT_MS = 15_000

    const { arrayBuffer, byteLength } = await generateExcelBuffer(ROW_COUNT)

    const start = performance.now()
    const result = await parseExcelBilingual(arrayBuffer, MAPPING, byteLength, 'en-US', 'th-TH')
    const elapsed = performance.now() - start

    process.stderr.write(
      `\nP2-01: ${ROW_COUNT.toLocaleString()} rows parsed in ${elapsed.toFixed(0)}ms (limit: ${HARD_LIMIT_MS}ms)\n`,
    )

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.segments).toHaveLength(ROW_COUNT)
    expect(elapsed).toBeLessThan(HARD_LIMIT_MS)

    // Spot-check first and last segment
    const first = result.data.segments[0]!
    expect(first.sourceText).toBe('Source text row 1')
    expect(first.segmentNumber).toBe(1)

    const last = result.data.segments[ROW_COUNT - 1]!
    expect(last.sourceText).toBe(`Source text row ${ROW_COUNT}`)
    expect(last.segmentNumber).toBe(ROW_COUNT)
  }, 60_000) // 60s timeout for workbook generation + parse

  it('should not cause excessive memory growth with 45K rows', async () => {
    const ROW_COUNT = 45_000

    const { arrayBuffer, byteLength } = await generateExcelBuffer(ROW_COUNT)

    // Force GC if available, otherwise just measure delta
    if (global.gc) global.gc()
    const heapBefore = process.memoryUsage().heapUsed

    const result = await parseExcelBilingual(arrayBuffer, MAPPING, byteLength, 'en-US', 'th-TH')

    const heapAfter = process.memoryUsage().heapUsed
    const heapDeltaMB = (heapAfter - heapBefore) / (1024 * 1024)

    process.stderr.write(
      `\nP2-01 memory: heap delta = ${heapDeltaMB.toFixed(1)}MB for ${ROW_COUNT.toLocaleString()} rows\n`,
    )

    expect(result.success).toBe(true)

    // 45K rows × ~50 chars each ≈ 2.3MB of text data
    // Allow up to 200MB for ExcelJS overhead + parsed segments
    expect(heapDeltaMB).toBeLessThan(200)
  }, 60_000)
})
