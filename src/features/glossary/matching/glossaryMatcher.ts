import 'server-only'

import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { getCachedGlossaryTerms } from '@/lib/cache/glossaryCache'
import { chunkText, stripMarkup } from '@/lib/language/markupStripper'
import { getSegmenter, isNoSpaceLanguage } from '@/lib/language/segmenterCache'
import { logger } from '@/lib/logger'

import type {
  BoundaryConfidence,
  GlossaryCheckResult,
  GlossaryTermMatch,
  SegmentContext,
} from './matchingTypes'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Pure helpers (no side effects — fully unit-testable without mocks)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates whether a substring match at [matchIndex, matchIndex+termLen) in text
 * aligns with Intl.Segmenter word boundaries.
 *
 * Strategy: segments the CLEANED text (markup stripped), checks:
 *   - A word segment starts at matchIndex (or matchIndex is start of text)
 *   - A word segment ends at matchIndex + termLen (or matchIndex + termLen is end of text)
 *
 * Returns 'high' if both boundaries align, 'low' otherwise.
 */
export function validateBoundary(
  cleanText: string, // markup-stripped, NFKC-normalized text
  matchIndex: number, // position of match start
  termLen: number, // length of matched term
  locale: string, // BCP-47 locale for Intl.Segmenter
): BoundaryConfidence {
  const matchEnd = matchIndex + termLen

  // Collect segment boundaries from all chunks that overlap with our match
  const chunks = chunkText(cleanText)
  const wordBoundaries = new Set<number>()
  wordBoundaries.add(0)
  wordBoundaries.add(cleanText.length)

  for (const { chunk, offset } of chunks) {
    const chunkEnd = offset + chunk.length
    // Only process chunks that overlap with the match range
    if (offset > matchEnd || chunkEnd < matchIndex) continue

    const segmenter = getSegmenter(locale)
    for (const segment of segmenter.segment(chunk)) {
      if (segment.isWordLike) {
        wordBoundaries.add(offset + segment.index)
        wordBoundaries.add(offset + segment.index + segment.segment.length)
      }
    }
  }

  const startAligned = wordBoundaries.has(matchIndex)
  const endAligned = wordBoundaries.has(matchEnd)

  return startAligned && endAligned ? 'high' : 'low'
}

/**
 * European language word boundary check (no Intl.Segmenter needed).
 * Checks: character before match is non-word (\W or start), character after is non-word (\W or end).
 * This correctly handles diacritics (á, ñ, ü) as word characters.
 */
export function validateEuropeanBoundary(
  text: string,
  matchIndex: number,
  termLen: number,
): BoundaryConfidence {
  const before = matchIndex > 0 ? text.charAt(matchIndex - 1) : null
  const after = matchIndex + termLen < text.length ? text.charAt(matchIndex + termLen) : null

  const nonWordRe = /\W/

  const startOk = before === null || nonWordRe.test(before)
  const endOk = after === null || nonWordRe.test(after)

  return startOk && endOk ? 'high' : 'low'
}

/**
 * Find ALL occurrences of a term in text (not just first).
 * Returns array of {position, confidence} for each occurrence.
 *
 * - Normalizes text via NFKC (terms are already NFKC in DB from Story 1.4)
 * - Strips markup before boundary validation
 * - caseSensitive flag from glossary_terms.case_sensitive
 */
