import 'server-only'

import type ExcelJS from 'exceljs'

import { EXCEL_AUTO_DETECT_KEYWORDS, MAX_PARSE_SIZE_BYTES } from '@/features/parser/constants'
import { loadExcelWorkbook } from '@/features/parser/excelLoader'
import type { ParsedSegment, ParseOutcome } from '@/features/parser/types'
import type { ExcelColumnMapping } from '@/features/parser/validation/excelMappingSchema'
import { countWords } from '@/features/parser/wordCounter'

/**
 * Parse an Excel (.xlsx) bilingual file into segments.
 *
 * - Reads first worksheet only (E2)
 * - Skips rows where BOTH source AND target are empty/whitespace-only
 * - Empty target with non-empty source → included (untranslated segment)
 * - Uses countWords() from wordCounter for CJK/Thai support
 */
export async function parseExcelBilingual(
  buffer: ArrayBuffer,
  mapping: ExcelColumnMapping,
  fileSizeBytes: number,
  sourceLang: string,
  targetLang: string,
): Promise<ParseOutcome> {
  // 15MB size guard (defense-in-depth)
  if (fileSizeBytes > MAX_PARSE_SIZE_BYTES) {
    return {
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'File too large for processing (max 15MB)',
        details: `File size: ${fileSizeBytes} bytes, max: ${MAX_PARSE_SIZE_BYTES} bytes`,
      },
    }
  }

  let workbook: ExcelJS.Workbook
  try {
    workbook = await loadExcelWorkbook(buffer)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    // Password-protected files have a specific error pattern
    if (
      message.toLowerCase().includes('password') ||
      message.toLowerCase().includes('encrypted') ||
      message.toLowerCase().includes('cfb') ||
      message.toLowerCase().includes('invalid signature')
    ) {
      return {
        success: false,
        error: {
          code: 'INVALID_EXCEL',
          message:
            'Cannot read password-protected Excel files. Please remove the password and re-upload.',
          details: message,
        },
      }
    }
    return {
      success: false,
      error: {
        code: 'INVALID_EXCEL',
        message: 'Invalid Excel file — could not read spreadsheet',
        details: message,
      },
    }
  }

  // Use only first worksheet (E2: multi-sheet limitation)
  const worksheet = workbook.getWorksheet(1)
  if (!worksheet || worksheet.rowCount === 0) {
    return {
      success: false,
      error: {
        code: 'EMPTY_SHEET',
        message: 'Invalid Excel file — could not read spreadsheet',
        details: 'No worksheet found or worksheet is empty',
      },
    }
  }

  // Resolve column indices
  const { sourceColIndex, targetColIndex, segmentIdColIndex, contextColIndex, languageColIndex } =
    resolveColumns(worksheet, mapping)

  if (sourceColIndex === undefined || targetColIndex === undefined) {
    return {
      success: false,
      error: {
        code: 'INVALID_COLUMNS',
        message: 'Invalid Excel file — could not read spreadsheet',
        details: `Could not find columns: source="${mapping.sourceColumn}", target="${mapping.targetColumn}"`,
      },
    }
  }

  const startRow = mapping.hasHeader ? 2 : 1
  const segments: ParsedSegment[] = []
  let segmentNumber = 0

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return

    const sourceText = extractCellValue(row.getCell(sourceColIndex))
    const targetText = extractCellValue(row.getCell(targetColIndex))

    // Skip row if BOTH source AND target are empty/whitespace-only
    if (sourceText.trim().length === 0 && targetText.trim().length === 0) return

    segmentNumber++

    // Segment ID: from mapped column, or fall back to row number
    let segmentId = String(rowNumber)
    if (segmentIdColIndex !== undefined) {
      const idValue = extractCellValue(row.getCell(segmentIdColIndex))
      if (idValue.trim().length > 0) segmentId = idValue.trim()
    }

    // Per-row language override (C1: optional Language column)
    const rowTargetLang =
      languageColIndex !== undefined
        ? extractCellValue(row.getCell(languageColIndex)).trim() || targetLang
        : targetLang

    const wordCount = countWords(sourceText, sourceLang)

    const segment: ParsedSegment = {
      segmentId,
      segmentNumber,
      sourceText,
      targetText,
      sourceLang,
      targetLang: rowTargetLang,
      confirmationState: null,
      matchPercentage: null,
      translatorComment:
        contextColIndex !== undefined
          ? extractCellValue(row.getCell(contextColIndex)).trim() || null
          : null,
      inlineTags: null,
      wordCount,
    }

    segments.push(segment)
  })

  return {
    success: true,
    data: {
      segments,
      sourceLang,
      targetLang,
      fileType: 'xlsx',
      segmentCount: segments.length,
    },
  }
}

