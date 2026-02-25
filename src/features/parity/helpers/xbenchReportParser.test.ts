/// <reference types="vitest/globals" />

// xbenchReportParser: Parses Xbench QA export .xlsx files into structured findings
// The parser must handle dynamic column order, authority rules, and malformed inputs.

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('xbenchReportParser', () => {
  // ── P0: Column discovery ──

  it.skip('[P0] should discover column names dynamically from header row', async () => {
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
  })

  // ── P1: Grouping and authority ──

  it.skip('[P1] should group findings by filename', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')

    // Mock buffer representing xlsx with findings across 2 files
    const mockBuffer = Buffer.from('mock-xlsx-data')
    const result = await parseXbenchReport(mockBuffer)

    // fileGroups should be a Map/Record keyed by filename
    expect(result.fileGroups).toBeDefined()
    const groupKeys = Object.keys(result.fileGroups)
    expect(groupKeys.length).toBeGreaterThanOrEqual(1)
  })

  it.skip('[P1] should apply authority rules: Original > Updated, ignore LI', async () => {
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

  it.skip('[P1] should handle malformed xlsx with graceful error', async () => {
    const { parseXbenchReport } = await import('./xbenchReportParser')

    // Completely invalid data — not an xlsx file
    const malformedBuffer = Buffer.from('this is not xlsx data')

    await expect(parseXbenchReport(malformedBuffer)).rejects.toThrow()
  })

  it.skip('[P1] should parse correctly even with reordered columns', async () => {
    // Columns might be: "File", "Category", "Source", "Target", "Severity"
    // instead of the typical: "Source", "Target", "File", "Category", "Severity"
    const { parseXbenchReport } = await import('./xbenchReportParser')

    const mockBuffer = Buffer.from('mock-xlsx-reordered')
    const result = await parseXbenchReport(mockBuffer)

    // Regardless of column order, findings should have correct field mapping
    for (const finding of result.findings) {
      expect(finding).toHaveProperty('sourceText')
      expect(finding).toHaveProperty('targetText')
      expect(finding).toHaveProperty('category')
      expect(finding).toHaveProperty('fileName')
    }
  })
})
