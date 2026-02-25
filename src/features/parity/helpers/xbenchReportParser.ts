// Stub: Story 2.7 — Xbench report parser
// TODO: Implement in Story 2.7

type XbenchFinding = {
  sourceText: string
  targetText: string
  category: string
  severity: string
  fileName: string
  segmentNumber: number
  authority?: string
}

type XbenchParseResult = {
  findings: XbenchFinding[]
  fileGroups: Record<string, XbenchFinding[]>
}

export async function parseXbenchReport(_buffer: Buffer): Promise<XbenchParseResult> {
  return { findings: [], fileGroups: {} }
}
