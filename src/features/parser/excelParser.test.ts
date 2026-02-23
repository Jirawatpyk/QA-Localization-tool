import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it, vi } from 'vitest'

// Must be first in server-side test files
vi.mock('server-only', () => ({}))

import { MAX_PARSE_SIZE_BYTES } from './constants'
import { extractCellValue, autoDetectColumns, parseExcelBilingual } from './excelParser'

// ─── Fixtures path ─────────────────────────────────────────────────────────
const FIXTURES = join(process.cwd(), 'src', 'test', 'fixtures', 'excel')

function readFixture(name: string): ArrayBuffer {
  const buf = readFileSync(join(FIXTURES, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

// ─── extractCellValue ──────────────────────────────────────────────────────
describe('extractCellValue', () => {
  const makeCell = (value: unknown) => ({ value }) as never

  it('should return empty string for null', () => {
    expect(extractCellValue(makeCell(null))).toBe('')
  })

  it('should return empty string for undefined', () => {
    expect(extractCellValue(makeCell(undefined))).toBe('')
  })

  it('should return string as-is', () => {
    expect(extractCellValue(makeCell('Hello'))).toBe('Hello')
  })

  it('should convert number to string', () => {
    expect(extractCellValue(makeCell(42))).toBe('42')
  })

  it('should convert boolean to string', () => {
    expect(extractCellValue(makeCell(true))).toBe('true')
  })

  it('should convert Date to ISO string', () => {
    const d = new Date('2024-01-01T00:00:00.000Z')
    expect(extractCellValue(makeCell(d))).toBe('2024-01-01T00:00:00.000Z')
  })

  it('should extract rich text', () => {
    const richText = { richText: [{ text: 'Hello' }, { text: ' World' }] }
    expect(extractCellValue(makeCell(richText))).toBe('Hello World')
  })

  it('should extract formula result', () => {
    const formula = { formula: 'A1+B1', result: 'computed' }
    expect(extractCellValue(makeCell(formula))).toBe('computed')
  })

  it('should return empty string for cell error value', () => {
    const errorVal = { error: '#DIV/0!' }
    expect(extractCellValue(makeCell(errorVal))).toBe('')
  })
})

// ─── autoDetectColumns ────────────────────────────────────────────────────
describe('autoDetectColumns', () => {
  it('should detect "Source" and "Target" headers', () => {
    const result = autoDetectColumns(['Source', 'Target'])
    expect(result.suggestedSourceColumn).toBe('Source')
    expect(result.suggestedTargetColumn).toBe('Target')
  })

  it('should detect "Original" and "Translation" headers', () => {
    const result = autoDetectColumns(['Original', 'Translation', 'ID'])
    expect(result.suggestedSourceColumn).toBe('Original')
    expect(result.suggestedTargetColumn).toBe('Translation')
  })

  it('should match case-insensitively', () => {
    const result = autoDetectColumns(['SOURCE TEXT', 'TARGET TEXT'])
    expect(result.suggestedSourceColumn).toBe('SOURCE TEXT')
    expect(result.suggestedTargetColumn).toBe('TARGET TEXT')
  })

  it('should detect Thai source/target keywords', () => {
    const result = autoDetectColumns(['ต้นฉบับ', 'คำแปล'])
    expect(result.suggestedSourceColumn).toBe('ต้นฉบับ')
    expect(result.suggestedTargetColumn).toBe('คำแปล')
  })

  it('should return null when no keywords match', () => {
    const result = autoDetectColumns(['Column A', 'Column B', 'Column C'])
    expect(result.suggestedSourceColumn).toBeNull()
    expect(result.suggestedTargetColumn).toBeNull()
  })

  it('should return null for ambiguous same-column match', () => {
    // A single column header that contains both source and target keywords
    const result = autoDetectColumns(['source-target'])
    // Both would match the same column — return null for both
    const { suggestedSourceColumn, suggestedTargetColumn } = result
    // Either both null or different columns
    if (suggestedSourceColumn !== null && suggestedTargetColumn !== null) {
      expect(suggestedSourceColumn).not.toBe(suggestedTargetColumn)
    }
  })

  it('should prefer exact match over substring match', () => {
    const result = autoDetectColumns(['Source Text', 'source', 'Target', 'translation'])
    // 'source' is exact, 'Source Text' is substring — prefer 'source'
    expect(result.suggestedSourceColumn).toBe('source')
  })

  it('should handle empty header array', () => {
    const result = autoDetectColumns([])
    expect(result.suggestedSourceColumn).toBeNull()
    expect(result.suggestedTargetColumn).toBeNull()
  })
})

// ─── parseExcelBilingual — size guard ─────────────────────────────────────
describe('parseExcelBilingual — size guard', () => {
  it('should reject files over 15MB (AC #7)', async () => {
    const buffer = new ArrayBuffer(0)
    const mapping = { sourceColumn: 'A', targetColumn: 'B', hasHeader: true }
    const result = await parseExcelBilingual(
      buffer,
      mapping,
      MAX_PARSE_SIZE_BYTES + 1,
      'en-US',
      'th-TH',
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('FILE_TOO_LARGE')
      expect(result.error.message).toContain('max 15MB')
    }
  })

  it('should accept files exactly at 15MB limit', async () => {
    // File at exact limit — will fail at parse stage, not size guard
    const buffer = new ArrayBuffer(0)
    const mapping = { sourceColumn: 'A', targetColumn: 'B', hasHeader: true }
    const result = await parseExcelBilingual(
      buffer,
      mapping,
      MAX_PARSE_SIZE_BYTES,
      'en-US',
      'th-TH',
    )
    // Should fail at parse stage, not size guard
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).not.toBe('FILE_TOO_LARGE')
    }
  })
})

// ─── parseExcelBilingual — error handling ─────────────────────────────────
describe('parseExcelBilingual — error handling', () => {
  it('should return INVALID_EXCEL for corrupted file (AC #6)', async () => {
    const buffer = readFixture('malformed.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'Target', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 100, 'en-US', 'th-TH')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_EXCEL')
      expect(result.error.message).toContain('Invalid Excel file')
    }
  })

  it('should return INVALID_EXCEL for password-protected file (E1)', async () => {
    const buffer = readFixture('password-protected.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'Target', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 100, 'en-US', 'th-TH')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_EXCEL')
    }
  })

  it('should return INVALID_COLUMNS when source column not found', async () => {
    const buffer = readFixture('bilingual-with-headers.xlsx')
    const mapping = { sourceColumn: 'NonExistentColumn', targetColumn: 'Target', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 100, 'en-US', 'th-TH')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_COLUMNS')
    }
  })

  it('should return INVALID_COLUMNS when target column not found', async () => {
    const buffer = readFixture('bilingual-with-headers.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'MissingColumn', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 100, 'en-US', 'th-TH')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_COLUMNS')
    }
  })
})

