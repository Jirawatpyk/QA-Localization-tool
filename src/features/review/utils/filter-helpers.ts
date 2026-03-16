import type { Finding, FindingSeverity, FindingStatus, DetectedByLayer } from '@/types/finding'

export type ConfidenceFilter = 'high' | 'medium' | 'low'

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
  // Status
  if (filterState.status !== null && finding.status !== filterState.status) return false
  // Layer
  if (filterState.layer !== null && finding.detectedByLayer !== filterState.layer) return false
  // Category
  if (filterState.category !== null && finding.category !== filterState.category) return false
  // Confidence thresholds: high >85, medium 70–85, low <70
  if (filterState.confidence !== null) {
    if (finding.aiConfidence === null) return false
    switch (filterState.confidence) {
      case 'high':
        if (finding.aiConfidence <= 85) return false
        break
      case 'medium':
        if (finding.aiConfidence < 70 || finding.aiConfidence > 85) return false
        break
      case 'low':
        if (finding.aiConfidence >= 70) return false
        break
    }
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
