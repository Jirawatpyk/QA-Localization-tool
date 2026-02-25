import 'server-only'

import ExcelJS from 'exceljs'

import { IMPORT_ERROR_CODES } from '@/features/glossary/types'
import type { ImportError, ParsedTerm } from '@/features/glossary/types'
import type { ColumnMappingInput } from '@/features/glossary/validation/glossarySchemas'

type ExcelParseResult = {
  terms: ParsedTerm[]
  errors: ImportError[]
}

/**
 * Parse an Excel buffer into glossary terms.
 * Uses exceljs to read .xlsx files.
 */
export async function parseExcel(
  buffer: ArrayBuffer,
  mapping: ColumnMappingInput,
): Promise<ExcelParseResult> {
  const terms: ParsedTerm[] = []
  const errors: ImportError[] = []

  const workbook = new ExcelJS.Workbook()
  try {
    // @ts-expect-error ExcelJS declares its own Buffer interface that conflicts with Node.js Buffer generic
    await workbook.xlsx.load(Buffer.from(new Uint8Array(buffer)))
  } catch {
    errors.push({
      line: 1,
      reason: 'Failed to load Excel file',
      code: IMPORT_ERROR_CODES.ParseError,
    })
    return { terms, errors }
  }

  const worksheet = workbook.getWorksheet(1)
  if (!worksheet) {
    errors.push({
      line: 1,
      reason: 'No worksheet found in Excel file',
      code: IMPORT_ERROR_CODES.InvalidFormat,
    })
    return { terms, errors }
  }

  let sourceColIndex: number | undefined
  let targetColIndex: number | undefined
  let startRow = 1

  if (mapping.hasHeader) {
    const headerRow = worksheet.getRow(1)
    headerRow.eachCell((cell, colNumber) => {
      const value = String(cell.value ?? '')
        .toLowerCase()
        .trim()
      if (value === mapping.sourceColumn.toLowerCase().trim()) {
        sourceColIndex = colNumber
      }
      if (value === mapping.targetColumn.toLowerCase().trim()) {
        targetColIndex = colNumber
      }
    })
    startRow = 2
  } else {
    const srcIdx = parseInt(mapping.sourceColumn, 10)
    const tgtIdx = parseInt(mapping.targetColumn, 10)
    sourceColIndex = isNaN(srcIdx) ? undefined : srcIdx
    targetColIndex = isNaN(tgtIdx) ? undefined : tgtIdx
  }

  if (sourceColIndex === undefined || targetColIndex === undefined) {
    errors.push({
      line: 1,
      reason: 'Could not resolve column mapping',
      code: IMPORT_ERROR_CODES.ParseError,
    })
    return { terms, errors }
  }

  const srcCol = sourceColIndex
  const tgtCol = targetColIndex

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return

    const rawSource = String(row.getCell(srcCol).value ?? '')
    const rawTarget = String(row.getCell(tgtCol).value ?? '')

    const sourceTerm = rawSource.trim().normalize('NFKC')
    const targetTerm = rawTarget.trim().normalize('NFKC')

    if (sourceTerm.length === 0) {
      errors.push({
        line: rowNumber,
        reason: 'Source term is empty',
        code: IMPORT_ERROR_CODES.EmptySource,
      })
      return
    }

    if (targetTerm.length === 0) {
      errors.push({
        line: rowNumber,
        reason: 'Target term is missing',
        code: IMPORT_ERROR_CODES.EmptyTarget,
      })
      return
    }

    terms.push({ sourceTerm, targetTerm, lineNumber: rowNumber })
  })

  return { terms, errors }
}