export function findTermInText(
  rawText: string,
  term: string,
  caseSensitive: boolean,
  lang: string,
): Array<{ position: number; confidence: BoundaryConfidence }> {
  // Step 1: NFKC normalize (defensive — terms already normalized at import)
  const normalizedText = rawText.normalize('NFKC')
  const normalizedTerm = term.normalize('NFKC')

  // Step 2: Prepare comparison strings (case sensitivity)
  const searchText = caseSensitive ? normalizedText : normalizedText.toLowerCase()
  const searchTerm = caseSensitive ? normalizedTerm : normalizedTerm.toLowerCase()

  if (searchTerm.length === 0) return []

  // Step 3: Strip markup for boundary validation
  const cleanText = stripMarkup(normalizedText)

  // Step 4: Find all occurrences via substring search (PRIMARY strategy)
  const results: Array<{ position: number; confidence: BoundaryConfidence }> = []
  let searchFrom = 0

  while (searchFrom < searchText.length) {
    const idx = searchText.indexOf(searchTerm, searchFrom)
    if (idx === -1) break

    // Step 5: Validate boundary (SECONDARY strategy)
    let confidence: BoundaryConfidence
    if (isNoSpaceLanguage(lang)) {
      // CR2 FIX: pass cleanText (non-lowercased) — Intl.Segmenter boundaries are case-independent
      // positions in cleanText === positions in searchText (toLowerCase never changes CJK/Thai char length)
      confidence = validateBoundary(cleanText, idx, searchTerm.length, lang)
    } else {
      confidence = validateEuropeanBoundary(searchText, idx, searchTerm.length)
    }

    results.push({ position: idx, confidence })
    searchFrom = idx + 1 // continue searching after this position
  }

  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Async logger (side effects — called when boundary mismatch detected)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Logs boundary mismatch to BOTH audit log and pino (per Architecture Decision 5.5).
 * Called ONCE per unique (segmentId, term) pair — do not call for every occurrence.
 */
async function logBoundaryMismatch(
  ctx: SegmentContext,
  term: string,
  position: number,
): Promise<void> {
  // Log 1: Audit log (compliance trail — Layer 1 of 3-layer defense)
  await writeAuditLog({
    tenantId: ctx.tenantId,
    ...(ctx.userId !== undefined ? { userId: ctx.userId } : {}),
    entityType: 'segment',
    entityId: ctx.segmentId,
    action: 'glossary_boundary_mismatch',
    newValue: { term, match_position: position, segment_id: ctx.segmentId },
  })

  // Log 2: Structured pino log (monitoring + alerting)
  logger.warn({
    msg: 'glossary_boundary_mismatch',
    segment_id: ctx.segmentId,
    project_id: ctx.projectId,
    term,
    match_position: position,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Main public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks glossary term compliance for a single target segment.
 * Designed to be called by the L1 Rule Engine (Story 2.4) per segment.
 *
 * Loads all glossary terms for the project via getCachedGlossaryTerms, then for each term:
 *   - Searches for the TARGET term (not source) in the target segment text
 *   - Reports found matches with boundary confidence
 *   - Reports missing terms (expected target not found → potential violation)
 *   - Logs boundary mismatches (per AC2 dual-logging requirement)
 *
 * @param sourceLang  — BCP-47 language code of source (reserved for future Rule Engine use)
 * @param targetLang  — BCP-47 language code of target (e.g., 'th', 'ja', 'zh-Hans')
 * @param targetText  — the segment's target text (from SDLXLIFF/XLIFF parsing)
 * @param ctx         — segment context for audit logging + term loading (projectId, tenantId)
 * @returns GlossaryCheckResult
 */
export async function checkGlossaryCompliance(
  sourceLang: string,
  targetLang: string,
  targetText: string,
  ctx: SegmentContext,
): Promise<GlossaryCheckResult> {
  const terms = await getCachedGlossaryTerms(ctx.projectId, ctx.tenantId)

  const matches: GlossaryTermMatch[] = []
  const missingTerms: string[] = []
  const lowConfidenceMatches: GlossaryTermMatch[] = []
  // Track logged mismatches to avoid duplicate audit entries per (segmentId, term)
  const loggedMismatches = new Set<string>()

  for (const term of terms) {
    const occurrences = findTermInText(targetText, term.targetTerm, term.caseSensitive, targetLang)

    if (occurrences.length === 0) {
      missingTerms.push(term.id)
      continue
    }

    // Use first occurrence for the match record (primary hit)
    // Safe: occurrences.length > 0 guaranteed by the check above
    const first = occurrences[0]!
    // CR1 FIX: extract actual matched text from NFKC-normalized original
    // (for case-insensitive European matches, foundText preserves original case)
    const normalizedTargetTerm = term.targetTerm.normalize('NFKC')
    const foundText = targetText
      .normalize('NFKC')
      .slice(first.position, first.position + normalizedTargetTerm.length)
    const match: GlossaryTermMatch = {
      termId: term.id,
      sourceTerm: term.sourceTerm,
      expectedTarget: term.targetTerm,
      foundText, // actual text at match position (may differ in case from expectedTarget)
      position: first.position,
      boundaryConfidence: first.confidence,
    }

    matches.push(match)

    if (first.confidence === 'low') {
      lowConfidenceMatches.push(match)

      // Dual-log boundary mismatch (once per term per segment)
      const logKey = `${ctx.segmentId}:${term.targetTerm}`
      if (!loggedMismatches.has(logKey)) {
        loggedMismatches.add(logKey)
        await logBoundaryMismatch(ctx, term.targetTerm, first.position)
      }
    }
  }

  return { matches, missingTerms, lowConfidenceMatches }
}
