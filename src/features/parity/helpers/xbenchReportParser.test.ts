/// <reference types="vitest/globals" />

// xbenchReportParser: Parses Xbench QA export .xlsx files into structured findings
// The parser must handle dynamic column order, authority rules, and malformed inputs.

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ── Mock exceljs: pre-generated tests use mock buffers, not real xlsx ──
const MOCK_WORKSHEETS: Record<string, unknown[][]> = {
  'mock-xlsx-data': [
    [undefined, 'Source', 'Target', 'Category', 'Severity', 'File', 'Segment', 'Authority'],
    [
      undefined,
      'Test source',
      'Test target',
      'Key Term Mismatch',
      'major',
      'intro.sdlxliff',
      1,
      'Original',
    ],
    [
      undefined,
      'Another src',
      'Another tgt',
      'Number Mismatch',
      'minor',
      'chapter1.xlf',
      2,
      'Updated',
    ],
    [undefined, 'LI source', 'LI target', 'Double Space', 'minor', 'intro.sdlxliff', 3, 'LI'],
  ],
  'mock-xlsx-reordered': [
    [undefined, 'File', 'Category', 'Source', 'Target', 'Severity', 'Segment'],
    [undefined, 'test.sdlxliff', 'accuracy', 'Apple text', 'แอปเปิ้ล', 'major', 1],
  ],

  // Sectioned format: rows 1–12 = preamble, row 13+ = category markers + file references
  'mock-xlsx-sectioned': [
    // rows 1–12 (indices 0–11): preamble
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    // row 13 (index 12): category section marker — colA = values[1]
    [undefined, 'Tag Mismatch'],
    // row 14 (index 13): file finding — colA = file ref, colC = source, colD = target
    [undefined, 'chapter1.sdlxliff (5)', undefined, 'Hello world', 'สวัสดีโลก'],
    // row 15 (index 14): second category
    [undefined, 'Numeric Mismatch'],
    // row 16 (index 15): second finding (different file)
    [undefined, 'intro.sdlxliff (10)', undefined, 'Total: 100', 'รวม: 200'],
  ],

  // Sectioned format with LI section — LI findings must be filtered
  'mock-xlsx-sectioned-li': [
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined, 'Tag Mismatch'],
    [undefined, 'chapter1.sdlxliff (5)', undefined, 'Hello', 'สวัสดี'],
    // Language Inspector section — must be skipped
    [undefined, 'Language Inspector'],
    [undefined, 'intro.sdlxliff (1)', undefined, 'LI source', 'LI target'],
  ],

  // Sectioned format with richText cell in colC
  'mock-xlsx-sectioned-richtext': [
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined, 'Tag Mismatch'],
    [
      undefined,
      'chapter1.sdlxliff (3)',
      undefined,
      { richText: [{ text: 'Rich ' }, { text: 'source' }] },
      'Rich target',
    ],
  ],

  // Sectioned format with no section markers → empty result
  'mock-xlsx-sectioned-empty': [
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined, 'Some other content'],
    [undefined, 'No file references here'],
  ],

  // Sectioned format with unrecognized category marker (CR R2 M2: catch-all branch test)
  'mock-xlsx-sectioned-unrecognized': [
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined, 'Double Space'],
    [undefined, 'chapter1.sdlxliff (1)', undefined, 'Extra space', 'ช่องว่างเกิน'],
  ],

  // Sectioned format with .xlf and .xliff file extensions (CR R1 M2: regex coverage)
  'mock-xlsx-sectioned-xlf': [
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined, 'Tag Mismatch'],
    [undefined, 'file.xlf (7)', undefined, 'Source xlf', 'Target xlf'],
    [undefined, 'Numeric Mismatch'],
    [undefined, 'doc.xliff (3)', undefined, 'Source xliff', 'Target xliff'],
  ],

  // Sectioned format with all documented category markers (CR R1 M5: branch coverage)
  'mock-xlsx-sectioned-all-categories': [
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined],
    [undefined, 'Inconsistency in Source'],
    [undefined, 'chapter1.sdlxliff (1)', undefined, 'Source 1', 'Target 1'],
    [undefined, 'Inconsistency in Target'],
    [undefined, 'chapter2.sdlxliff (2)', undefined, 'Source 2', 'Target 2'],
    [undefined, 'Repeated Word'],
    [undefined, 'chapter3.sdlxliff (3)', undefined, 'Source 3', 'Target 3'],
    [undefined, 'Key Term Mismatch (EN)'],
    [undefined, 'chapter4.sdlxliff (4)', undefined, 'Source 4', 'Target 4'],
  ],
}

