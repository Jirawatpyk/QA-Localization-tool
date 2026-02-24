import type { RuleCategory, Severity } from './types'

// All L1 rule categories (excludes 'spelling' which is L3 only)
export const RULE_CATEGORIES: readonly RuleCategory[] = [
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
] as const

// Maximum character length for source/target excerpts in findings
export const MAX_EXCERPT_LENGTH = 500

// Number of findings to insert per DB batch
export const FINDING_BATCH_SIZE = 100

// Default severities per check type
export const CHECK_SEVERITY_DEFAULTS: Readonly<Record<string, Severity>> = {
  untranslated: 'critical',
  target_identical_to_source: 'major',
  tag_missing: 'critical',
  tag_extra: 'critical',
  tag_order: 'minor',
  number_mismatch: 'major',
  placeholder_mismatch: 'critical',
  double_spaces: 'minor',
  leading_trailing_spaces: 'minor',
  unpaired_brackets: 'minor',
  url_mismatch: 'major',
  end_punctuation: 'minor',
  same_source_diff_target: 'minor',
  same_target_diff_source: 'minor',
  key_term_inconsistency: 'major',
  glossary_compliance: 'major',
  uppercase_mismatch: 'minor',
  camelcase_mismatch: 'minor',
} as const

// Placeholder patterns commonly found in localization files
// NOTE: %% (literal percent escape) is intentionally excluded — not a placeholder
export const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /\{(\d+)\}/g, // {0}, {1}
  /%[sd@f]/g, // %s, %d, %f, %@
  /%\d+\$[sd]/g, // %1$s, %2$d (positional)
  /\{\{[\w.]+\}\}/g, // {{varName}}, {{var.name}}
  /\$\{[\w.]+\}/g, // ${name}, ${var.name}
] as const

// URL extraction regex
export const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi

// Thai politeness particles — NOT flagged as errors in consistency checks
export const THAI_PARTICLES: ReadonlySet<string> = new Set([
  'ครับ',
  'ค่ะ',
  'นะ',
  'ไหม',
  'เถอะ',
  'จ้า',
  'ค่า',
  'ครับผม',
])

// Thai numeral ↔ Arabic digit mapping
export const THAI_NUMERAL_MAP: Readonly<Record<string, string>> = {
  '๐': '0',
  '๑': '1',
  '๒': '2',
  '๓': '3',
  '๔': '4',
  '๕': '5',
  '๖': '6',
  '๗': '7',
  '๘': '8',
  '๙': '9',
} as const

// Reverse map: Arabic → Thai
export const ARABIC_TO_THAI_MAP: Readonly<Record<string, string>> = {
  '0': '๐',
  '1': '๑',
  '2': '๒',
  '3': '๓',
  '4': '๔',
  '5': '๕',
  '6': '๖',
  '7': '๗',
  '8': '๘',
  '9': '๙',
} as const

// Fullwidth ↔ halfwidth punctuation mapping (CJK)
export const FULLWIDTH_PUNCTUATION_MAP: Readonly<Record<string, string>> = {
  '\u3002': '.', // 。→ .
  '\uFF01': '!', // ！→ !
  '\uFF1F': '?', // ？→ ?
  '\uFF0C': ',', // ，→ ,
  '\uFF1A': ':', // ：→ :
  '\uFF1B': ';', // ；→ ;
} as const

// Buddhist calendar year offset (Thai year = Gregorian + 543)
export const BUDDHIST_YEAR_OFFSET = 543

// Confirmation states where QA checks should be skipped
export const SKIP_QA_STATES: ReadonlySet<string> = new Set(['ApprovedSignOff'])

// Bracket pairs for unpaired bracket check
export const BRACKET_PAIRS: readonly [string, string][] = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['\u300C', '\u300D'], // 「」
  ['\u3010', '\u3011'], // 【】
] as const

// Quote characters to check for balanced pairs
export const QUOTE_CHARS: readonly string[] = ['"', "'"] as const

// Maximum length for custom rule regex patterns (ReDoS prevention)
export const MAX_CUSTOM_REGEX_LENGTH = 500