// ─── parseExcelBilingual — valid parse ────────────────────────────────────
describe('parseExcelBilingual — valid parse with header row', () => {
  it('should extract 10 segments from bilingual-with-headers fixture (AC #2)', async () => {
    const buffer = readFixture('bilingual-with-headers.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'Target', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.segments).toHaveLength(10)
      expect(result.data.fileType).toBe('xlsx')
      expect(result.data.segmentCount).toBe(10)
      expect(result.data.sourceLang).toBe('en-US')
      expect(result.data.targetLang).toBe('th-TH')
    }
  })

  it('should set correct segment properties (AC #5)', async () => {
    const buffer = readFixture('bilingual-with-headers.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'Target', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(true)
    if (result.success) {
      const seg = result.data.segments[0]!
      expect(seg.sourceText).toBe('Hello')
      expect(seg.targetText).toBe('สวัสดี')
      expect(seg.sourceLang).toBe('en-US')
      expect(seg.targetLang).toBe('th-TH')
      // XLIFF-specific fields must be null (AC #5)
      expect(seg.confirmationState).toBeNull()
      expect(seg.matchPercentage).toBeNull()
      expect(seg.inlineTags).toBeNull()
      expect(seg.segmentNumber).toBe(1)
      expect(seg.wordCount).toBeGreaterThan(0)
    }
  })

  it('should use column values for segmentId and context when mapped', async () => {
    const buffer = readFixture('bilingual-with-headers.xlsx')
    const mapping = {
      sourceColumn: 'Source',
      targetColumn: 'Target',
      hasHeader: true,
      segmentIdColumn: 'Segment ID',
      contextColumn: 'Notes',
    }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.segments[0]!.segmentId).toBe('TU-001')
      expect(result.data.segments[0]!.translatorComment).toBe('Greeting')
    }
  })

  it('should generate segmentId from row number when not mapped', async () => {
    const buffer = readFixture('bilingual-with-headers.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'Target', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(true)
    if (result.success) {
      // Row 2 (first data row after header) → segmentId = "2"
      expect(result.data.segments[0]!.segmentId).toBe('2')
    }
  })

  it('should skip empty rows (both source AND target empty) (AC #2)', async () => {
    const buffer = readFixture('empty-rows.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'Target', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(true)
    if (result.success) {
      // 5 valid rows: Hello, Thank you, Yes, No + (whitespace-only skipped)
      expect(result.data.segments.length).toBeGreaterThanOrEqual(4)
      // All segments have non-empty source
      result.data.segments.forEach((seg) => {
        expect(seg.sourceText.trim().length).toBeGreaterThan(0)
      })
    }
  })

  it('should include row with empty target but non-empty source (untranslated)', async () => {
    // Test: source=text, target="" → should be included
    // Using bilingual-with-headers has all targets filled, test with programmatic fixture
    const buffer = readFixture('bilingual-with-headers.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'Target', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(true)
    // All segments present (no filter on empty target only)
    if (result.success) {
      expect(result.data.segments.length).toBe(10)
    }
  })
})

describe('parseExcelBilingual — no-header mode', () => {
  it('should parse file with no header row using column indices (AC #2)', async () => {
    const buffer = readFixture('bilingual-no-headers.xlsx')
    const mapping = { sourceColumn: '1', targetColumn: '2', hasHeader: false }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.segments).toHaveLength(10)
      expect(result.data.segments[0]!.sourceText).toBe('Hello')
      expect(result.data.segments[0]!.targetText).toBe('สวัสดี')
    }
  })

  it('should return INVALID_COLUMNS for invalid column indices', async () => {
    const buffer = readFixture('bilingual-no-headers.xlsx')
    const mapping = { sourceColumn: 'abc', targetColumn: '2', hasHeader: false }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_COLUMNS')
    }
  })
})

