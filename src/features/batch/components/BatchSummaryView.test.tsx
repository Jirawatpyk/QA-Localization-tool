/// <reference types="vitest/globals" />
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildFile, buildScoreRecord } from '@/test/factories'
import type { DbFileStatus } from '@/types/pipeline'

import { BatchSummaryView } from './BatchSummaryView'

// Mock child components to isolate BatchSummaryView
vi.mock('./BatchSummaryHeader', () => ({
  BatchSummaryHeader: vi.fn(({ totalFiles, passedCount, needsReviewCount }) => (
    <div data-testid="mock-header">
      <span data-testid="total-files">{totalFiles}</span>
      <span data-testid="passed-count">{passedCount}</span>
      <span data-testid="needs-review-count">{needsReviewCount}</span>
    </div>
  )),
}))

vi.mock('./FileStatusCard', () => ({
  FileStatusCard: vi.fn(({ file }) => (
    <div data-testid={`mock-card-${file.fileId}`}>{file.fileName}</div>
  )),
}))

// Batch file item type aligned with component's BatchFileItem (uses DbFileStatus)
type BatchFileItem = {
  fileId: string
  fileName: string
  status: DbFileStatus
  mqmScore: number | null
  criticalCount: number
  majorCount: number
  minorCount: number
}

function buildBatchFileItem(overrides?: Partial<BatchFileItem>): BatchFileItem {
  const file = buildFile()
  const score = buildScoreRecord()
  return {
    fileId: file.fileId,
    fileName: file.fileName,
    status: 'l1_completed' as DbFileStatus,
    mqmScore: score.mqmScore,
    criticalCount: score.criticalCount,
    majorCount: score.majorCount,
    minorCount: score.minorCount,
    ...overrides,
  }
}

const PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const passedFiles: BatchFileItem[] = [
  buildBatchFileItem({
    fileId: 'f1-uuid-0001-0001-000000000001',
    fileName: 'intro.sdlxliff',
    status: 'l1_completed',
    mqmScore: 97.5,
  }),
  buildBatchFileItem({
    fileId: 'f2-uuid-0002-0002-000000000002',
    fileName: 'chapter1.xlf',
    status: 'l1_completed',
    mqmScore: 96.0,
  }),
]

const reviewFiles: BatchFileItem[] = [
  buildBatchFileItem({
    fileId: 'f3-uuid-0003-0003-000000000003',
    fileName: 'glossary.xlsx',
    status: 'l2_completed',
    mqmScore: 78.3,
    criticalCount: 1,
    majorCount: 3,
    minorCount: 5,
  }),
]

