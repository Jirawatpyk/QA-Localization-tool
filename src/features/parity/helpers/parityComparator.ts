// Stub: Story 2.7 — parity comparator
// TODO: Implement in Story 2.7

type XbenchFinding = {
  sourceText: string
  targetText: string
  category: string
  severity: string
  fileName: string
  segmentNumber: number
}

type ToolFinding = {
  sourceTextExcerpt: string | null
  targetTextExcerpt: string | null
  category: string
  severity: string
  fileId: string
  segmentId: string
}

type ComparisonResult = {
  matched: Array<{ xbenchCategory: string; toolCategory: string; severity: string }>
  xbenchOnly: XbenchFinding[]
  toolOnly: ToolFinding[]
}

export function compareFindings(
  _xbenchFindings: XbenchFinding[],
  _toolFindings: ToolFinding[],
  _fileId: string,
): ComparisonResult {
  return { matched: [], xbenchOnly: [], toolOnly: [] }
}