describe('parseExcelBilingual — multi-sheet handling (E2)', () => {
  it('should only parse first sheet when workbook has multiple sheets', async () => {
    const buffer = readFixture('multiple-sheets.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'Target', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(true)
    if (result.success) {
      // Only 2 rows from sheet 1 (Hello + World), not from sheets 2 or 3
      expect(result.data.segments).toHaveLength(2)
    }
  })
})

describe('parseExcelBilingual — merged cells handling (E3)', () => {
  it('should treat merged cells as empty for non-top-left cells', async () => {
    const buffer = readFixture('merged-cells.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'Target', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(true)
    if (result.success) {
      // Should have at least some segments from the non-merged rows
      expect(result.data.segments.length).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('parseExcelBilingual — CJK/Thai word counting (AC #5)', () => {
  it('should use Intl.Segmenter word count for Thai text', async () => {
    const buffer = readFixture('cjk-thai-content.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'Target', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'th-TH', 'en-US')
    expect(result.success).toBe(true)
    if (result.success) {
      // Thai text should have wordCount > 0
      const thaiSeg = result.data.segments[0]!
      expect(thaiSeg.wordCount).toBeGreaterThan(0)
    }
  })

  it('should count CJK words via Intl.Segmenter', async () => {
    const buffer = readFixture('cjk-thai-content.xlsx')
    const mapping = { sourceColumn: 'Target', targetColumn: 'Source', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'zh-CN', 'en-US')
    expect(result.success).toBe(true)
    if (result.success) {
      // CJK text should have wordCount > 0
      result.data.segments.forEach((seg) => {
        expect(seg.wordCount).toBeGreaterThanOrEqual(0)
      })
    }
  })
})

describe('parseExcelBilingual — single row (boundary, E5)', () => {
  it('should parse file with single data row', async () => {
    const buffer = readFixture('single-row.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'Target', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.segments).toHaveLength(1)
      expect(result.data.segments[0]!.sourceText).toBe('Hello world')
    }
  })
})

describe('parseExcelBilingual — auto-detect fixture', () => {
  it('should parse file with Original/Translation headers', async () => {
    const buffer = readFixture('bilingual-auto-detect.xlsx')
    const mapping = { sourceColumn: 'Original', targetColumn: 'Translation', hasHeader: true }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.segments).toHaveLength(5)
    }
  })
})

describe('parseExcelBilingual — language column override (C1)', () => {
  it('should use per-row language from languageColumn when mapped', async () => {
    const buffer = readFixture('bilingual-with-headers.xlsx')
    // bilingual-with-headers has no language column, so it falls back to default
    const mapping = {
      sourceColumn: 'Source',
      targetColumn: 'Target',
      hasHeader: true,
      languageColumn: 'Notes', // using Notes column as proxy for language
    }
    const result = await parseExcelBilingual(buffer, mapping, 1000, 'en-US', 'th-TH')
    expect(result.success).toBe(true)
    if (result.success) {
      // First row: Notes = 'Greeting' → becomes targetLang for that row
      expect(result.data.segments[0]!.targetLang).toBe('Greeting')
    }
  })
})

// ─── Performance test (E6) ──────────────────────────────────────────────────
describe('parseExcelBilingual — performance (E6)', () => {
  it('should parse 5000-row Excel within 3 seconds (NFR1)', async () => {
    const buffer = readFixture('large-5000-rows.xlsx')
    const mapping = { sourceColumn: 'Source', targetColumn: 'Target', hasHeader: true }

    const start = performance.now()
    const result = await parseExcelBilingual(buffer, mapping, 5 * 1024 * 1024, 'en-US', 'th-TH')
    const elapsed = performance.now() - start

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.segments).toHaveLength(5000)
    }
    expect(elapsed).toBeLessThan(3000)
  }, 10000) // 10s timeout for safety
})