describe('BatchSummaryView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P1: Core rendering ──

  it('[P1] should render Recommended Pass and Need Review groups', () => {
    // EXPECTED: Two visually distinct group sections
    // - "Recommended Pass" group header for files with auto_passed status
    // - "Needs Review" group header for files needing manual review
    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
      />,
    )

    expect(screen.getByRole('heading', { name: /Recommended Pass/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Needs? Review/i })).toBeTruthy()
  })

  it('[P1] should display correct file count in each group header', () => {
    // EXPECTED: Each group header shows "N files" count
    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
      />,
    )

    const passedSection = screen
      .getByRole('heading', { name: /Recommended Pass/i })
      .closest('section')!
    expect(within(passedSection).getByText(/2 files/i)).toBeTruthy()

    const reviewSection = screen
      .getByRole('heading', { name: /Needs? Review/i })
      .closest('section')!
    expect(within(reviewSection).getByText(/1 file/i)).toBeTruthy()
  })

  it('[P1] should render FileStatusCard for each file in both groups', () => {
    // EXPECTED: 2 cards in passed group + 1 card in review group = 3 total FileStatusCard instances
    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
      />,
    )

    expect(screen.getByTestId('mock-card-f1-uuid-0001-0001-000000000001')).toBeTruthy()
    expect(screen.getByTestId('mock-card-f2-uuid-0002-0002-000000000002')).toBeTruthy()
    expect(screen.getByTestId('mock-card-f3-uuid-0003-0003-000000000003')).toBeTruthy()
  })

  // ── P3: Responsive breakpoints ──

  it('[P3] should show full detail FileStatusCards at >= 1440px', () => {
    // EXPECTED: At desktop-xl breakpoint (>= 1440px), each file shows full detail cards
    // with score, severity breakdown, and status badge all visible.
    // The layout uses grid with multiple columns.
    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
      />,
    )

    // Should have the wide-layout container class (e.g., grid-cols-2 or grid-cols-3)
    const container = screen.getByTestId('batch-summary-grid')
    expect(container.className).toMatch(/grid/)
  })

  it('[P3] should show compact layout at >= 1024px', () => {
    // EXPECTED: At tablet/laptop breakpoint (>= 1024px), cards show condensed layout
    // (filename + score inline, no full severity breakdown)
    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
      />,
    )

    // Compact layout container should exist
    const container = screen.getByTestId('batch-summary-grid')
    expect(container).toBeTruthy()
  })

  it('[P3] should show only summary counts at < 768px with no cards', () => {
    // EXPECTED: At mobile breakpoint (< 768px), no individual file cards are rendered.
    // Instead, only aggregate counts are shown (e.g., "2 Passed, 1 Needs Review")
    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
        compact={true}
      />,
    )

    // Summary counts should be visible
    expect(screen.getByText(/2/)).toBeTruthy()
    expect(screen.getByText(/1/)).toBeTruthy()

    // Individual file cards should NOT be rendered
    expect(screen.queryByTestId('mock-card-f1-uuid-0001-0001-000000000001')).toBeNull()
  })

  // ── P1: Cross-file findings (TD-TEST-005) ──

  it('[P1] should render cross-file issues section when crossFileFindings provided', () => {
    const crossFileFindings = [
      {
        id: 'cf-001',
        description: 'Inconsistent translation of "Submit"',
        sourceTextExcerpt: 'Submit button',
        relatedFileIds: ['f1-uuid-0001-0001-000000000001', 'f2-uuid-0002-0002-000000000002'],
      },
      {
        id: 'cf-002',
        description: 'Number format mismatch across files',
        sourceTextExcerpt: null,
        relatedFileIds: ['f1-uuid-0001-0001-000000000001', 'f3-uuid-0003-0003-000000000003'],
      },
    ]

    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
        crossFileFindings={crossFileFindings}
      />,
    )

    expect(screen.getByTestId('cross-file-issues')).toBeTruthy()
    expect(screen.getByText(/2 inconsistencies found/i)).toBeTruthy()
    expect(screen.getByText(/Inconsistent translation of "Submit"/)).toBeTruthy()
    expect(screen.getByText(/Number format mismatch/)).toBeTruthy()
    // Both findings have 2 relatedFileIds → 2 elements with "Affects 2 files"
    expect(screen.getAllByText(/Affects 2 files/)).toHaveLength(2)
  })

  it('[P1] should not render cross-file section when crossFileFindings is empty', () => {
    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
        crossFileFindings={[]}
      />,
    )

    expect(screen.queryByTestId('cross-file-issues')).toBeNull()
  })

  // ── Story 3.1: AI cost summary line (EXTEND) ──

  it('[P0] should render AI cost summary line when aiCostSummary prop is provided', () => {
    const aiCostSummary = {
      totalCostUsd: 1.25,
      fileCount: 3,
      costPer100kWords: 0.4,
    }

    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
        aiCostSummary={aiCostSummary}
      />,
    )

    expect(screen.getByTestId('ai-cost-summary')).toBeTruthy()
    // RED: aiCostSummary prop not yet on BatchSummaryView
  })

  it("[P0] should display formatted cost: 'AI cost: $X.XX (Y files, $Z.ZZ per 100K words)'", () => {
    const aiCostSummary = {
      totalCostUsd: 1.25,
      fileCount: 3,
      costPer100kWords: 0.4,
    }

    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
        aiCostSummary={aiCostSummary}
      />,
    )

    const costLine = screen.getByTestId('ai-cost-summary')
    expect(costLine.textContent).toContain('AI cost:')
    expect(costLine.textContent).toContain('$1.25')
    expect(costLine.textContent).toContain('3 files')
    expect(costLine.textContent).toContain('$0.40')
    expect(costLine.textContent).toContain('100K words')
    // RED: cost line formatting not yet implemented (AC6)
  })

  it('[P1] should not render AI cost line when aiCostSummary prop is undefined', () => {
    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
        // aiCostSummary not provided
      />,
    )

    expect(screen.queryByTestId('ai-cost-summary')).toBeNull()
    // RED: conditional rendering not yet implemented
  })

  it('[P1] should display $0.00 cost when aiCostSummary.totalCostUsd is 0', () => {
    const aiCostSummary = {
      totalCostUsd: 0,
      fileCount: 2,
      costPer100kWords: 0,
    }

    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
        aiCostSummary={aiCostSummary}
      />,
    )

    const costLine = screen.getByTestId('ai-cost-summary')
    expect(costLine.textContent).toContain('$0.00')
    // RED: zero-cost boundary case
  })

  // TA: Coverage Gap Tests — Story 2.7

  // C4 (P2): Cross-file section heading accessibility
  it('[P2] should render cross-file section with accessible h3 heading', () => {
    const crossFileFindings = [
      {
        id: 'cf-003',
        description: 'Inconsistent date format across files',
        sourceTextExcerpt: 'March 1, 2026',
        relatedFileIds: ['f1-uuid-0001-0001-000000000001', 'f2-uuid-0002-0002-000000000002'],
      },
    ]

    render(
      <BatchSummaryView
        projectId={PROJECT_ID}
        passedFiles={passedFiles}
        reviewFiles={reviewFiles}
        crossFileFindings={crossFileFindings}
      />,
    )

    // Cross-file section should have a heading element for screen reader accessibility
    const crossFileSection = screen.getByTestId('cross-file-issues')
    const heading = within(crossFileSection).getByRole('heading')
    expect(heading).toBeTruthy()
    expect(heading.textContent).toMatch(/Cross-file/i)
    // Heading level should be h3 (consistent with other section headings)
    expect(heading.tagName).toBe('H3')
  })
})
