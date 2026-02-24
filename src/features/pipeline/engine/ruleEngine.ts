import { checkGlossaryCompliance } from '@/features/glossary/matching/glossaryMatcher'

import { checkCamelCaseWords, checkUppercaseWords } from './checks/capitalizationChecks'
import {
  checkSameSourceDiffTarget,
  checkSameTargetDiffSource,
  checkKeyTermConsistency,
} from './checks/consistencyChecks'
import { checkUntranslated, checkTargetIdenticalToSource } from './checks/contentChecks'
import { checkCustomRules } from './checks/customRuleChecks'
import {
  checkDoubleSpaces,
  checkEndPunctuation,
  checkLeadingTrailingSpaces,
  checkUnpairedBrackets,
  checkUrlMismatches,
} from './checks/formattingChecks'
import { checkGlossaryComplianceRule } from './checks/glossaryChecks'
import { checkNumberConsistency } from './checks/numberChecks'
import { checkPlaceholderConsistency } from './checks/placeholderChecks'
import { checkRepeatedWords } from './checks/repeatedWordChecks'
import { checkTagIntegrity } from './checks/tagChecks'
import { MAX_EXCERPT_LENGTH, SKIP_QA_STATES } from './constants'
import type {
  FileCheckContext,
  GlossaryTermRecord,
  RuleCheckResult,
  SegmentCheckContext,
  SegmentRecord,
  SuppressionRuleRecord,
} from './types'

/**
 * Main L1 rule engine entry point.
 * Processes all segments through deterministic QA checks and returns findings.
 *
 * @param segments - all segments for the file
 * @param glossaryTerms - project glossary terms (pre-loaded)
 * @param suppressedCategories - categories to filter out from results
 * @param customRules - regex-based custom rules (category='custom_rule')
 */
export async function processFile(
  segments: SegmentRecord[],
  glossaryTerms: GlossaryTermRecord[],
  suppressedCategories: ReadonlySet<string>,
  customRules: SuppressionRuleRecord[],
): Promise<RuleCheckResult[]> {
  if (segments.length === 0) return []

  // Derive language context from first segment.
  // NOTE: Mixed-language Excel files (per-row targetLang) will use first segment's language
  // for all checks. Per-segment language routing is deferred to Story 2.7 when multi-language
  // file support is implemented.
  const sourceLang = segments[0]?.sourceLang ?? 'und'
  const targetLang = segments[0]?.targetLang ?? 'und'

  // 1. Filter out ApprovedSignOff segments
  const activeSegments = segments.filter(
    (seg) => !seg.confirmationState || !SKIP_QA_STATES.has(seg.confirmationState),
  )

  if (activeSegments.length === 0) return []

  // 2. Build check context
  const segCtx: SegmentCheckContext = { sourceLang, targetLang }

  // 3. Per-segment synchronous checks
  const allResults: RuleCheckResult[] = []

  for (const seg of activeSegments) {
    // Content checks
    const untranslated = checkUntranslated(seg, segCtx)
    if (untranslated) allResults.push(untranslated)

    const identical = checkTargetIdenticalToSource(seg, segCtx)
    if (identical) allResults.push(identical)

    // Tag integrity
    const tagResults = checkTagIntegrity(seg, segCtx)
    allResults.push(...tagResults)

    // Number & placeholder
    const numberResult = checkNumberConsistency(seg, segCtx)
    if (numberResult) allResults.push(numberResult)

    const placeholderResult = checkPlaceholderConsistency(seg, segCtx)
    if (placeholderResult) allResults.push(placeholderResult)

    // Formatting
    const doubleSpace = checkDoubleSpaces(seg, segCtx)
    if (doubleSpace) allResults.push(doubleSpace)

    const leadTrail = checkLeadingTrailingSpaces(seg, segCtx)
    allResults.push(...leadTrail)

    const brackets = checkUnpairedBrackets(seg, segCtx)
    allResults.push(...brackets)

    const urlResult = checkUrlMismatches(seg, segCtx)
    if (urlResult) allResults.push(urlResult)

    const punctResult = checkEndPunctuation(seg, segCtx)
    if (punctResult) allResults.push(punctResult)

    // Capitalization
    const upperResults = checkUppercaseWords(seg, segCtx)
    allResults.push(...upperResults)

    const camelResults = checkCamelCaseWords(seg, segCtx)
    allResults.push(...camelResults)

    // Repeated words
    const repeatedWord = checkRepeatedWords(seg, segCtx)
    if (repeatedWord) allResults.push(repeatedWord)
  }

  // 4. Per-segment async glossary compliance (batched)
  const glossaryPromises = activeSegments.map((seg) =>
    checkGlossaryComplianceRule(seg, glossaryTerms, segCtx, checkGlossaryCompliance),
  )
  const glossaryResults = await Promise.all(glossaryPromises)
  for (const results of glossaryResults) {
    allResults.push(...results)
  }

  // 5. File-level cross-segment consistency checks
  const fileCtx: FileCheckContext = {
    segments: activeSegments,
    glossaryTerms,
    targetLang,
  }

  const sameSourceResults = checkSameSourceDiffTarget(fileCtx)
  allResults.push(...sameSourceResults)

  const sameTargetResults = checkSameTargetDiffSource(fileCtx)
  allResults.push(...sameTargetResults)

  const keyTermResults = checkKeyTermConsistency(fileCtx)
  allResults.push(...keyTermResults)

  // 6. Per-segment custom rules
  for (const seg of activeSegments) {
    const customResults = checkCustomRules(seg, customRules, segCtx)
    allResults.push(...customResults)
  }

  // 7. Filter out suppressed categories
  const filtered = allResults.filter((r) => !suppressedCategories.has(r.category))

  // 8. Truncate excerpts to MAX_EXCERPT_LENGTH
  for (const result of filtered) {
    if (result.sourceExcerpt.length > MAX_EXCERPT_LENGTH) {
      result.sourceExcerpt = result.sourceExcerpt.slice(0, MAX_EXCERPT_LENGTH)
    }
    if (result.targetExcerpt.length > MAX_EXCERPT_LENGTH) {
      result.targetExcerpt = result.targetExcerpt.slice(0, MAX_EXCERPT_LENGTH)
    }
  }

  return filtered
}
