import { logger } from '@/lib/logger'

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
 * - Invalid regex patterns are logged and skipped (no crash)
 */
export function checkCustomRules(
  segment: SegmentRecord,
  customRules: SuppressionRuleRecord[],
  _ctx: SegmentCheckContext,
): RuleCheckResult[] {
  const results: RuleCheckResult[] = []

  for (const rule of customRules) {
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
        sourceExcerpt: segment.sourceText.slice(0, 100),
        targetExcerpt: segment.targetText.slice(0, 100),
      })
    }
  }

  return results
}
