/// <reference types="vitest/globals" />
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildFile, buildScoreRecord } from '@/test/factories'

import { FileHistoryTable } from './FileHistoryTable'

// Mock ScoreBadge to isolate
vi.mock('./ScoreBadge', () => ({
  ScoreBadge: vi.fn(({ score }: { score: number | null }) => (
    <span data-testid="mock-score-badge">{score !== null ? score.toFixed(1) : 'N/A'}</span>
  )),
}))

// Type for file history row (component not yet created)
type FileHistoryRow = {
  fileId: string
  fileName: string
  processedAt: string // ISO 8601
  status: 'auto_passed' | 'needs_review' | 'failed'
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
    status: 'auto_passed',
    mqmScore: score.mqmScore,
    reviewerName: null,
    ...overrides,
  }
}

const sampleRows: FileHistoryRow[] = [
  buildFileHistoryRow({
    fileId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
    fileName: 'intro.sdlxliff',
    status: 'auto_passed',
    mqmScore: 97.5,
    reviewerName: null,
  }),
  buildFileHistoryRow({
    fileId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
    fileName: 'chapter1.xlf',
    status: 'needs_review',
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
    activeFilter: 'all' as FileHistoryFilter,
    onFilterChange: vi.fn(),
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
    expect(within(rows[1]!).getByText(/Passed/i)).toBeTruthy()

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
    render(<FileHistoryTable {...defaultProps} files={[]} />)

    expect(screen.getByText(/No files/i)).toBeTruthy()
    // Should NOT render table rows (only a message)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('[P3] should render pagination controls when files exceed PAGE_SIZE', () => {
    // EXPECTED: When file count exceeds PAGE_SIZE (e.g., 20), pagination appears
    const manyFiles = Array.from({ length: 25 }, (_, i) =>
      buildFileHistoryRow({
        fileId: `a1b2c3d4-e5f6-4a1b-8c2d-${String(i).padStart(12, '0')}`,
        fileName: `file-${i}.sdlxliff`,
      }),
    )
    render(<FileHistoryTable {...defaultProps} files={manyFiles} />)

    // Pagination controls should be visible
    const nav = screen.getByRole('navigation', { name: /pagination/i })
    expect(nav).toBeTruthy()
    // Should show page indicators within pagination nav
    expect(within(nav).getByText('1')).toBeTruthy()
    expect(within(nav).getByText('2')).toBeTruthy()
  })
})
