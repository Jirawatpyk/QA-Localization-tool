/// <reference types="vitest/globals" />
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildFile, buildScoreRecord } from '@/test/factories'

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

// Minimal type for batch summary file items (component not yet created)
type BatchFileItem = {
  fileId: string
  fileName: string
  status: 'auto_passed' | 'needs_review' | 'failed'
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
    status: 'auto_passed',
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
    status: 'auto_passed',
    mqmScore: 97.5,
  }),
  buildBatchFileItem({
    fileId: 'f2-uuid-0002-0002-000000000002',
    fileName: 'chapter1.xlf',
    status: 'auto_passed',
    mqmScore: 96.0,
  }),
]

const reviewFiles: BatchFileItem[] = [
  buildBatchFileItem({
    fileId: 'f3-uuid-0003-0003-000000000003',
    fileName: 'glossary.xlsx',
    status: 'needs_review',
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

  it.skip('[P1] should render Recommended Pass and Need Review groups', () => {
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

  it.skip('[P1] should display correct file count in each group header', () => {
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

  it.skip('[P1] should render FileStatusCard for each file in both groups', () => {
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

  it.skip('[P3] should show full detail FileStatusCards at >= 1440px', () => {
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

  it.skip('[P3] should show compact layout at >= 1024px', () => {
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

  it.skip('[P3] should show only summary counts at < 768px with no cards', () => {
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
})
