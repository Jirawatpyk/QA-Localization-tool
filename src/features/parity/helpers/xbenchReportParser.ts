/**
 * Parses Xbench QA reports in multiple formats:
 * - Standard tabular format (header in row 1) — original support
 * - Sectioned custom report format (category headers + file references, preamble rows 1–12)
 *
 * Format auto-detection: inspects row 1 for tabular column headers.
 * Public API: parseXbenchReport(buffer) — unchanged caller signature.
 */
import ExcelJS from 'exceljs'

import { logger } from '@/lib/logger'

/**
 * Internal parser output type — distinct from `XbenchReportFinding` in `@/features/parity/types`
 * (which is a different schema used by the parity comparison actions).
 */
type XbenchReportFinding = {
  sourceText: string
  targetText: string
  category: string
  severity: string
  fileName: string
  segmentNumber: number
  authority?: string
}

type XbenchParseResult = {
  findings: XbenchReportFinding[]
  fileGroups: Record<string, XbenchReportFinding[]>
}

// ── Internal helpers ──

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

/**
 * Auto-detect Xbench report format by inspecting row 1 for tabular column headers.
 * MUST use eachRow with early-stop — worksheet.getRow(n) is NOT implemented in unit test mock.
 */
function detectXbenchFormat(worksheet: ExcelJS.Worksheet): 'tabular' | 'sectioned' {
  let result: 'tabular' | 'sectioned' = 'sectioned'
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) return // only inspect row 1
    const headers = new Set<string>()
    for (let col = 1; col <= 20; col++) {
      const val = row.getCell(col).value
      if (val) headers.add(String(val).toLowerCase().trim())
    }
    const tabularMarkers = ['source', 'target', 'category', 'severity', 'file', 'segment']
    if (tabularMarkers.some((m) => headers.has(m))) result = 'tabular'
  })
  return result
}

/** Parses standard tabular Xbench format (header row in row 1, data rows 2+). */
function parseTabular(worksheet: ExcelJS.Worksheet): XbenchReportFinding[] {
  const columnMap = new Map<string, number>()
  let headerParsed = false
  const findings: XbenchReportFinding[] = []

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
      return getCellText(row.getCell(colNum))
    }

    const getNumValue = (name: string): number => {
      const colNum = columnMap.get(name.toLowerCase())
      if (!colNum) return 0
      const val = row.getCell(colNum).value
      return typeof val === 'number' ? val : Number(val) || 0
    }

    // Authority rules: ignore LI (Language Inspector) findings
    const authority = getValue('authority')
    if (authority === 'LI') {
      logger.debug('Skipping LI (Language Inspector) finding')
      return
    }

    const finding: XbenchReportFinding = {
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

  return findings
}

/**
 * Regex to match sectioned format file references: "filename.ext (segmentNumber)".
 * Supports .sdlxliff, .xlf, .xliff — the common Xbench-supported translation file extensions.
 */
const FILE_REF_REGEX = /^(.+\.(sdlxliff|xlf|xliff))\s*\((\d+)\)$/

/** Number of preamble rows to skip in sectioned Xbench format (metadata/headers). */
const SECTIONED_PREAMBLE_ROWS = 12

/** Parses sectioned Xbench format (preamble rows 1–12, category headers + file references). */
function parseSectioned(worksheet: ExcelJS.Worksheet): XbenchReportFinding[] {
  const findings: XbenchReportFinding[] = []
  let currentCategory = ''

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= SECTIONED_PREAMBLE_ROWS) return

    const colA = getCellText(row.getCell(1))
    const fileMatch = colA.match(FILE_REF_REGEX)

    if (fileMatch) {
      // File reference row — only create finding when NOT in LI (Language Inspector) section
      if (currentCategory !== 'LI') {
        findings.push({
          sourceText: getCellText(row.getCell(3)), // colC
          targetText: getCellText(row.getCell(4)), // colD
          category: currentCategory,
          severity: 'major', // sectioned format has no severity column; default for comparator
          fileName: fileMatch[1]!,
          segmentNumber: parseInt(fileMatch[3] ?? '0', 10),
        })
      }
    } else if (colA) {
      // Section marker row — always update currentCategory (allows recovery from LI state)
      if (colA.toLowerCase().includes('language inspector')) {
        currentCategory = 'LI' // sentinel — skip file-ref rows in this section
      } else if (colA.includes('Inconsistency in Source')) {
        currentCategory = 'Inconsistency in Source'
      } else if (colA.includes('Inconsistency in Target')) {
        currentCategory = 'Inconsistency in Target'
      } else if (colA.startsWith('Tag Mismatch')) {
        currentCategory = 'Tag Mismatch'
      } else if (colA.startsWith('Numeric Mismatch')) {
        currentCategory = 'Numeric Mismatch'
      } else if (colA.startsWith('Repeated Word')) {
        currentCategory = 'Repeated Word'
      } else if (colA.startsWith('Key Term Mismatch')) {
        currentCategory = 'Key Term Mismatch'
      } else {
        // Unrecognized marker — pass through for downstream category mapping
        currentCategory = colA
      }
    }
  })

  return findings
}

// ── Public API (unchanged signature) ──

export async function parseXbenchReport(buffer: Uint8Array): Promise<XbenchParseResult> {
  const workbook = new ExcelJS.Workbook()
  // @ts-expect-error ExcelJS declares its own Buffer interface that conflicts with Node.js Buffer generic
  await workbook.xlsx.load(buffer)

  const worksheet = workbook.getWorksheet(1)
  if (!worksheet) {
    throw new Error('No worksheet found in xlsx file')
  }

  const format = detectXbenchFormat(worksheet)
  const rawFindings = format === 'tabular' ? parseTabular(worksheet) : parseSectioned(worksheet)

  // Group findings by filename (shared logic applied after both parsers)
  const fileGroups: Record<string, XbenchReportFinding[]> = {}
  for (const finding of rawFindings) {
    const group = fileGroups[finding.fileName] ?? []
    group.push(finding)
    fileGroups[finding.fileName] = group
  }

  logger.info(
    `Parsed Xbench report (${format}): ${rawFindings.length} findings across ${Object.keys(fileGroups).length} files`,
  )

  return { findings: rawFindings, fileGroups }
}
