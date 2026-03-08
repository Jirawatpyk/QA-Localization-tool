/**
 * ATDD Tests — Story 3.5: Score Lifecycle & Confidence Display
 * AC: AutoPassRationale component — renders structured JSON rationale from DB
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { AutoPassRationale } from '@/features/review/components/AutoPassRationale'
import type { AutoPassRationaleData } from '@/features/scoring/types'

// ── Test data builders ──

function buildRationaleData(overrides?: Partial<AutoPassRationaleData>): AutoPassRationaleData {
  return {
    score: 96,
    threshold: 95,
    margin: 1,
    severityCounts: { critical: 0, major: 2, minor: 3 },
    criteria: {
      scoreAboveThreshold: true,
      noCriticalFindings: true,
      allLayersComplete: true,
    },
    riskiestFinding: {
      category: 'accuracy',
      severity: 'major',
      confidence: 85,
      description: 'Translation accuracy issue detected',
    },
    isNewPair: false,
    fileCount: 60,
    ...overrides,
  }
}

function buildRationaleJson(overrides?: Partial<AutoPassRationaleData>): string {
  return JSON.stringify(buildRationaleData(overrides))
}

// ── Tests ──

describe('AutoPassRationale', () => {
  // 3.5-U-026: renders full rationale (margin, severity counts, criteria checkmarks)
  it('[P0] should render full rationale with margin, severity counts, and criteria checkmarks', () => {
    // Arrange: complete rationale with all fields populated
    const rationaleJson = buildRationaleJson({
      score: 96,
      threshold: 95,
      margin: 1,
      severityCounts: { critical: 0, major: 2, minor: 3 },
    })

    // Act
    render(<AutoPassRationale rationale={rationaleJson} />)

    // Assert: score and threshold displayed (e.g. "96 / 95" or "Score: 96")
    expect(screen.getByText(/96/)).toBeInTheDocument()
    expect(screen.getByText(/95/)).toBeInTheDocument()

    // Margin displayed (e.g. "+1.0" or "margin: 1")
    expect(screen.getByText(/\+1|margin.*1|1\.0/i)).toBeInTheDocument()

    // Severity counts — 0 critical, 2 major, 3 minor
    expect(screen.getAllByText(/major/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/minor/i).length).toBeGreaterThanOrEqual(1)

    // Criteria checkmarks — both criteria met
    // "No critical findings" check
    expect(screen.getByText(/no critical|critical.*0/i)).toBeInTheDocument()
  })

  // 3.5-U-027: renders with 0 findings (score=100, empty severity)
  it('[P0] should render correctly with score=100 and zero findings', () => {
    // Arrange: perfect score, no findings at all
    const rationaleJson = buildRationaleJson({
      score: 100,
      threshold: 95,
      margin: 5,
      severityCounts: { critical: 0, major: 0, minor: 0 },
      criteria: { scoreAboveThreshold: true, noCriticalFindings: true, allLayersComplete: true },
      riskiestFinding: null,
    })

    // Act
    render(<AutoPassRationale rationale={rationaleJson} />)

    // Assert: renders without crashing; score is visible
    expect(screen.getByText(/100/)).toBeInTheDocument()

    // No riskiest finding section shown
    expect(screen.queryByTestId('riskiest-finding')).toBeNull()
  })

  // 3.5-U-028: JSON parse failure -> shows raw text fallback
  it('[P0] should render raw text fallback when rationale is not valid JSON', () => {
    // Arrange: legacy rationale string (before structured rationale was introduced)
    const legacyRationale = 'Score 96 >= configured threshold 95 with no critical findings'

    // Act
    render(<AutoPassRationale rationale={legacyRationale} />)

    // Assert: raw text is shown as fallback — graceful degradation for old records
    expect(screen.getByText(legacyRationale)).toBeInTheDocument()
  })

  // 3.5-U-029: null riskiestFinding -> no riskiest section rendered
  it('[P1] should not render riskiest finding section when riskiestFinding is null', () => {
    // Arrange: rationale with riskiestFinding: null (no AI findings)
    const rationaleJson = buildRationaleJson({
      riskiestFinding: null,
      severityCounts: { critical: 0, major: 0, minor: 1 },
    })

    // Act
    render(<AutoPassRationale rationale={rationaleJson} />)

    // Assert: no riskiest-finding testid or heading rendered
    expect(screen.queryByTestId('riskiest-finding')).toBeNull()
    expect(screen.queryByText(/riskiest/i)).toBeNull()
  })

  // 3.5-U-030: empty string rationale -> "No rationale available"
  it('[P1] should render "No rationale available" placeholder when rationale is empty string', () => {
    // Arrange: empty rationale (edge case — score was auto_passed before structured rationale)
    // Act
    render(<AutoPassRationale rationale="" />)

    // Assert: user-facing placeholder shown instead of blank content
    expect(screen.getByText(/no rationale available/i)).toBeInTheDocument()
  })
})

// TA: Coverage Gap Tests (Story 3.5)
describe('AutoPassRationale — TA coverage gap tests (Story 3.5)', () => {
  // WI-1: Valid JSON with wrong shape → graceful fallback via Zod validation
  it('[P1] should render raw text fallback when JSON has wrong shape (WI-1)', () => {
    // Arrange: valid JSON but missing required fields — Zod safeParse rejects, falls back to raw text
    const wrongShapeJson = '{"version":2,"note":"ok"}'

    // Act
    render(<AutoPassRationale rationale={wrongShapeJson} />)

    // Assert: falls back to raw text display (no crash)
    expect(screen.getByText(wrongShapeJson)).toBeInTheDocument()
  })

  // G7: margin exactly 0.0 → display "+0.0"
  it('[P2] should display "+0.0" when margin is exactly 0 (G7)', () => {
    // Arrange: score exactly equals threshold → margin = 0
    const rationaleJson = JSON.stringify(
      buildRationaleData({
        score: 95,
        threshold: 95,
        margin: 0,
      }),
    )

    // Act
    render(<AutoPassRationale rationale={rationaleJson} />)

    // Assert: margin badge shows "+0.0" (positive prefix for zero, 1 decimal place)
    expect(screen.getByText('+0.0')).toBeInTheDocument()
  })

  // G8: negative margin -1.5 → display "-1.5" (no "+-" prefix)
  it('[P2] should display "-1.5" without double prefix when margin is negative (G8)', () => {
    // Arrange: score below threshold → negative margin
    const rationaleJson = JSON.stringify(
      buildRationaleData({
        score: 93.5,
        threshold: 95,
        margin: -1.5,
        criteria: {
          scoreAboveThreshold: false,
          noCriticalFindings: true,
          allLayersComplete: true,
        },
      }),
    )

    // Act
    render(<AutoPassRationale rationale={rationaleJson} />)

    // Assert: displays "-1.5" (not "+-1.5") — CR R1 fix verification
    expect(screen.getByText('-1.5')).toBeInTheDocument()
    // Verify no double-prefix "+-" appears
    expect(screen.queryByText(/\+\-/)).toBeNull()
  })
})
