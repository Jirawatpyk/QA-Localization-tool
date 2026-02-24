import { PLACEHOLDER_PATTERNS } from '../constants'
import type { RuleCheckResult, SegmentCheckContext, SegmentRecord } from '../types'

/**
 * Check placeholder consistency between source and target.
 * Placeholders in source must all appear in target.
 * Extra placeholders in target (not in source) are also flagged.
 *
 * Supported patterns: {0}, %s, %d, %f, %@, %1$s, %2$d, {{var}}, ${name}
 * Literal %% is excluded (escaped percent).
 */
export function checkPlaceholderConsistency(
  segment: SegmentRecord,
  _ctx: SegmentCheckContext,
): RuleCheckResult | null {
  const sourcePlaceholders = extractPlaceholders(segment.sourceText)
  const targetPlaceholders = extractPlaceholders(segment.targetText)

  // No placeholders in source — nothing to check
  if (sourcePlaceholders.size === 0 && targetPlaceholders.size === 0) return null

  // Compare sets
  const missing: string[] = []
  const extra: string[] = []

  for (const ph of sourcePlaceholders) {
    if (!targetPlaceholders.has(ph)) {
      missing.push(ph)
    }
  }

  for (const ph of targetPlaceholders) {
    if (!sourcePlaceholders.has(ph)) {
      extra.push(ph)
    }
  }

  if (missing.length === 0 && extra.length === 0) return null

  const parts: string[] = []
  if (missing.length > 0) {
    parts.push(`missing in target: ${missing.join(', ')}`)
  }
  if (extra.length > 0) {
    parts.push(`extra in target: ${extra.join(', ')}`)
  }

  return {
    segmentId: segment.id,
    category: 'placeholder_integrity',
    severity: 'critical',
    description: `Placeholder mismatch: ${parts.join('; ')}`,
    suggestedFix:
      missing.length > 0
        ? `Add missing placeholders: ${missing.join(', ')}`
        : `Remove extra placeholders: ${extra.join(', ')}`,
    sourceExcerpt: segment.sourceText.slice(0, 100),
    targetExcerpt: segment.targetText.slice(0, 100),
  }
}

/**
 * Extract all placeholder tokens from text.
 * Returns a Set of unique placeholder strings.
 * Skips %% (literal percent escape).
 */
function extractPlaceholders(text: string): Set<string> {
  const result = new Set<string>()

  for (const pattern of PLACEHOLDER_PATTERNS) {
    // Skip the %% pattern — it's a literal percent, not a placeholder
    if (pattern.source === '%%') continue

    // Reset regex lastIndex for global patterns
    const re = new RegExp(pattern.source, pattern.flags)
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      result.add(match[0])
    }
  }

  return result
}
