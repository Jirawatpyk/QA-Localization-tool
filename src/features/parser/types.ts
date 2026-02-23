// Inline tag types from XLIFF 1.2 / SDLXLIFF specification
export type InlineTagType = 'g' | 'x' | 'ph' | 'bx' | 'ex' | 'bpt' | 'ept'

export type InlineTag = {
  type: InlineTagType
  id: string
  position: number // char offset in plain text (after removing tags)
  attributes?: Record<string, string>
  content?: string // for bpt/ept that have translatable content
}

// SDLXLIFF confirmation states (from sdl:seg conf attribute)
export type ConfirmationState =
  | 'Draft'
  | 'Translated'
  | 'ApprovedTranslation'
  | 'ApprovedSignOff'
  | 'RejectedTranslation'
  | 'RejectedSignOff'

// XLIFF 1.2 standard target states (from <target state=""> attribute)
export type XliffState =
  | 'new'
  | 'needs-translation'
  | 'needs-l10n'
  | 'needs-review-translation'
  | 'needs-review-l10n'
  | 'translated'
  | 'signed-off'
  | 'final'

// A single parsed segment from the XLIFF/SDLXLIFF file
export type ParsedSegment = {
  segmentId: string // trans-unit id + mrk mid (e.g. "tu1_0")
  segmentNumber: number // 1-based sequence within the file
  sourceText: string // plain text (tags removed)
  targetText: string // plain text (tags removed), empty string if untranslated
  sourceLang: string
  targetLang: string
  confirmationState: ConfirmationState | null
  matchPercentage: number | null // 0-100 or null if not a TM match
  translatorComment: string | null
  inlineTags: InlineTag[] | null // null when no inline tags
  wordCount: number
}

// Result of a successful parse operation
export type ParseResult = {
  segments: ParsedSegment[]
  sourceLang: string
  targetLang: string
  fileType: 'sdlxliff' | 'xliff'
  segmentCount: number
}

// Structured parser error
export type ParserError = {
  code: 'FILE_TOO_LARGE' | 'INVALID_XML' | 'INVALID_STRUCTURE' | 'TAG_MISMATCH'
  message: string
  details?: string // additional context (tag id, position, etc.)
}

// Return type from the main parse function
export type ParseOutcome =
  | { success: true; data: ParseResult }
  | { success: false; error: ParserError }
