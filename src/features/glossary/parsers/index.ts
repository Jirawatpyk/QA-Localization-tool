import type { ImportError, ParsedTerm } from '@/features/glossary/types'
import type { ColumnMappingInput } from '@/features/glossary/validation/glossarySchemas'

import { parseCsv } from './csvParser'
import { parseTbx } from './tbxParser'

type ParseResult = {
  terms: ParsedTerm[]
  errors: ImportError[]
}

type ParseOptions = {
  format: 'csv' | 'tbx' | 'xlsx'
  buffer: ArrayBuffer
  mapping: ColumnMappingInput
  sourceLang: string
  targetLang: string
}

/**
 * Parse a glossary file into terms using the appropriate parser.
 * Dispatches to CSV, TBX, or Excel parser based on format.
 */
export async function parseGlossaryFile(options: ParseOptions): Promise<ParseResult> {
  const { format, buffer, mapping, sourceLang, targetLang } = options

  switch (format) {
    case 'csv': {
      const text = new TextDecoder().decode(buffer)
      return parseCsv(text, mapping)
    }
    case 'tbx': {
      const text = new TextDecoder().decode(buffer)
      return parseTbx(text, sourceLang, targetLang)
    }
    case 'xlsx': {
      // Dynamic import to keep exceljs server-only and avoid bundling in non-server contexts
      const { parseExcel } = await import('./excelParser')
      return parseExcel(buffer, mapping)
    }
  }
}
