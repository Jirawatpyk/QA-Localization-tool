/// <reference types="vitest/globals" />
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildFile, buildScoreRecord } from '@/test/factories'
import type { DbFileStatus } from '@/types/pipeline'

import { FileHistoryTable } from './FileHistoryTable'

// Mock ScoreBadge to isolate
vi.mock('./ScoreBadge', () => ({
  ScoreBadge: vi.fn(({ score }: { score: number | null }) => (
    <span data-testid="mock-score-badge">{score !== null ? score.toFixed(1) : 'N/A'}</span>
  )),
}))

// Type for file history row (aligned with FileHistoryPageClient)
type FileHistoryRow = {
  fileId: string
  fileName: string
  processedAt: string // ISO 8601
  status: DbFileStatus
  mqmScore: number | null
  reviewerName: string | null
}

type FileHistoryFilter = 'all' | 'passed' | 'needs_review' | 'failed'

function buildFileHistoryRow(overrides?: Partial<FileHistoryRow>): FileHistoryRow {
  const file = buildFile()
  const score = buildScoreRecord()
  return {
    fileId: file.fileId,
    fileName: file.fileName,
    processedAt: new Date().toISOString(),
    status: 'l1_completed',
    mqmScore: score.mqmScore,
    reviewerName: null,
    ...overrides,
  }
}

const sampleRows: FileHistoryRow[] = [
  buildFileHistoryRow({
    fileId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
    fileName: 'intro.sdlxliff',
    status: 'l1_completed',
    mqmScore: 97.5,
    reviewerName: null,
  }),
  buildFileHistoryRow({
    fileId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
    fileName: 'chapter1.xlf',
    status: 'l2_completed',
    mqmScore: 78.3,
    reviewerName: 'Alice',
  }),
  buildFileHistoryRow({
    fileId: 'c3d4e5f6-a1b2-4c3d-ae4f-5a6b7c8d9e0f',
    fileName: 'glossary.xlsx',
    status: 'failed',
    mqmScore: null,
    reviewerName: null,
  }),
]

