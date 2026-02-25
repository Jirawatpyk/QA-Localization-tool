// Maps Xbench check types → MQM top-level categories (used by integration tests)
const XBENCH_TO_MQM_CATEGORY: Record<string, string> = {
  'inconsistency in source': 'consistency',
  'inconsistency in target': 'consistency',
  'key term mismatch': 'terminology',
  untranslated: 'completeness',
  'target same as source': 'completeness',
  'tag mismatch': 'fluency',
  'number mismatch': 'accuracy',
  'numeric mismatch': 'accuracy',
  'double space': 'fluency',
  'double blank': 'fluency',
  'repeated word': 'fluency',
  'repeated words': 'fluency',
  'spell check': 'fluency',
}

// Maps Xbench check types → tool rule engine categories (used by parity comparator)
const XBENCH_TO_TOOL_CATEGORY: Record<string, string> = {
  'inconsistency in source': 'consistency',
  'inconsistency in target': 'consistency',
  'key term mismatch': 'key_term',
  untranslated: 'completeness',
  'target same as source': 'completeness',
  'tag mismatch': 'tag_integrity',
  'number mismatch': 'number_format',
  'numeric mismatch': 'number_format',
  'double space': 'spacing',
  'double blank': 'spacing',
  'repeated word': 'repeated_word',
  'repeated words': 'repeated_word',
  'spell check': 'fluency',
}

/** Maps Xbench check type → MQM top-level category (for integration tests / reporting). */
export function mapXbenchCategory(xbenchCheckType: string): string {
  const normalized = xbenchCheckType.toLowerCase().trim()
  return XBENCH_TO_MQM_CATEGORY[normalized] ?? 'other'
}

/** Maps Xbench check type → tool rule engine category (for parity comparison matching). */
export function mapXbenchToToolCategory(xbenchCheckType: string): string {
  const normalized = xbenchCheckType.toLowerCase().trim()
  return XBENCH_TO_TOOL_CATEGORY[normalized] ?? 'other'
}