let _activeRows: unknown[][] = []
let _hasWorksheet = true

vi.mock('exceljs', () => ({
  default: {
    Workbook: class MockWorkbook {
      xlsx = {
        load: async (buffer: Buffer) => {
          const key = buffer.toString()
          if (key === 'mock-xlsx-no-sheet') {
            _hasWorksheet = false
            return
          }
          const rows = MOCK_WORKSHEETS[key]
          if (!rows) throw new Error('Invalid xlsx format')
          _activeRows = rows
          _hasWorksheet = true
        },
      }
      getWorksheet() {
        if (!_hasWorksheet) return null
        return {
          eachRow: (
            callback: (
              row: { getCell: (col: number) => { value: unknown } },
              rowNumber: number,
            ) => void,
          ) => {
            _activeRows.forEach((values, i) => {
              callback(
                {
                  getCell: (col: number) => ({ value: values[col] }),
                },
                i + 1,
              )
            })
          },
        }
      }
    },
  },
}))

beforeEach(() => {
  _activeRows = []
  _hasWorksheet = true
})

describe('xbenchReportParser', () => {
  // ── P0: Column discovery ──

  it('[P0] should discover column names dynamically from header row', async () => {
    // Xbench exports can have columns in any order. The parser must read
    // the first row as headers and map them by name (e.g., "Source", "Target",
    // "Category", "Severity", "File", "Segment") regardless of position.
    const { parseXbenchReport } = await import('./xbenchReportParser')

    // Create a mock xlsx buffer with known header order
    const mockBuffer = Buffer.from('mock-xlsx-data')
    const result = await parseXbenchReport(mockBuffer)

    // Should return a structured result with recognized columns
    expect(result).toHaveProperty('findings')
    expect(result).toHaveProperty('fileGroups')
    expect(result.findings).toBeInstanceOf(Array)
    // mock-xlsx-data has 3 rows: 2 non-LI + 1 LI → 2 findings
    expect(result.findings.length).toBe(2)
  })

  // ── P1: Grouping and authority ──

  it('[P1] should group findings by filename', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')

    // Mock buffer representing xlsx with findings across 2 files
    const mockBuffer = Buffer.from('mock-xlsx-data')
    const result = await parseXbenchReport(mockBuffer)

    // fileGroups should be a Map/Record keyed by filename
    expect(result.fileGroups).toBeDefined()
    const groupKeys = Object.keys(result.fileGroups)
    // mock-xlsx-data has 2 distinct files: intro.sdlxliff, chapter1.xlf
    expect(groupKeys.length).toBe(2)
    expect(groupKeys).toContain('intro.sdlxliff')
    expect(groupKeys).toContain('chapter1.xlf')
  })

  it('[P1] should apply authority rules: Original > Updated, ignore LI', async () => {
    // Xbench has authority column: "Original", "Updated", "LI" (Language Inspector)
    // Original findings override Updated; LI findings are informational only (ignored)
    const { parseXbenchReport } = await import('./xbenchReportParser')

    const mockBuffer = Buffer.from('mock-xlsx-data')
    const result = await parseXbenchReport(mockBuffer)

    // Findings should NOT contain any with authority === 'LI'
    for (const finding of result.findings) {
      expect(finding.authority).not.toBe('LI')
    }
  })

  it('[P1] should handle malformed xlsx with graceful error', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')

    // Completely invalid data — not an xlsx file
    const malformedBuffer = Buffer.from('this is not xlsx data')

    await expect(parseXbenchReport(malformedBuffer)).rejects.toThrow()
  })

  it('[P1] should parse correctly even with reordered columns', async () => {
    // Columns might be: "File", "Category", "Source", "Target", "Severity"
    // instead of the typical: "Source", "Target", "File", "Category", "Severity"
    const { parseXbenchReport } = await import('./xbenchReportParser')

    const mockBuffer = Buffer.from('mock-xlsx-reordered')
    const result = await parseXbenchReport(mockBuffer)

    // Regardless of column order, findings should have correct field mapping
    expect(result.findings.length).toBe(1)
    expect(result.findings[0]?.sourceText).toBe('Apple text')
    expect(result.findings[0]?.category).toBe('accuracy')
    expect(result.findings[0]?.fileName).toBe('test.sdlxliff')
  })
})

