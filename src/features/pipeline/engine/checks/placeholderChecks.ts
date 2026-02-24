import { PLACEHOLDER_PATTERNS } from '../constants'
import type { RuleCheckResult, SegmentCheckContext, SegmentRecord } from '../types'

/**
 * Check placeholder consistency between source and target.
 * Placeholders in source must all appear in target with the same count.
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

  // Compare counts — duplicates are tracked individually
  const missing: string[] = []
  const extra: string[] = []

  for (const [ph, sourceCount] of sourcePlaceholders) {
    const targetCount = targetPlaceholders.get(ph) ?? 0
    for (let i = 0; i < sourceCount - targetCount; i++) {
      missing.push(ph)
    }
  }

  for (const [ph, targetCount] of targetPlaceholders) {
    const sourceCount = sourcePlaceholders.get(ph) ?? 0
    for (let i = 0; i < targetCount - sourceCount; i++) {
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
    sourceExcerpt: segment.sourceText,
    targetExcerpt: segment.targetText,
  }
}

/**
 * Extract all placeholder tokens from text with occurrence counts.
 * Returns a Map of placeholder string → count.
 * Skips %% (literal percent escape).
 */
function extractPlaceholders(text: string): Map<string, number> {
  const result = new Map<string, number>()

  for (const pattern of PLACEHOLDER_PATTERNS) {
    // Reset regex lastIndex for global patterns
    const re = new RegExp(pattern.source, pattern.flags)
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      result.set(match[0], (result.get(match[0]) ?? 0) + 1)
    }
  }

  return result
}
