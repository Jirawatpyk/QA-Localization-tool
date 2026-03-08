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

  // ── Coverage gap mocks (TA) ──

  // G1: LI section recovery — Tag Mismatch → LI → Numeric Mismatch
  'mock-xlsx-sectioned-li-recovery': [
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
    [undefined, 'chapter1.sdlxliff (1)', undefined, 'Tag src', 'Tag tgt'],
    [undefined, 'Language Inspector'],
    [undefined, 'intro.sdlxliff (2)', undefined, 'LI src', 'LI tgt'],
    [undefined, 'Numeric Mismatch'],
    [undefined, 'chapter2.sdlxliff (3)', undefined, 'Num src', 'Num tgt'],
  ],

  // G2: Multiple findings under same section
  'mock-xlsx-sectioned-multi': [
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
    [undefined, 'file1.sdlxliff (1)', undefined, 'Src A', 'Tgt A'],
    [undefined, 'file2.sdlxliff (2)', undefined, 'Src B', 'Tgt B'],
    [undefined, 'file3.sdlxliff (3)', undefined, 'Src C', 'Tgt C'],
  ],

  // G3: Tabular format with richText cell
  'mock-xlsx-tabular-richtext': [
    [undefined, 'Source', 'Target', 'Category', 'Severity', 'File', 'Segment'],
    [
      undefined,
      { richText: [{ text: 'Rich ' }, { text: 'tabular' }] },
      'Plain target',
      'Tag Mismatch',
      'major',
      'intro.sdlxliff',
      1,
    ],
  ],

  // G4: Same filename across different sections
  'mock-xlsx-sectioned-same-file': [
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
    [undefined, 'chapter1.sdlxliff (5)', undefined, 'Tag src', 'Tag tgt'],
    [undefined, 'Numeric Mismatch'],
    [undefined, 'chapter1.sdlxliff (10)', undefined, 'Num src', 'Num tgt'],
  ],

  // G19: File ref before any section marker → empty category
  'mock-xlsx-sectioned-no-marker': [
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
    [undefined, 'chapter1.sdlxliff (5)', undefined, 'Orphan src', 'Orphan tgt'],
  ],

  // G29: Unmatched file-like row corrupts category via catch-all
  'mock-xlsx-sectioned-bad-ref': [
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
    [undefined, 'chapter1.sdlxliff (5)', undefined, 'Good src', 'Good tgt'],
    [undefined, 'report.mxliff (10)'],
    [undefined, 'intro.sdlxliff (3)', undefined, 'Bad cat src', 'Bad cat tgt'],
  ],

  // G5: Empty worksheet (0 rows)
  'mock-xlsx-empty-rows': [],

  // G6+G10: Consecutive markers + empty colA rows
  'mock-xlsx-sectioned-consecutive': [
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
    [undefined, ''],
    [undefined, null],
    [undefined, 'Numeric Mismatch'],
    [undefined, 'chapter1.sdlxliff (1)', undefined, 'Src', 'Tgt'],
  ],

  // G7: Sectioned format with numeric value in colC
  'mock-xlsx-sectioned-number-cell': [
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
    [undefined, 'chapter1.sdlxliff (1)', undefined, 42, 'Target text'],
  ],

  // G8: getCellText boolean fallback
  'mock-xlsx-sectioned-bool-cell': [
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
    [undefined, 'chapter1.sdlxliff (1)', undefined, true, 'Target text'],
  ],

  // G9: Tabular format with non-numeric segment
  'mock-xlsx-tabular-nan-segment': [
    [undefined, 'Source', 'Target', 'Category', 'Severity', 'File', 'Segment'],
    [undefined, 'Src', 'Tgt', 'Tag Mismatch', 'major', 'intro.sdlxliff', 'abc'],
  ],

  // G13: richText with empty parts
  'mock-xlsx-sectioned-richtext-empty': [
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
      'chapter1.sdlxliff (1)',
      undefined,
      { richText: [{ text: '' }, { text: 'only' }] },
      'Target',
    ],
  ],

  // G14: richText with intermediate whitespace
  'mock-xlsx-sectioned-richtext-whitespace': [
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
      'chapter1.sdlxliff (1)',
      undefined,
      { richText: [{ text: ' Hello ' }, { text: ' World ' }] },
      'Target',
    ],
  ],

  // G15: Single tabular marker → detected as tabular
  'mock-xlsx-single-header': [
    [undefined, 'Source'],
    [undefined, 'Some value'],
  ],

  // G16: Case-mixed headers → detected as tabular
  'mock-xlsx-case-mixed': [
    [undefined, 'SOURCE', 'target', 'CATEGORY', 'Severity', 'File', 'Segment'],
    [undefined, 'Src', 'Tgt', 'Tag Mismatch', 'major', 'intro.sdlxliff', 1],
  ],

  // G17: Missing severity column in tabular
  'mock-xlsx-missing-severity': [
    [undefined, 'Source', 'Target', 'Category', 'File', 'Segment'],
    [undefined, 'Src', 'Tgt', 'Tag Mismatch', 'intro.sdlxliff', 1],
  ],

  // G18: All-LI tabular → empty
  'mock-xlsx-all-li': [
    [undefined, 'Source', 'Target', 'Category', 'Severity', 'File', 'Segment', 'Authority'],
    [undefined, 'LI src 1', 'LI tgt 1', 'Double Space', 'minor', 'intro.sdlxliff', 1, 'LI'],
    [undefined, 'LI src 2', 'LI tgt 2', 'Extra Tab', 'minor', 'chapter1.sdlxliff', 2, 'LI'],
  ],

  // G20: Unsupported file extension .mxliff → treated as section marker
  'mock-xlsx-sectioned-unsupported-ext': [
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
    [undefined, 'report.mxliff (10)'],
    [undefined, 'chapter1.sdlxliff (1)', undefined, 'Src', 'Tgt'],
  ],

  // G21: Segment number = 0 in file ref
  'mock-xlsx-sectioned-seg-zero': [
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
    [undefined, 'chapter1.sdlxliff (0)', undefined, 'Zero seg src', 'Zero seg tgt'],
  ],

  // G23: Spaces in filename
  'mock-xlsx-sectioned-space-filename': [
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
    [undefined, 'my file.sdlxliff (42)', undefined, 'Space src', 'Space tgt'],
  ],

  // G24: Empty tabular (header only, no data rows)
  'mock-xlsx-tabular-empty': [
    [undefined, 'Source', 'Target', 'Category', 'Severity', 'File', 'Segment'],
  ],

  // G25: Parentheses in filename
  'mock-xlsx-sectioned-paren-filename': [
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
    [undefined, 'file (copy).sdlxliff (42)', undefined, 'Paren src', 'Paren tgt'],
  ],

  // G26+G30: Formula and hyperlink cell fallback
  'mock-xlsx-sectioned-formula': [
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
      'chapter1.sdlxliff (1)',
      undefined,
      { formula: '=A1', result: 'Hello' },
      { text: 'Link', hyperlink: 'http://example.com' },
    ],
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