/**
 * Resolve column indices from column mapping.
 * If hasHeader=true: scan header row for case-insensitive name match.
 * If hasHeader=false: parse column name as 1-based numeric index.
 */
function resolveColumns(
  worksheet: ExcelJS.Worksheet,
  mapping: ExcelColumnMapping,
): {
  sourceColIndex: number | undefined
  targetColIndex: number | undefined
  segmentIdColIndex: number | undefined
  contextColIndex: number | undefined
  languageColIndex: number | undefined
} {
  if (!mapping.hasHeader) {
    // Numeric column indices (1-based)
    return {
      sourceColIndex: parseColumnIndex(mapping.sourceColumn),
      targetColIndex: parseColumnIndex(mapping.targetColumn),
      segmentIdColIndex: mapping.segmentIdColumn
        ? parseColumnIndex(mapping.segmentIdColumn)
        : undefined,
      contextColIndex: mapping.contextColumn ? parseColumnIndex(mapping.contextColumn) : undefined,
      languageColIndex: mapping.languageColumn
        ? parseColumnIndex(mapping.languageColumn)
        : undefined,
    }
  }

  // Header-based lookup (case-insensitive)
  const headerRow = worksheet.getRow(1)
  const headerMap = new Map<string, number>()
  headerRow.eachCell((cell, colNumber) => {
    const value = extractCellValue(cell).toLowerCase().trim()
    if (value.length > 0) headerMap.set(value, colNumber)
  })

  return {
    sourceColIndex: findColumn(headerMap, mapping.sourceColumn),
    targetColIndex: findColumn(headerMap, mapping.targetColumn),
    segmentIdColIndex: mapping.segmentIdColumn
      ? findColumn(headerMap, mapping.segmentIdColumn)
      : undefined,
    contextColIndex: mapping.contextColumn
      ? findColumn(headerMap, mapping.contextColumn)
      : undefined,
    languageColIndex: mapping.languageColumn
      ? findColumn(headerMap, mapping.languageColumn)
      : undefined,
  }
}

function findColumn(headerMap: Map<string, number>, columnName: string): number | undefined {
  return headerMap.get(columnName.toLowerCase().trim())
}

function parseColumnIndex(value: string): number | undefined {
  const n = parseInt(value, 10)
  return isNaN(n) || n < 1 ? undefined : n
}

/**
 * Extract a string value from an ExcelJS cell, handling all cell value types.
 */
export function extractCellValue(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  // Rich text: { richText: [{ text: string }] }
  if (typeof value === 'object' && 'richText' in value) {
    return (value as { richText: Array<{ text: string }> }).richText.map((r) => r.text).join('')
  }
  // Formula: { formula, result }
  if (typeof value === 'object' && 'result' in value) {
    return String((value as { result: unknown }).result ?? '')
  }
  // Error value: { error: string }
  if (typeof value === 'object' && 'error' in value) {
    return ''
  }
  return String(value)
}

/**
 * Auto-detect source and target columns from a list of header names.
 * Returns null if no match or ambiguous match.
 */
export function autoDetectColumns(headers: string[]): {
  suggestedSourceColumn: string | null
  suggestedTargetColumn: string | null
} {
  const normalized = headers.map((h) => h.toLowerCase().trim())

  const sourceKeywords = EXCEL_AUTO_DETECT_KEYWORDS.source as readonly string[]
  const targetKeywords = EXCEL_AUTO_DETECT_KEYWORDS.target as readonly string[]

  // Find first header that INCLUDES (substring) any keyword
  // Prefer exact match over substring match
  const findBestMatch = (keywords: readonly string[]): string | null => {
    let exactMatch: string | null = null
    let substringMatch: string | null = null

    for (let i = 0; i < normalized.length; i++) {
      const header = normalized[i]!
      for (const keyword of keywords) {
        if (header === keyword && exactMatch === null) {
          exactMatch = headers[i]!
        } else if (header.includes(keyword) && substringMatch === null && exactMatch === null) {
          substringMatch = headers[i]!
        }
      }
    }

    return exactMatch ?? substringMatch
  }

  const suggestedSourceColumn = findBestMatch(sourceKeywords)
  const suggestedTargetColumn = findBestMatch(targetKeywords)

  // If the same column matches both, return null (ambiguous)
  if (
    suggestedSourceColumn !== null &&
    suggestedTargetColumn !== null &&
    suggestedSourceColumn === suggestedTargetColumn
  ) {
    return { suggestedSourceColumn: null, suggestedTargetColumn: null }
  }

  return { suggestedSourceColumn, suggestedTargetColumn }
}
