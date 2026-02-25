export type XbenchFinding = {
  file: string
  segment: string
  sourceText: string
  targetText: string
  checkType: string
  description: string
  severity: string
}

export type ParityFinding = {
  category: string
  severity: string
  sourceText: string
  targetText: string
  description: string
  source: 'tool' | 'xbench' | 'both'
}

export type ParityMatch = {
  toolFinding: ParityFinding
  xbenchFinding: XbenchFinding
  matchType: 'exact' | 'fuzzy'
}

export type ParityComparisonResult = {
  toolOnly: ParityFinding[]
  bothFound: ParityMatch[]
  xbenchOnly: XbenchFinding[]
  summary: {
    toolFindingCount: number
    xbenchFindingCount: number
    bothFoundCount: number
    toolOnlyCount: number
    xbenchOnlyCount: number
  }
}
