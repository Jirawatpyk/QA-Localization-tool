import type { InferSelectModel } from 'drizzle-orm'

import type { glossaryTerms } from '@/db/schema/glossaryTerms'
import type { segments } from '@/db/schema/segments'
import type { suppressionRules } from '@/db/schema/suppressionRules'

export type Severity = 'critical' | 'major' | 'minor'

export type RuleCategory =
  | 'completeness'
  | 'tag_integrity'
  | 'number_format'
  | 'placeholder_integrity'
  | 'spacing'
  | 'punctuation'
  | 'url_integrity'
  | 'consistency'
  | 'glossary_compliance'
  | 'custom_rule'
  | 'capitalization'
  | 'repeated_word'
  | 'spelling' // L3 only — included for findings table compatibility

export type SegmentRecord = InferSelectModel<typeof segments>
export type GlossaryTermRecord = InferSelectModel<typeof glossaryTerms>
export type SuppressionRuleRecord = InferSelectModel<typeof suppressionRules>

export type RuleCheckResult = {
  segmentId: string
  category: RuleCategory
  severity: Severity
  description: string
  suggestedFix: string | null
  sourceExcerpt: string
  targetExcerpt: string
}

export type SegmentCheckContext = {
  sourceLang: string // BCP-47
  targetLang: string // BCP-47
}

export type FileCheckContext = {
  segments: SegmentRecord[]
  glossaryTerms: GlossaryTermRecord[]
  targetLang: string
}

// Type guard: validate a string is a valid Severity
export function isSeverity(value: string): value is Severity {
  return value === 'critical' || value === 'major' || value === 'minor'
}

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  'completeness',
  'tag_integrity',
  'number_format',
  'placeholder_integrity',
  'spacing',
  'punctuation',
  'url_integrity',
  'consistency',
  'glossary_compliance',
  'custom_rule',
  'capitalization',
  'repeated_word',
  'spelling',
])

// Type guard: validate a string is a valid RuleCategory
export function isRuleCategory(value: string): value is RuleCategory {
  return VALID_CATEGORIES.has(value)
}