// ── Coverage gap tests (FMA + What-If + Pre-mortem) ──

describe('xbenchReportParser — coverage gaps (TA)', () => {
  // ══════════════ P1 Gaps ══════════════

  describe('P1: Critical coverage gaps', () => {
    it('[P1] G1: should recover from LI section and resume creating findings for next category', async () => {
      // Given: Tag Mismatch → finding → Language Inspector → LI finding → Numeric Mismatch → finding
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-li-recovery')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: 2 findings (Tag Mismatch + Numeric Mismatch); LI finding filtered
      expect(result.findings.length).toBe(2)
      expect(result.findings[0]?.category).toBe('Tag Mismatch')
      expect(result.findings[0]?.fileName).toBe('chapter1.sdlxliff')
      expect(result.findings[1]?.category).toBe('Numeric Mismatch')
      expect(result.findings[1]?.fileName).toBe('chapter2.sdlxliff')
      // LI finding must not be present
      const liFindings = result.findings.filter((f) => f.sourceText === 'LI src')
      expect(liFindings.length).toBe(0)
    })

    it('[P1] G2: should create multiple findings under the same section marker', async () => {
      // Given: Tag Mismatch → 3 consecutive file refs
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-multi')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: 3 findings, all with category 'Tag Mismatch'
      expect(result.findings.length).toBe(3)
      for (const finding of result.findings) {
        expect(finding.category).toBe('Tag Mismatch')
      }
      expect(result.findings[0]?.fileName).toBe('file1.sdlxliff')
      expect(result.findings[1]?.fileName).toBe('file2.sdlxliff')
      expect(result.findings[2]?.fileName).toBe('file3.sdlxliff')
    })

    it('[P1] G3: should handle richText cells in tabular format via getCellText', async () => {
      // Given: tabular format with richText object in Source column
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-tabular-richtext')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: getCellText extracts and joins richText parts
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.sourceText).toBe('Rich tabular')
      expect(result.findings[0]?.targetText).toBe('Plain target')
    })

    it('[P1] G4: should group findings from same file across different sections', async () => {
      // Given: chapter1.sdlxliff appears under Tag Mismatch AND Numeric Mismatch
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-same-file')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: fileGroups['chapter1.sdlxliff'] has 2 findings with different categories
      expect(result.findings.length).toBe(2)
      const group = result.fileGroups['chapter1.sdlxliff']
      expect(group).toBeDefined()
      expect(group?.length).toBe(2)
      expect(group?.[0]?.category).toBe('Tag Mismatch')
      expect(group?.[1]?.category).toBe('Numeric Mismatch')
    })

    it('[P1] G19: should assign empty category when file ref appears before any section marker', async () => {
      // Given: row 13 is a file ref directly (no preceding section marker)
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-no-marker')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: finding has category '' (default currentCategory)
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.category).toBe('')
      expect(result.findings[0]?.fileName).toBe('chapter1.sdlxliff')
    })

    it('[P1] G29: should preserve category when unsupported-ext file-like row is skipped', async () => {
      // Given: Tag Mismatch → valid finding → 'report.mxliff (10)' (wrong ext) → next finding
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-bad-ref')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: 'report.mxliff (10)' is guarded — skipped, NOT set as category
      expect(result.findings.length).toBe(2)
      expect(result.findings[0]?.category).toBe('Tag Mismatch')
      expect(result.findings[0]?.fileName).toBe('chapter1.sdlxliff')
      // Second finding preserves 'Tag Mismatch' (no corruption)
      expect(result.findings[1]?.category).toBe('Tag Mismatch')
      expect(result.findings[1]?.fileName).toBe('intro.sdlxliff')
    })
  })

  // ══════════════ P2 Gaps ══════════════

  describe('P2: Empty / boundary worksheets', () => {
    it('[P2] G5: should return empty result for worksheet with zero rows', async () => {
      // Given: empty worksheet (no rows at all)
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-empty-rows')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: detected as 'sectioned' (default), 0 findings
      expect(result.findings).toEqual([])
      expect(result.fileGroups).toEqual({})
    })

    it('[P2] G24: should return empty result for tabular format with header only', async () => {
      // Given: tabular header row, no data rows
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-tabular-empty')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: 0 findings, empty groups
      expect(result.findings).toEqual([])
      expect(result.fileGroups).toEqual({})
    })

    it('[P2] G18: should return empty result when all tabular rows are LI authority', async () => {
      // Given: tabular format where every row has authority = 'LI'
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-all-li')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: all LI rows filtered → empty
      expect(result.findings).toEqual([])
      expect(result.fileGroups).toEqual({})
    })
  })

  describe('P2: Section markers and category transitions', () => {
    it('[P2] G6+G10: should use last marker when consecutive markers appear with empty rows between', async () => {
      // Given: Tag Mismatch → empty rows → Numeric Mismatch → file ref
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-consecutive')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: finding gets 'Numeric Mismatch' (last marker wins); empty rows silently skipped
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.category).toBe('Numeric Mismatch')
    })

    it('[P2] G20: should skip unsupported file extension row (not treat as section marker)', async () => {
      // Given: 'report.mxliff (10)' — .mxliff not in regex
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-unsupported-ext')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: .mxliff row is guarded as file-like pattern → skipped; category stays ''
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.category).toBe('')
      expect(result.findings[0]?.fileName).toBe('chapter1.sdlxliff')
    })
  })

  describe('P2: getCellText edge cases', () => {
    it('[P2] G7: should convert numeric cell value to string', async () => {
      // Given: sectioned format where colC has numeric value 42
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-number-cell')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: getCellText returns '42'
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.sourceText).toBe('42')
    })

    it('[P2] G8: should handle boolean cell value via String() fallback', async () => {
      // Given: sectioned format where colC has boolean true
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-bool-cell')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: getCellText returns 'true' via String(value).trim() fallback
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.sourceText).toBe('true')
    })

    it('[P2] G13: should handle richText with empty text parts', async () => {
      // Given: colC = { richText: [{ text: '' }, { text: 'only' }] }
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-richtext-empty')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: getCellText joins '' + 'only' → 'only' (trim applied)
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.sourceText).toBe('only')
    })

    it('[P2] G14: should preserve inner whitespace in richText while trimming outer', async () => {
      // Given: colC = { richText: [{ text: ' Hello ' }, { text: ' World ' }] }
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-richtext-whitespace')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: getCellText joins ' Hello ' + ' World ' → ' Hello  World ' → trim → 'Hello  World'
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.sourceText).toBe('Hello  World')
    })

    it('[P2] G26+G30: should extract result from formula cells and text from hyperlink cells', async () => {
      // Given: colC = { formula: '=A1', result: 'Hello' }, colD = { text: 'Link', hyperlink: '...' }
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-formula')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: getCellText extracts result from formula, text from hyperlink
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.sourceText).toBe('Hello')
      expect(result.findings[0]?.targetText).toBe('Link')
    })
  })

  describe('P2: Format detection edge cases', () => {
    it('[P2] G15: should detect tabular format when only one tabular marker is present', async () => {
      // Given: row 1 has only 'Source' (1 of 6 tabular markers)
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-single-header')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: detected as 'tabular' (.some() triggers on 1 match)
      // No data columns discovered beyond 'source' → findings have empty fields
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.sourceText).toBe('Some value')
    })

    it('[P2] G16: should detect tabular format with case-mixed headers', async () => {
      // Given: row 1 has 'SOURCE', 'target', 'CATEGORY' (mixed case)
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-case-mixed')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: detected as tabular (toLowerCase applied in detection + columnMap)
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.sourceText).toBe('Src')
      expect(result.findings[0]?.category).toBe('Tag Mismatch')
    })
  })

  describe('P2: Tabular parser edge cases', () => {
    it('[P2] G9: should return segmentNumber 0 for non-numeric segment value', async () => {
      // Given: tabular format where Segment column has 'abc'
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-tabular-nan-segment')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: Number('abc') is NaN → || 0 → segmentNumber = 0
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.segmentNumber).toBe(0)
    })

    it('[P2] G17: should default severity to "major" when severity column is missing', async () => {
      // Given: tabular header with Source, Target, Category, File, Segment (NO Severity)
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-missing-severity')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: getValue('severity') returns '' → fallback to 'major' (consistent with sectioned parser)
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.severity).toBe('major')
    })
  })

  describe('P2: Sectioned file ref parsing edge cases', () => {
    it('[P2] G21: should parse segment number 0 from file ref', async () => {
      // Given: 'chapter1.sdlxliff (0)' — segment 0
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-seg-zero')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: parseInt('0', 10) = 0
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.segmentNumber).toBe(0)
      expect(result.findings[0]?.fileName).toBe('chapter1.sdlxliff')
    })

    it('[P2] G23: should parse filename with spaces', async () => {
      // Given: 'my file.sdlxliff (42)'
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-space-filename')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: regex captures 'my file.sdlxliff' as fileName
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.fileName).toBe('my file.sdlxliff')
      expect(result.findings[0]?.segmentNumber).toBe(42)
    })

    it('[P2] G25: should parse filename with parentheses', async () => {
      // Given: 'file (copy).sdlxliff (42)'
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-paren-filename')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: greedy regex captures 'file (copy).sdlxliff' as fileName
      expect(result.findings.length).toBe(1)
      expect(result.findings[0]?.fileName).toBe('file (copy).sdlxliff')
      expect(result.findings[0]?.segmentNumber).toBe(42)
    })
  })

  describe('P2: Logger behavior', () => {
    it('[P2] G27: should log finding count 0 for non-empty worksheet yielding no findings', async () => {
      // Given: sectioned worksheet with rows but no file refs (mock-xlsx-sectioned-empty)
      const { logger } = await import('@/lib/logger')
      const { parseXbenchReport } = await import('./xbenchReportParser')
      const mockBuffer = Buffer.from('mock-xlsx-sectioned-empty')

      // When: parsing the buffer
      const result = await parseXbenchReport(mockBuffer)

      // Then: logger.info called with count 0
      expect(result.findings.length).toBe(0)
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('0 findings'))
    })
  })
})
