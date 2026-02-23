import type { ConfirmationState, InlineTagType, XliffState } from './types'

// All supported XLIFF inline tag types
export const INLINE_TAG_TYPES: readonly InlineTagType[] = [
  'g',
  'x',
  'ph',
  'bx',
  'ex',
  'bpt',
  'ept',
] as const

// Valid SDLXLIFF confirmation states
export const CONFIRMATION_STATES: readonly ConfirmationState[] = [
  'Draft',
  'Translated',
  'ApprovedTranslation',
  'ApprovedSignOff',
  'RejectedTranslation',
  'RejectedSignOff',
] as const

// Segments with this state should be skipped by the QA engine (Story 2.4)
export const SKIP_QA_STATES: readonly ConfirmationState[] = ['ApprovedSignOff'] as const

// Maps XLIFF 1.2 standard <target state=""> values to internal ConfirmationState
export const XLIFF_STATE_MAP: Readonly<Record<XliffState, ConfirmationState>> = {
  new: 'Draft',
  'needs-translation': 'Draft',
  'needs-l10n': 'Draft',
  'needs-review-translation': 'Draft',
  'needs-review-l10n': 'Draft',
  translated: 'Translated',
  'signed-off': 'ApprovedSignOff',
  final: 'ApprovedSignOff',
} as const

// Maximum file size allowed for parsing (defense-in-depth, separate from upload guard)
export const MAX_PARSE_SIZE_BYTES = 15 * 1024 * 1024 // 15MB

// Number of segments to insert per DB batch (memory efficiency)
export const SEGMENT_BATCH_SIZE = 100

// SDLXLIFF namespace URI
export const SDL_NAMESPACE_URI = 'http://sdl.com/FileTypes/SdlXliff/1.0'

// Separator when concatenating multiple comments
export const COMMENT_SEPARATOR = ' | '
