import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock server actions (they import 'server-only')
vi.mock('@/features/parser/actions/previewExcelColumns.action', () => ({
  previewExcelColumns: vi.fn(),
}))
vi.mock('@/features/parser/actions/parseFile.action', () => ({
  parseFile: vi.fn(),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

import { parseFile } from '@/features/parser/actions/parseFile.action'
import { previewExcelColumns } from '@/features/parser/actions/previewExcelColumns.action'

import { ColumnMappingDialog } from './ColumnMappingDialog'

const mockPreview = {
  headers: ['Source', 'Target', 'Segment ID', 'Notes'],
  previewRows: [
    ['Hello', 'สวัสดี', 'TU-001', 'Greeting'],
    ['Goodbye', 'ลาก่อน', 'TU-002', 'Farewell'],
  ],
  suggestedSourceColumn: 'Source',
  suggestedTargetColumn: 'Target',
  totalRows: 10,
  columnCount: 4,
}

const defaultProps = {
  open: true,
  fileId: 'c3d4e5f6-a1b2-4c1d-ae3f-5a6b7c8d9e0f',
  fileName: 'test.xlsx',
  onSuccess: vi.fn(),
  onCancel: vi.fn(),
}

describe('ColumnMappingDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(previewExcelColumns).mockResolvedValue({
      success: true,
      data: mockPreview,
    })
    vi.mocked(parseFile).mockResolvedValue({
      success: true,
      data: { segmentCount: 10, fileId: defaultProps.fileId },
    })
  })

  it('should render dialog with file name in title', async () => {
    render(<ColumnMappingDialog {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText(/Column Mapping — test\.xlsx/)).toBeTruthy()
    })
  })

  it('should show loading skeleton while preview loads', () => {
    // Don't resolve yet — check loading state
    vi.mocked(previewExcelColumns).mockImplementation(() => new Promise(() => {}))
    render(<ColumnMappingDialog {...defaultProps} />)
    expect(screen.getByLabelText('Loading preview')).toBeTruthy()
  })

  it('should render preview table with column headers after loading', async () => {
    render(<ColumnMappingDialog {...defaultProps} />)
    await waitFor(() => {
      // Preview rows data should be visible in the table
      expect(screen.getByText('Hello')).toBeTruthy()
      expect(screen.getByText('สวัสดี')).toBeTruthy()
    })
  })

  it('should pre-select auto-detected source column', async () => {
    render(<ColumnMappingDialog {...defaultProps} />)
    await waitFor(() => {
      // Source select should show auto-detected value
      const sourceTrigger = screen.getByRole('combobox', { name: 'Source Column' })
      expect(sourceTrigger.textContent).toContain('Source')
    })
  })

  it('should show "✓ auto" badge next to auto-detected columns (O2)', async () => {
    render(<ColumnMappingDialog {...defaultProps} />)
    await waitFor(() => {
      const autoBadges = screen.getAllByText('✓ auto')
      expect(autoBadges.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('should show "Only the first sheet will be parsed" info text (E2)', async () => {
    render(<ColumnMappingDialog {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText(/Only the first sheet will be parsed/)).toBeTruthy()
    })
  })

  it('should call onCancel when Cancel button clicked', async () => {
    render(<ColumnMappingDialog {...defaultProps} />)
    await waitFor(() => screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(defaultProps.onCancel).toHaveBeenCalledOnce()
  })

  it('should call parseFile and onSuccess when Confirm & Parse clicked', async () => {
    render(<ColumnMappingDialog {...defaultProps} />)
    await waitFor(() => screen.getByRole('button', { name: 'Confirm & Parse' }))

    await userEvent.click(screen.getByRole('button', { name: 'Confirm & Parse' }))

    await waitFor(() => {
      expect(parseFile).toHaveBeenCalledWith(
        defaultProps.fileId,
        expect.objectContaining({
          sourceColumn: 'Source',
          targetColumn: 'Target',
          hasHeader: true,
        }),
      )
      expect(defaultProps.onSuccess).toHaveBeenCalledWith(10)
    })
  })

  it('should show error toast when parse fails', async () => {
    const { toast } = await import('sonner')
    vi.mocked(parseFile).mockResolvedValue({
      success: false,
      code: 'PARSE_ERROR',
      error: 'Invalid Excel file',
    })

    render(<ColumnMappingDialog {...defaultProps} />)
    await waitFor(() => screen.getByRole('button', { name: 'Confirm & Parse' }))

    await userEvent.click(screen.getByRole('button', { name: 'Confirm & Parse' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it('should not render when closed', () => {
    const { container } = render(<ColumnMappingDialog {...defaultProps} open={false} />)
    expect(container.textContent).not.toContain('Column Mapping')
  })
})
