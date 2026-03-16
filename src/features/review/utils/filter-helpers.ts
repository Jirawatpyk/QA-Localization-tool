import type { Finding, FindingSeverity, FindingStatus, DetectedByLayer } from '@/types/finding'

export type ConfidenceFilter = 'high' | 'medium' | 'low'

/** Shared confidence bucket: high >85, medium 70–85, low <70 */
export function getConfidenceBucket(aiConfidence: number): ConfidenceFilter {
  if (aiConfidence > 85) return 'high'
  if (aiConfidence >= 70) return 'medium'
  return 'low'
}

export type FilterState = {
  severity: FindingSeverity | null
  status: FindingStatus | null
  layer: DetectedByLayer | null
  category: string | null
  confidence: ConfidenceFilter | null
}

export const DEFAULT_FILTER_STATE: FilterState = {
  severity: null,
  status: 'pending',
  layer: null,
  category: null,
  confidence: null,
}

/** Check if a finding passes all current filters + search + AI toggle */
export function findingMatchesFilters(
  finding: Finding,
  filterState: FilterState,
  searchQuery: string,
  aiSuggestionsEnabled: boolean,
): boolean {
  // AI toggle: hide L2/L3 when disabled
  if (
    !aiSuggestionsEnabled &&
    (finding.detectedByLayer === 'L2' || finding.detectedByLayer === 'L3')
  ) {
    return false
  }
  // Severity
  if (filterState.severity !== null && finding.severity !== filterState.severity) return false
  // Status: 'accepted' also matches 're_accepted' (semantic grouping)
  if (filterState.status !== null) {
    if (filterState.status === 'accepted') {
      if (finding.status !== 'accepted' && finding.status !== 're_accepted') return false
    } else {
      if (finding.status !== filterState.status) return false
    }
  }
  // Layer: 'L1' = exact match, 'L2' = AI group (L2+L3) per AC1 "All/Rule-based/AI"
  if (filterState.layer !== null) {
    if (filterState.layer === 'L2') {
      if (finding.detectedByLayer !== 'L2' && finding.detectedByLayer !== 'L3') return false
    } else {
      if (finding.detectedByLayer !== filterState.layer) return false
    }
  }
  // Category
  if (filterState.category !== null && finding.category !== filterState.category) return false
  // Confidence thresholds via shared bucket function
  if (filterState.confidence !== null) {
    if (finding.aiConfidence === null) return false
    if (getConfidenceBucket(finding.aiConfidence) !== filterState.confidence) return false
  }
  // Search query (Thai/CJK safe — uses toLocaleLowerCase + includes)
  const trimmedQuery = searchQuery.trim()
  if (trimmedQuery !== '') {
    const lowerQuery = trimmedQuery.toLocaleLowerCase()
    const matches = (text: string | null) => text?.toLocaleLowerCase().includes(lowerQuery) ?? false
    if (
      !matches(finding.sourceTextExcerpt) &&
      !matches(finding.targetTextExcerpt) &&
      !matches(finding.description) &&
      !matches(finding.suggestedFix)
    ) {
      return false
    }
  }
  return true
}
