/**
 * Parses Xbench QA reports in STANDARD TABULAR format (header in row 1).
 *
 * Known limitation: Does NOT support sectioned/custom Xbench report format
 * (category headers starting at row 12+, e.g. golden corpus report).
 * See integration test `readGoldenCorpusXbench()` in
 * `src/__tests__/integration/parity-helpers-real-data.test.ts` for sectioned format handling.
 *
 * Backlog: Support multiple formats via Strategy Pattern (format auto-detection + delegate).
 */
import ExcelJS from 'exceljs'

import { logger } from '@/lib/logger'

type XbenchFinding = {
  sourceText: string
  targetText: string
  category: string
  severity: string
  fileName: string
  segmentNumber: number
  authority?: string
}

type XbenchParseResult = {
  findings: XbenchFinding[]
  fileGroups: Record<string, XbenchFinding[]>
}

export async function parseXbenchReport(buffer: Uint8Array): Promise<XbenchParseResult> {
  const workbook = new ExcelJS.Workbook()
  // ExcelJS xlsx.load() accepts Buffer but Uint8Array type doesn't match
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any)

  const worksheet = workbook.getWorksheet(1)
  if (!worksheet) {
    throw new Error('No worksheet found in xlsx file')
  }

  // Discover column positions dynamically from header row (row 1)
  const columnMap = new Map<string, number>()
  let headerParsed = false

  const findings: XbenchFinding[] = []

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      // Parse header row — discover column names by position
      for (let col = 1; col <= 20; col++) {
        const cellValue = row.getCell(col).value
        if (cellValue !== null && cellValue !== undefined) {
          columnMap.set(String(cellValue).toLowerCase().trim(), col)
        }
      }
      headerParsed = true
      return
    }

    if (!headerParsed) return

    const getValue = (name: string): string => {
      const colNum = columnMap.get(name.toLowerCase())
      if (!colNum) return ''
      const val = row.getCell(colNum).value
      return val !== null && val !== undefined ? String(val) : ''
    }

    const getNumValue = (name: string): number => {
      const colNum = columnMap.get(name.toLowerCase())
      if (!colNum) return 0
      const val = row.getCell(colNum).value
      return typeof val === 'number' ? val : Number(val) || 0
    }

    // Authority rules: ignore LI (Language Inspector) findings
    const authority = getValue('authority').trim()
    if (authority === 'LI') {
      logger.debug('Skipping LI (Language Inspector) finding')
      return
    }

    const finding: XbenchFinding = {
      sourceText: getValue('source'),
      targetText: getValue('target'),
      category: getValue('category'),
      severity: getValue('severity'),
      fileName: getValue('file'),
      segmentNumber: getNumValue('segment'),
    }
    if (authority) {
      finding.authority = authority
    }
    findings.push(finding)
  })

  // Group findings by filename
  const fileGroups: Record<string, XbenchFinding[]> = {}
  for (const finding of findings) {
    const group = fileGroups[finding.fileName] ?? []
    group.push(finding)
    fileGroups[finding.fileName] = group
  }

  logger.info(
    `Parsed Xbench report: ${findings.length} findings across ${Object.keys(fileGroups).length} files`,
  )

  return { findings, fileGroups }
}