describe('FileHistoryTable', () => {
  const defaultProps = {
    files: sampleRows,
    totalCount: sampleRows.length,
    currentPage: 1,
    activeFilter: 'all' as FileHistoryFilter,
    onFilterChange: vi.fn(),
    onPageChange: vi.fn(),
    projectId: 'd4e5f6a1-b2c3-4d4e-bf5a-6b7c8d9e0f1a',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P2: Filter buttons ──

  it('[P2] should render filter buttons for all, passed, needs_review, failed', () => {
    // EXPECTED: A toolbar/button group with 4 filter options
    render(<FileHistoryTable {...defaultProps} />)

    expect(screen.getByRole('button', { name: /All/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Passed/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Needs Review/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Failed/i })).toBeTruthy()
  })

  it('[P2] should call onFilterChange when filter button clicked', async () => {
    // EXPECTED: Clicking "Needs Review" filter calls onFilterChange('needs_review')
    const user = userEvent.setup()
    const onFilterChange = vi.fn()
    render(<FileHistoryTable {...defaultProps} onFilterChange={onFilterChange} />)

    await user.click(screen.getByRole('button', { name: /Needs Review/i }))

    expect(onFilterChange).toHaveBeenCalledWith('needs_review')
  })

  it('[P2] should render file rows with filename, date, status, score, reviewer', () => {
    // EXPECTED: Table renders 3 rows (one per file in sampleRows)
    // Each row shows: fileName, processedAt (formatted), status badge, MQM score, reviewer name
    render(<FileHistoryTable {...defaultProps} />)

    const table = screen.getByRole('table')
    expect(table).toBeTruthy()

    // Column headers
    const headers = within(table).getAllByRole('columnheader')
    expect(headers.length).toBeGreaterThanOrEqual(5)

    // Data rows
    const rows = within(table).getAllByRole('row')
    // +1 for the header row
    expect(rows.length).toBe(4)

    // First file row
    expect(within(rows[1]!).getByText('intro.sdlxliff')).toBeTruthy()
    expect(within(rows[1]!).getByText(/L1 Completed/i)).toBeTruthy()

    // Second file row
    expect(within(rows[2]!).getByText('chapter1.xlf')).toBeTruthy()
    expect(within(rows[2]!).getByText('Alice')).toBeTruthy()

    // Third file row
    expect(within(rows[3]!).getByText('glossary.xlsx')).toBeTruthy()
    expect(within(rows[3]!).getByText(/Failed/i)).toBeTruthy()
  })

  // ── P3: Edge states ──

  it('[P3] should display empty state message when no files match filter', () => {
    // EXPECTED: When files array is empty, show a friendly empty state message
    render(<FileHistoryTable {...defaultProps} files={[]} totalCount={0} />)

    expect(screen.getByText(/No files/i)).toBeTruthy()
    // Should NOT render table rows (only a message)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('[P3] should render pagination controls when totalCount exceeds FILE_HISTORY_PAGE_SIZE', () => {
    // EXPECTED: When totalCount exceeds FILE_HISTORY_PAGE_SIZE (50), pagination appears
    // Server already paginates — component receives only 1 page of files + totalCount
    const pageOfFiles = Array.from({ length: 50 }, (_, i) =>
      buildFileHistoryRow({
        fileId: `a1b2c3d4-e5f6-4a1b-8c2d-${String(i).padStart(12, '0')}`,
        fileName: `file-${i}.sdlxliff`,
      }),
    )
    render(<FileHistoryTable {...defaultProps} files={pageOfFiles} totalCount={55} />)

    // Pagination controls should be visible
    const nav = screen.getByRole('navigation', { name: /pagination/i })
    expect(nav).toBeTruthy()
    // Should show page indicators within pagination nav
    expect(within(nav).getByText('1')).toBeTruthy()
    expect(within(nav).getByText('2')).toBeTruthy()
  })

  // TA: Coverage Gap Tests — Story 2.7

  // C2 (P2): Empty state when filter returns 0 results with active filter
  it('[P2] should display empty state message when files array is empty with active filter', () => {
    // EXPECTED: When files is empty and a non-"all" filter is active,
    // show empty state "No files found" — no table rendered
    render(
      <FileHistoryTable {...defaultProps} files={[]} totalCount={0} activeFilter="needs_review" />,
    )

    expect(screen.getByText(/No files/i)).toBeTruthy()
    // Table should NOT render when no files
    expect(screen.queryByRole('table')).toBeNull()
  })

  // ── Coverage: ScoreBadge rendering ──

  it('[P2] should render ScoreBadge with score value for scored files', () => {
    render(<FileHistoryTable {...defaultProps} />)

    const badges = screen.getAllByTestId('mock-score-badge')
    // First file: 97.5, Second: 78.3, Third: null → 'N/A'
    expect(badges[0]!.textContent).toBe('97.5')
    expect(badges[1]!.textContent).toBe('78.3')
    expect(badges[2]!.textContent).toBe('N/A')
  })

  it('[P2] should display reviewer name or dash for null reviewer', () => {
    render(<FileHistoryTable {...defaultProps} />)

    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')

    // First row: reviewerName null → '—'
    expect(within(rows[1]!).getByText('—')).toBeTruthy()
    // Second row: reviewerName 'Alice'
    expect(within(rows[2]!).getByText('Alice')).toBeTruthy()
    // Third row: reviewerName null → '—'
    expect(within(rows[3]!).getByText('—')).toBeTruthy()
  })

  // ── Coverage: Pagination onPageChange callback ──

  it('[P2] should call onPageChange when a page button is clicked', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    const pageOfFiles = Array.from({ length: 50 }, (_, i) =>
      buildFileHistoryRow({
        fileId: `a1b2c3d4-e5f6-4a1b-8c2d-${String(i).padStart(12, '0')}`,
        fileName: `file-${i}.sdlxliff`,
      }),
    )
    render(
      <FileHistoryTable
        {...defaultProps}
        files={pageOfFiles}
        totalCount={120}
        currentPage={1}
        onPageChange={onPageChange}
      />,
    )

    const nav = screen.getByRole('navigation', { name: /pagination/i })
    // Click page 2 button
    await user.click(within(nav).getByText('2'))

    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  // ── Coverage: Pagination ellipsis logic (lines 41-51) ──

  it('[P2] should render ellipsis for large page counts when current page is in the middle', () => {
    // totalCount = 500, pageSize = 50 → 10 pages, currentPage = 5
    const pageOfFiles = Array.from({ length: 50 }, (_, i) =>
      buildFileHistoryRow({
        fileId: `a1b2c3d4-e5f6-4a1b-8c2d-${String(i).padStart(12, '0')}`,
        fileName: `file-${i}.sdlxliff`,
      }),
    )
    render(
      <FileHistoryTable {...defaultProps} files={pageOfFiles} totalCount={500} currentPage={5} />,
    )

    const nav = screen.getByRole('navigation', { name: /pagination/i })
    // Should show: 1 ... 4 5 6 ... 10
    expect(within(nav).getByText('1')).toBeTruthy()
    expect(within(nav).getByText('4')).toBeTruthy()
    expect(within(nav).getByText('5')).toBeTruthy()
    expect(within(nav).getByText('6')).toBeTruthy()
    expect(within(nav).getByText('10')).toBeTruthy()
    // Should have ellipsis markers
    const ellipses = within(nav).getAllByText('...')
    expect(ellipses.length).toBe(2)
  })

  it('[P2] should not render ellipsis when total pages <= 7', () => {
    // totalCount = 250, pageSize = 50 → 5 pages
    const pageOfFiles = Array.from({ length: 50 }, (_, i) =>
      buildFileHistoryRow({
        fileId: `a1b2c3d4-e5f6-4a1b-8c2d-${String(i).padStart(12, '0')}`,
        fileName: `file-${i}.sdlxliff`,
      }),
    )
    render(
      <FileHistoryTable {...defaultProps} files={pageOfFiles} totalCount={250} currentPage={3} />,
    )

    const nav = screen.getByRole('navigation', { name: /pagination/i })
    // All 5 pages should render without ellipsis
    for (let i = 1; i <= 5; i++) {
      expect(within(nav).getByText(String(i))).toBeTruthy()
    }
    expect(within(nav).queryByText('...')).toBeNull()
  })

  it('[P2] should show trailing ellipsis only when current page is near the start', () => {
    // 10 pages, currentPage = 2 → 1 2 3 ... 10 (no leading ellipsis)
    const pageOfFiles = Array.from({ length: 50 }, (_, i) =>
      buildFileHistoryRow({
        fileId: `a1b2c3d4-e5f6-4a1b-8c2d-${String(i).padStart(12, '0')}`,
        fileName: `file-${i}.sdlxliff`,
      }),
    )
    render(
      <FileHistoryTable {...defaultProps} files={pageOfFiles} totalCount={500} currentPage={2} />,
    )

    const nav = screen.getByRole('navigation', { name: /pagination/i })
    expect(within(nav).getByText('1')).toBeTruthy()
    expect(within(nav).getByText('2')).toBeTruthy()
    expect(within(nav).getByText('3')).toBeTruthy()
    expect(within(nav).getByText('10')).toBeTruthy()
    // Only 1 ellipsis (trailing)
    const ellipses = within(nav).getAllByText('...')
    expect(ellipses.length).toBe(1)
  })

  it('[P2] should show leading ellipsis only when current page is near the end', () => {
    // 10 pages, currentPage = 9 → 1 ... 8 9 10 (no trailing ellipsis)
    const pageOfFiles = Array.from({ length: 50 }, (_, i) =>
      buildFileHistoryRow({
        fileId: `a1b2c3d4-e5f6-4a1b-8c2d-${String(i).padStart(12, '0')}`,
        fileName: `file-${i}.sdlxliff`,
      }),
    )
    render(
      <FileHistoryTable {...defaultProps} files={pageOfFiles} totalCount={500} currentPage={9} />,
    )

    const nav = screen.getByRole('navigation', { name: /pagination/i })
    expect(within(nav).getByText('1')).toBeTruthy()
    expect(within(nav).getByText('8')).toBeTruthy()
    expect(within(nav).getByText('9')).toBeTruthy()
    expect(within(nav).getByText('10')).toBeTruthy()
    // Only 1 ellipsis (leading)
    const ellipses = within(nav).getAllByText('...')
    expect(ellipses.length).toBe(1)
  })

  // ── Coverage: No pagination for single page ──

  it('[P3] should not render pagination when totalCount fits in one page', () => {
    render(<FileHistoryTable {...defaultProps} files={sampleRows} totalCount={3} />)

    expect(screen.queryByRole('navigation', { name: /pagination/i })).toBeNull()
  })
})
