export const IMPORT_ERROR_CODES = {
  EmptySource: 'EMPTY_SOURCE',
  EmptyTarget: 'MISSING_TARGET',
  InvalidPair: 'INVALID_PAIR',
  DuplicateEntry: 'DUPLICATE_ENTRY',
  ParseError: 'PARSE_ERROR',
  InvalidFormat: 'INVALID_FORMAT',
} as const

export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[keyof typeof IMPORT_ERROR_CODES]

export type ImportError = {
  line: number
  reason: string
  code: ImportErrorCode
}

export type ImportResult = {
  imported: number
  duplicates: number
  errors: ImportError[]
  glossaryId: string
}

export type ParsedTerm = {
  sourceTerm: string
  targetTerm: string
  lineNumber: number
}
