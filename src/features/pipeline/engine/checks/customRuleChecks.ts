import { logger } from '@/lib/logger'

import { MAX_CUSTOM_REGEX_LENGTH } from '../constants'
import type {
  RuleCheckResult,
  SegmentCheckContext,
  SegmentRecord,
  SuppressionRuleRecord,
} from '../types'

/**
 * Check custom rules (regex-based) against segment target text.
 *
 * Custom rules are stored in suppressionRules with category='custom_rule'.
 * - pattern: regex to match against target text
 * - reason: finding description
 * - Invalid or oversized regex patterns are logged and skipped (no crash)
 */
export function checkCustomRules(
  segment: SegmentRecord,
  customRules: SuppressionRuleRecord[],
  _ctx: SegmentCheckContext,
): RuleCheckResult[] {
  const results: RuleCheckResult[] = []

  for (const rule of customRules) {
    // ReDoS prevention: reject oversized patterns.
    // NOTE: Length check alone doesn't prevent all catastrophic patterns (e.g., "(a+)+b" = 7 chars).
    // Mitigated by: (1) admin-only input, (2) V8 backtracking limits, (3) short segment text.
    // Consider adding regex complexity analysis or execution timeout if user-facing input is added.
    if (rule.pattern.length > MAX_CUSTOM_REGEX_LENGTH) {
      logger.warn(
        { patternLength: rule.pattern.length, ruleId: rule.id },
        `Custom rule regex exceeds ${MAX_CUSTOM_REGEX_LENGTH} chars — skipped`,
      )
      continue
    }

    let regex: RegExp
    try {
      regex = new RegExp(rule.pattern, 'gi')
    } catch {
      logger.warn({ pattern: rule.pattern, ruleId: rule.id }, 'Invalid custom rule regex — skipped')
      continue
    }

    if (regex.test(segment.targetText)) {
      results.push({
        segmentId: segment.id,
        category: 'custom_rule',
        severity: 'major', // configurable severity could be added later
        description: rule.reason,
        suggestedFix: null,
        sourceExcerpt: segment.sourceText,
        targetExcerpt: segment.targetText,
      })
    }
  }

  return results
}
