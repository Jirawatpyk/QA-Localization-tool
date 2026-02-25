import { mapXbenchToToolCategory } from '@/features/parity/helpers/xbenchCategoryMapper'
import { logger } from '@/lib/logger'

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
  fileId: string | null
  segmentId: string | null
}

type MatchedFinding = {
  xbenchCategory: string
  toolCategory: string
  severity: string
}

type ComparisonResult = {
  matched: MatchedFinding[]
  xbenchOnly: XbenchFinding[]
  toolOnly: ToolFinding[]
}

// Severity levels ordered for tolerance comparison
const SEVERITY_LEVELS: Record<string, number> = {
  critical: 3,
  major: 2,
  minor: 1,
  trivial: 0,
}

function severityWithinTolerance(severity1: string, severity2: string, tolerance: number): boolean {
  const level1 = SEVERITY_LEVELS[severity1.toLowerCase()] ?? -1
  const level2 = SEVERITY_LEVELS[severity2.toLowerCase()] ?? -1
  if (level1 < 0 || level2 < 0) return false
  return Math.abs(level1 - level2) <= tolerance
}

function normalize(text: string | null): string {
  if (!text) return ''
  return text.normalize('NFKC').trim().toLowerCase()
}

export function compareFindings(
  xbenchFindings: XbenchFinding[],
  toolFindings: ToolFinding[],
  fileId?: string,
): ComparisonResult {
  // C2: When fileId is provided and non-empty, filter to that file; otherwise use all findings
  const relevantToolFindings = fileId
    ? toolFindings.filter((f) => f.fileId === fileId)
    : toolFindings

  const matched: MatchedFinding[] = []
  const matchedXbenchIndices = new Set<number>()
  const matchedToolIndices = new Set<number>()

  // Match by mapped category + NFKC-normalized source text with +-1 severity tolerance
  for (let xi = 0; xi < xbenchFindings.length; xi++) {
    const xf = xbenchFindings[xi]!
    // C1: Map Xbench category to tool rule engine category before comparison
    const xToolCategory = mapXbenchToToolCategory(xf.category)
    const xSource = normalize(xf.sourceText)

    for (let ti = 0; ti < relevantToolFindings.length; ti++) {
      if (matchedToolIndices.has(ti)) continue

      const tf = relevantToolFindings[ti]!
      const tCategory = tf.category.toLowerCase()
      const tSource = normalize(tf.sourceTextExcerpt)

      // Match criteria: mapped category match + same segment (source text match) + severity within +-1
      const categoryMatch = xToolCategory === tCategory
      const sourceMatch =
        xSource === tSource ||
        (xSource.length > 0 &&
          tSource.length > 0 &&
          (xSource.includes(tSource) || tSource.includes(xSource)))
      const severityMatch = severityWithinTolerance(xf.severity, tf.severity, 1)

      if (categoryMatch && sourceMatch && severityMatch) {
        matched.push({
          xbenchCategory: xf.category,
          toolCategory: tf.category,
          severity: xf.severity,
        })
        matchedXbenchIndices.add(xi)
        matchedToolIndices.add(ti)
        break
      }
    }
  }

  const xbenchOnly = xbenchFindings.filter((_, i) => !matchedXbenchIndices.has(i))
  const toolOnly = relevantToolFindings.filter((_, i) => !matchedToolIndices.has(i))

  logger.info(
    `Parity comparison: ${matched.length} matched, ${xbenchOnly.length} xbench-only, ${toolOnly.length} tool-only`,
  )

  return { matched, xbenchOnly, toolOnly }
}