// ── Story 2.9: Sectioned Format Support (Strategy Pattern) ──
// Sectioned format: category section markers + file references (preamble rows 1–12)

describe('xbenchReportParser — sectioned format (Story 2.9)', () => {
  // ── P0: Core behavior ──

  it('[P0] should auto-detect sectioned format and extract findings', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned')
    const result = await parseXbenchReport(mockBuffer)

    expect(result.findings.length).toBe(2)
    expect(result.findings[0]?.category).toBe('Tag Mismatch')
    expect(result.findings[0]?.fileName).toBe('chapter1.sdlxliff')
    expect(result.findings[0]?.segmentNumber).toBe(5)
    expect(result.findings[1]?.category).toBe('Numeric Mismatch')
    expect(result.findings[1]?.fileName).toBe('intro.sdlxliff')
  })

  it('[P0] should still parse tabular format after Strategy Pattern refactor (regression)', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    // 'mock-xlsx-data' = tabular format: 3 rows - 1 LI = 2 findings
    const mockBuffer = Buffer.from('mock-xlsx-data')
    const result = await parseXbenchReport(mockBuffer)

    expect(result.findings.length).toBe(2)
    expect(result.findings[0]?.sourceText).toBe('Test source')
    expect(result.findings[0]?.category).toBe('Key Term Mismatch')
  })

  // ── P1: Sectioned format details ──

  it('[P1] should group sectioned findings by filename', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned')
    const result = await parseXbenchReport(mockBuffer)

    expect(Object.keys(result.fileGroups)).toContain('chapter1.sdlxliff')
    expect(Object.keys(result.fileGroups)).toContain('intro.sdlxliff')
    expect(result.fileGroups['chapter1.sdlxliff']?.length).toBe(1)
    expect(result.fileGroups['intro.sdlxliff']?.length).toBe(1)
  })

  it('[P1] should filter LI (Language Inspector) findings in sectioned format', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned-li')
    const result = await parseXbenchReport(mockBuffer)

    // Only 1 finding (Tag Mismatch row 14); LI section findings are filtered
    expect(result.findings.length).toBe(1)
    expect(result.findings[0]?.category).toBe('Tag Mismatch')
    const liFindings = result.findings.filter((f) => f.sourceText === 'LI source')
    expect(liFindings.length).toBe(0)
  })

  it('[P1] should default severity to "major" for all sectioned format findings', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned')
    const result = await parseXbenchReport(mockBuffer)

    // Sectioned format has no severity column — must default to 'major'
    // Required for compareFindings() severityWithinTolerance() to match
    for (const finding of result.findings) {
      expect(finding.severity).toBe('major')
    }
  })

  it('[P1] should skip preamble rows 1–12 in sectioned format', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned')
    const result = await parseXbenchReport(mockBuffer)

    // Correct: exactly 2 findings from rows 14 and 16 only
    expect(result.findings.length).toBe(2)
    // No finding with undefined/empty fileName (which preamble rows would produce)
    for (const finding of result.findings) {
      expect(finding.fileName).toBeTruthy()
      expect(finding.segmentNumber).toBeGreaterThan(0)
    }
  })

  it('[P1] should set currentCategory from section markers in sectioned format', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned')
    const result = await parseXbenchReport(mockBuffer)

    // Row 13 "Tag Mismatch" → finding at row 14 gets category "Tag Mismatch"
    // Row 15 "Numeric Mismatch" → finding at row 16 gets category "Numeric Mismatch"
    expect(result.findings[0]?.category).toBe('Tag Mismatch')
    expect(result.findings[1]?.category).toBe('Numeric Mismatch')
  })

  it('[P1] should propagate ExcelJS throw on malformed xlsx (sectioned parse path)', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const malformedBuffer = Buffer.from('this is not xlsx data')
    await expect(parseXbenchReport(malformedBuffer)).rejects.toThrow()
  })

  // ── P2: Edge cases ──

  it('[P2] should return empty result for valid xlsx with no section markers (not an error)', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned-empty')
    const result = await parseXbenchReport(mockBuffer)

    // Empty sectioned format is valid — empty result, not throw
    expect(result.findings).toEqual([])
    expect(result.fileGroups).toEqual({})
  })

  it('[P2] should handle richText cell values in sectioned format', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned-richtext')
    const result = await parseXbenchReport(mockBuffer)

    // getCellText() must join richText parts: [{text:'Rich '},{text:'source'}] → 'Rich source'
    expect(result.findings[0]?.sourceText).toBe('Rich source')
    expect(result.findings[0]?.targetText).toBe('Rich target')
  })

  it('[P2] should detect tabular format when row 1 contains column headers', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    // 'mock-xlsx-reordered' has tabular headers in row 1
    const mockBuffer = Buffer.from('mock-xlsx-reordered')
    const result = await parseXbenchReport(mockBuffer)

    // Tabular detection: 'mock-xlsx-reordered' has exactly 1 data row
    expect(result.findings.length).toBe(1)
    expect(result.findings[0]?.sourceText).toBe('Apple text')
  })

  // ── CR R1 fixes: additional coverage ──

  it('[P1] should parse .xlf and .xliff file references in sectioned format', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned-xlf')
    const result = await parseXbenchReport(mockBuffer)

    expect(result.findings.length).toBe(2)
    expect(result.findings[0]?.fileName).toBe('file.xlf')
    expect(result.findings[0]?.segmentNumber).toBe(7)
    expect(result.findings[1]?.fileName).toBe('doc.xliff')
    expect(result.findings[1]?.segmentNumber).toBe(3)
  })

  it('[P1] should recognize all documented section markers', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned-all-categories')
    const result = await parseXbenchReport(mockBuffer)

    expect(result.findings.length).toBe(4)
    expect(result.findings[0]?.category).toBe('Inconsistency in Source')
    expect(result.findings[1]?.category).toBe('Inconsistency in Target')
    expect(result.findings[2]?.category).toBe('Repeated Word')
    expect(result.findings[3]?.category).toBe('Key Term Mismatch')
  })

  it('[P2] should pass through unrecognized category via catch-all else', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-sectioned-unrecognized')
    const result = await parseXbenchReport(mockBuffer)

    // "Double Space" is not a named marker — catch-all sets currentCategory = colA
    expect(result.findings.length).toBe(1)
    expect(result.findings[0]?.category).toBe('Double Space')
  })

  it('[P1] should throw when xlsx has no worksheet', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')
    const mockBuffer = Buffer.from('mock-xlsx-no-sheet')
    await expect(parseXbenchReport(mockBuffer)).rejects.toThrow('No worksheet found')
  })
})
