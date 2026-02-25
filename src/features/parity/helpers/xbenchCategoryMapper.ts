const XBENCH_TO_TOOL_CATEGORY: Record<string, string> = {
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

export function mapXbenchCategory(xbenchCheckType: string): string {
  const normalized = xbenchCheckType.toLowerCase().trim()
  return XBENCH_TO_TOOL_CATEGORY[normalized] ?? 'other'
}
