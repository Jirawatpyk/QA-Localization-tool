import { IMPORT_ERROR_CODES } from '@/features/glossary/types'
import type { ImportError, ParsedTerm } from '@/features/glossary/types'
import type { ColumnMappingInput } from '@/features/glossary/validation/glossarySchemas'

type CsvParseResult = {
  terms: ParsedTerm[]
  errors: ImportError[]
}

/**
 * Parse a CSV string into glossary terms.
 * Pure function — no side effects.
 */
export function parseCsv(csvText: string, mapping: ColumnMappingInput): CsvParseResult {
  const terms: ParsedTerm[] = []
  const errors: ImportError[] = []

  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0)

  if (lines.length === 0) {
    return { terms, errors }
  }

  let sourceIndex: number | undefined
  let targetIndex: number | undefined
  let startRow = 0

  if (mapping.hasHeader) {
    const headerFields = parseRow(lines[0] ?? '', mapping.delimiter)
    sourceIndex = headerFields.findIndex(
      (h) => h.toLowerCase().trim() === mapping.sourceColumn.toLowerCase().trim(),
    )
    targetIndex = headerFields.findIndex(
      (h) => h.toLowerCase().trim() === mapping.targetColumn.toLowerCase().trim(),
    )

    if (sourceIndex === -1) {
      sourceIndex = undefined
    }
    if (targetIndex === -1) {
      targetIndex = undefined
    }
    startRow = 1
  } else {
    const srcIdx = parseInt(mapping.sourceColumn, 10)
    const tgtIdx = parseInt(mapping.targetColumn, 10)
    sourceIndex = isNaN(srcIdx) ? undefined : srcIdx
    targetIndex = isNaN(tgtIdx) ? undefined : tgtIdx
  }

  if (sourceIndex === undefined || targetIndex === undefined) {
    errors.push({
      line: 1,
      reason: 'Could not resolve column mapping',
      code: IMPORT_ERROR_CODES.ParseError,
    })
    return { terms, errors }
  }

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue

    const lineNumber = i + 1
    const fields = parseRow(line, mapping.delimiter)

    const rawSource = fields[sourceIndex] ?? ''
    const rawTarget = fields[targetIndex] ?? ''

    const sourceTerm = rawSource.trim().normalize('NFKC')
    const targetTerm = rawTarget.trim().normalize('NFKC')

    if (sourceTerm.length === 0) {
      errors.push({
        line: lineNumber,
        reason: 'Source term is empty',
        code: IMPORT_ERROR_CODES.EmptySource,
      })
      continue
    }

    if (targetTerm.length === 0) {
      errors.push({
        line: lineNumber,
        reason: 'Target term is missing',
        code: IMPORT_ERROR_CODES.EmptyTarget,
      })
      continue
    }

    terms.push({ sourceTerm, targetTerm, lineNumber })
  }

  return { terms, errors }
}

/**
 * Parse a single CSV row, handling quoted fields (RFC 4180).
 */
function parseRow(line: string, delimiter: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === delimiter) {
        fields.push(current)
        current = ''
      } else {
        current += char
      }
    }
  }

  fields.push(current)
  return fields
}
