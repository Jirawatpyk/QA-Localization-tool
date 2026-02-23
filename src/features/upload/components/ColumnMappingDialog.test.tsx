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
      expect(screen.getByText(/Column Mapping — test\.xlsx/)).not.toBeNull()
    })
  })

  it('should show loading skeleton while preview loads', () => {
    // Don't resolve yet — check loading state
    vi.mocked(previewExcelColumns).mockImplementation(() => new Promise(() => {}))
    render(<ColumnMappingDialog {...defaultProps} />)
    expect(screen.getByLabelText('Loading preview')).not.toBeNull()
  })

  it('should render preview table with column headers after loading', async () => {
    render(<ColumnMappingDialog {...defaultProps} />)
    await waitFor(() => {
      // Preview rows data should be visible in the table
      expect(screen.getByText('Hello')).not.toBeNull()
      expect(screen.getByText('สวัสดี')).not.toBeNull()
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
      expect(screen.getByText(/Only the first sheet will be parsed/)).not.toBeNull()
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
          // M4: optional columns must be undefined (not '__none__') when not set
          segmentIdColumn: undefined,
          contextColumn: undefined,
          languageColumn: undefined,
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

  it('should show error toast when preview load fails (H3)', async () => {
    const { toast } = await import('sonner')
    vi.mocked(previewExcelColumns).mockResolvedValue({
      success: false,
      code: 'STORAGE_ERROR',
      error: 'Download failed',
    })

    render(<ColumnMappingDialog {...defaultProps} />)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it('should keep Confirm & Parse disabled when auto-detected source and target are the same column (H4)', async () => {
    vi.mocked(previewExcelColumns).mockResolvedValue({
      success: true,
      data: {
        ...mockPreview,
        suggestedSourceColumn: 'Source',
        suggestedTargetColumn: 'Source', // same as source → canConfirm = false
      },
    })

    render(<ColumnMappingDialog {...defaultProps} />)
    await waitFor(() => {
      const confirmBtn = screen.getByRole('button', { name: 'Confirm & Parse' })
      expect(confirmBtn.hasAttribute('disabled')).toBe(true)
    })
  })

  it('should disable Confirm & Parse button while parsing is in progress (M7)', async () => {
    // parseFile never resolves — keeps isParsing=true
    vi.mocked(parseFile).mockImplementation(() => new Promise(() => {}))

    render(<ColumnMappingDialog {...defaultProps} />)
    await waitFor(() => screen.getByRole('button', { name: 'Confirm & Parse' }))

    await userEvent.click(screen.getByRole('button', { name: 'Confirm & Parse' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Parsing…' })).toBeDefined()
      expect(screen.getByRole('button', { name: 'Parsing…' }).hasAttribute('disabled')).toBe(true)
    })
  })

  it('should reset column selections when hasHeader is toggled (H6 / M8)', async () => {
    render(<ColumnMappingDialog {...defaultProps} />)
    // Wait for preview to load and auto-select columns
    await waitFor(() => {
      const sourceTrigger = screen.getByRole('combobox', { name: 'Source Column' })
      expect(sourceTrigger.textContent).toContain('Source')
    })

    // Toggle hasHeader off
    const checkbox = screen.getByRole('checkbox', { name: /First row is header/ })
    await userEvent.click(checkbox)

    // Source column should be reset (no longer shows 'Source')
    await waitFor(() => {
      const sourceTrigger = screen.getByRole('combobox', { name: 'Source Column' })
      expect(sourceTrigger.textContent).not.toContain('Source')
    })
  })

  it('should not call onCancel when Cancel is clicked while parsing (L1)', async () => {
    vi.mocked(parseFile).mockImplementation(() => new Promise(() => {}))
    const onCancel = vi.fn()

    render(<ColumnMappingDialog {...defaultProps} onCancel={onCancel} />)
    await waitFor(() => screen.getByRole('button', { name: 'Confirm & Parse' }))

    // Start parsing
    await userEvent.click(screen.getByRole('button', { name: 'Confirm & Parse' }))
    await waitFor(() => screen.getByRole('button', { name: 'Parsing…' }))

    // Cancel button should be disabled during parsing
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    expect(cancelBtn.hasAttribute('disabled')).toBe(true)
    // Clicking disabled button should not call onCancel
    await userEvent.click(cancelBtn)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('should not dismiss dialog on Escape key while parsing is in progress (M3)', async () => {
    vi.mocked(parseFile).mockImplementation(() => new Promise(() => {}))
    const onCancel = vi.fn()

    render(<ColumnMappingDialog {...defaultProps} onCancel={onCancel} />)
    await waitFor(() => screen.getByRole('button', { name: 'Confirm & Parse' }))

    // Start parsing
    await userEvent.click(screen.getByRole('button', { name: 'Confirm & Parse' }))
    await waitFor(() => screen.getByRole('button', { name: 'Parsing…' }))

    // Pressing Escape should NOT dismiss the dialog (onCancel not called)
    await userEvent.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('should show numeric column options when hasHeader is toggled to false (C2)', async () => {
    render(<ColumnMappingDialog {...defaultProps} />)
    // Wait for preview (4 columns: Source, Target, Segment ID, Notes)
    await waitFor(() => screen.getByRole('checkbox', { name: /First row is header/ }))

    // Toggle hasHeader off → column options switch from header names to numeric indices
    const checkbox = screen.getByRole('checkbox', { name: /First row is header/ })
    await userEvent.click(checkbox)

    // Source Column trigger should no longer display header name text
    const sourceTrigger = screen.getByRole('combobox', { name: 'Source Column' })
    expect(sourceTrigger.textContent).not.toContain('Source')

    // Confirm & Parse is disabled because selections were reset (no numeric column chosen)
    const confirmBtn = screen.getByRole('button', { name: 'Confirm & Parse' })
    expect(confirmBtn.hasAttribute('disabled')).toBe(true)
  })
})
