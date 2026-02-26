import type {
  ActualFinding,
  EvaluationResult,
  EvaluationSummary,
  ExpectedFinding,
  GoldenSegment,
  MatchDetail,
} from './types'

/**
 * Evaluate AI findings against golden segment expectations.
 *
 * For each golden segment:
 * - If expectNoFinding=true: any finding is a false positive
 * - If expectNoFinding=false: match actual findings against expected findings
 *   using category + description keywords
 *
 * Returns per-segment results and aggregate Precision/Recall/F1.
 */
export function evaluateFindings(
  goldenSegments: GoldenSegment[],
  actualFindingsMap: Map<string, ActualFinding[]>,
): EvaluationSummary {
  const perSegment: EvaluationResult[] = []

  let totalTP = 0
  let totalFP = 0
  let totalFN = 0
  let totalTN = 0

  for (const segment of goldenSegments) {
    const actuals = actualFindingsMap.get(segment.id) ?? []
    const result = evaluateSegment(segment, actuals)

    totalTP += result.truePositives
    totalFP += result.falsePositives
    totalFN += result.falseNegatives
    totalTN += result.trueNegatives

    perSegment.push(result)
  }

  const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 1
  const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 1
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

  return {
    totalSegments: goldenSegments.length,
    precision: round3(precision),
    recall: round3(recall),
    f1Score: round3(f1Score),
    truePositives: totalTP,
    falsePositives: totalFP,
    falseNegatives: totalFN,
    trueNegatives: totalTN,
    perSegment,
  }
}

/**
 * Evaluate a single segment's findings against expectations.
 */
function evaluateSegment(segment: GoldenSegment, actuals: ActualFinding[]): EvaluationResult {
  const matches: MatchDetail[] = []

  if (segment.expectNoFinding) {
    // True negative case: AI should return no findings
    if (actuals.length === 0) {
      matches.push({
        expected: null,
        actual: null,
        matched: true,
        reason: 'Correctly identified as clean (true negative)',
      })
      return {
        segmentId: segment.id,
        label: segment.label,
        truePositives: 0,
        falseNegatives: 0,
        falsePositives: 0,
        trueNegatives: 1,
        matches,
      }
    }

    // False positives: AI flagged a correct translation
    for (const actual of actuals) {
      matches.push({
        expected: null,
        actual,
        matched: false,
        reason: `False positive: "${actual.category}" flagged on clean segment`,
      })
    }
    return {
      segmentId: segment.id,
      label: segment.label,
      truePositives: 0,
      falseNegatives: 0,
      falsePositives: actuals.length,
      trueNegatives: 0,
      matches,
    }
  }

  // Positive case: match expected findings against actuals
  const matchedActualIndices = new Set<number>()
  let tp = 0
  let fn = 0

  for (const expected of segment.expectedFindings) {
    const matchIdx = findBestMatch(expected, actuals, matchedActualIndices)

    if (matchIdx >= 0) {
      matchedActualIndices.add(matchIdx)
      tp++
      matches.push({
        expected,
        actual: actuals[matchIdx]!,
        matched: true,
        reason: `Matched: ${expected.category} found correctly`,
      })
    } else {
      fn++
      matches.push({
        expected,
        actual: null,
        matched: false,
        reason: `Missed: expected ${expected.category} (${expected.severity}) not detected`,
      })
    }
  }

  // Unmatched actuals are false positives
  const fp = actuals.length - matchedActualIndices.size
  for (let i = 0; i < actuals.length; i++) {
    if (!matchedActualIndices.has(i)) {
      matches.push({
        expected: null,
        actual: actuals[i]!,
        matched: false,
        reason: `False positive: unexpected "${actuals[i]!.category}" finding`,
      })
    }
  }

  return {
    segmentId: segment.id,
    label: segment.label,
    truePositives: tp,
    falseNegatives: fn,
    falsePositives: fp,
    trueNegatives: 0,
    matches,
  }
}

/**
 * Find the best matching actual finding for an expected finding.
 *
 * Match criteria (ALL must pass):
 * 1. Category matches (case-insensitive, partial match allowed)
 * 2. At least ONE description keyword found in actual description
 * 3. Not already matched to another expected finding
 */
function findBestMatch(
  expected: ExpectedFinding,
  actuals: ActualFinding[],
  alreadyMatched: Set<number>,
): number {
  const expectedCat = expected.category.toLowerCase()

  for (let i = 0; i < actuals.length; i++) {
    if (alreadyMatched.has(i)) continue

    const actual = actuals[i]!
    const actualCat = actual.category.toLowerCase()

    // Category match (exact or partial — e.g., "mistranslation" matches "accuracy")
    const categoryMatch =
      actualCat === expectedCat ||
      actualCat.includes(expectedCat) ||
      expectedCat.includes(actualCat)

    if (!categoryMatch) continue

    // Description keyword match
    const actualDesc = actual.description.toLowerCase()
    const hasKeyword = expected.descriptionKeywords.some((kw) =>
      actualDesc.includes(kw.toLowerCase()),
    )

    if (hasKeyword) return i
  }

  return -1
}

/**
 * Format evaluation summary as human-readable report.
 */
export function formatEvaluationReport(summary: EvaluationSummary): string {
  const lines: string[] = [
    '# Prompt Evaluation Report',
    '',
    `**Total Segments:** ${summary.totalSegments}`,
    `**Precision:** ${(summary.precision * 100).toFixed(1)}%`,
    `**Recall:** ${(summary.recall * 100).toFixed(1)}%`,
    `**F1 Score:** ${(summary.f1Score * 100).toFixed(1)}%`,
    '',
    `| Metric | Count |`,
    `|--------|-------|`,
    `| True Positives | ${summary.truePositives} |`,
    `| False Positives | ${summary.falsePositives} |`,
    `| False Negatives | ${summary.falseNegatives} |`,
    `| True Negatives | ${summary.trueNegatives} |`,
    '',
    '## Per-Segment Results',
    '',
  ]

  for (const seg of summary.perSegment) {
    const status = seg.falseNegatives === 0 && seg.falsePositives === 0 ? '✅' : '❌'
    lines.push(`### ${status} ${seg.label} (${seg.segmentId})`)
    lines.push(
      `TP: ${seg.truePositives} | FP: ${seg.falsePositives} | FN: ${seg.falseNegatives} | TN: ${seg.trueNegatives}`,
    )

    for (const m of seg.matches) {
      const icon = m.matched ? '✅' : '❌'
      lines.push(`- ${icon} ${m.reason}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
