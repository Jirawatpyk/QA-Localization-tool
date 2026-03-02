// Parity severity includes FindingSeverity + Xbench-specific values
export type ParitySeverity = 'critical' | 'major' | 'minor' | 'trivial'

const VALID_PARITY_SEVERITIES = new Set<ParitySeverity>(['critical', 'major', 'minor', 'trivial'])

/** Coerce raw string (e.g. from Excel parser) to ParitySeverity, defaulting to 'minor'. */
export function toParitySeverity(value: string | undefined | null): ParitySeverity {
  const normalized = value?.toLowerCase().trim()
  return VALID_PARITY_SEVERITIES.has(normalized as ParitySeverity)
    ? (normalized as ParitySeverity)
    : 'minor'
}

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
