/**
 * Confidence level for a glossary term match.
 * 'high' = Intl.Segmenter confirmed both start and end align with word boundaries.
 * 'low'  = Substring found but boundary validation failed (compound word split, etc.)
 *          Match is still valid — accepted with flag per Architecture Decision 5.6.
 */
export type BoundaryConfidence = 'high' | 'low'

/**
 * A single occurrence of a glossary term found in the target text.
 */
export type GlossaryTermMatch = {
  termId: string // glossary_terms.id
  sourceTerm: string // the source glossary term
  expectedTarget: string // the expected target translation (glossary_terms.target_term)
  foundText: string // the actual text matched (same as expectedTarget for exact match)
  position: number // 0-based index in NFKC-normalized target text
  boundaryConfidence: BoundaryConfidence
}

/**
 * Result of glossary compliance check for a single segment.
 */
export type GlossaryCheckResult = {
  matches: GlossaryTermMatch[] // terms found in target text
  missingTerms: string[] // termIds whose target was NOT found in text
  lowConfidenceMatches: GlossaryTermMatch[] // subset of matches with 'low' confidence
}

/**
 * Context for a segment — needed for boundary mismatch logging.
 */
export type SegmentContext = {
  segmentId: string
  projectId: string
  tenantId: string
  userId?: string // optional — who triggered the check
}
