// ----- module mocks must come before imports -----
const mockStartUpload = vi.fn()
const mockConfirmRerun = vi.fn()
const mockCancelDuplicate = vi.fn()

vi.mock('../hooks/useFileUpload', () => ({
  useFileUpload: vi.fn(() => ({
    progress: [],
    largeFileWarnings: [],
    isUploading: false,
    pendingDuplicate: null,
    uploadedFiles: [],
    startUpload: mockStartUpload,
    confirmRerun: mockConfirmRerun,
    cancelDuplicate: mockCancelDuplicate,
    reset: vi.fn(),
  })),
}))

// Mock ColumnMappingDialog to avoid loading server action dependencies
vi.mock('./ColumnMappingDialog', () => ({
  ColumnMappingDialog: ({
    open,
    fileName,
    onSuccess,
    onCancel,
  }: {
    open: boolean
    fileName: string
    onSuccess: (n: number) => void
    onCancel: () => void
  }) =>
    open ? (
      <div data-testid="column-mapping-dialog">
        <span>{fileName}</span>
        <button onClick={() => onSuccess(5)}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}))

const mockCreateBatch = vi.fn()
vi.mock('../actions/createBatch.action', () => ({
  createBatch: (...args: unknown[]) => mockCreateBatch(...args),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

// Mock parseFile action for auto-parse tests
const mockParseFile = vi.fn()
vi.mock('@/features/parser/actions/parseFile.action', () => ({
  parseFile: (...args: unknown[]) => mockParseFile(...args),
}))

// Mock ProcessingModeDialog to avoid loading server action dependencies
vi.mock('@/features/pipeline/components/ProcessingModeDialog', () => ({
  ProcessingModeDialog: ({
    open,
    fileIds,
    projectId,
    onOpenChange,
    onStartProcessing,
  }: {
    open: boolean
    fileIds: string[]
    projectId: string
    onOpenChange: (open: boolean) => void
    onStartProcessing?: () => void
  }) =>
    open ? (
      <div data-testid="processing-mode-dialog">
        <span data-testid="dialog-file-count">{fileIds.length} files</span>
        <span data-testid="dialog-project-id">{projectId}</span>
        <button onClick={() => onOpenChange(false)}>Close</button>
        <button onClick={() => onStartProcessing?.()}>Start</button>
      </div>
    ) : null,
}))

// ----- imports after mocks -----
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFileUpload } from '../hooks/useFileUpload'
import type { UploadFileResult } from '../types'

import { UploadPageClient } from './UploadPageClient'

const VALID_PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const DEFAULT_FILE_ID = 'f1e2d3c4-b5a6-4f7e-8d9c-0a1b2c3d4e5f'

function makeFile(name: string): File {
  return new File(['content'], name, { type: 'application/xml' })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStartUpload.mockResolvedValue(undefined)
  mockParseFile.mockResolvedValue({ success: true, data: { segmentCount: 42, fileId: 'any' } })
  mockCreateBatch.mockResolvedValue({
    success: true,
    data: {
      id: 'batch-id',
      projectId: VALID_PROJECT_ID,
      tenantId: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
      fileCount: 2,
      createdAt: '',
    },
  })
})

function makeUploadedFile(overrides: Partial<UploadFileResult> = {}): UploadFileResult {
  return {
    fileId: DEFAULT_FILE_ID,
    fileName: 'report.sdlxliff',
    fileSizeBytes: 2048,
    fileType: 'sdlxliff',
    fileHash: 'hash-123',
    storagePath: 'path/report.sdlxliff',
    status: 'uploaded',
    batchId: null,
    ...overrides,
  }
}

describe('UploadPageClient', () => {
  it('should call startUpload without batchId when a single file is selected', async () => {
    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    // Simulate file selection via the hidden input
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, [makeFile('report.sdlxliff')])

    await waitFor(() => {
      expect(mockCreateBatch).not.toHaveBeenCalled()
      expect(mockStartUpload).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'report.sdlxliff' }),
      ])
    })
  })

  it('should create a batch then call startUpload with batchId when multiple files selected', async () => {
    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, [makeFile('a.sdlxliff'), makeFile('b.sdlxliff')])

    await waitFor(() => {
      expect(mockCreateBatch).toHaveBeenCalledWith({ projectId: VALID_PROJECT_ID, fileCount: 2 })
      expect(mockStartUpload).toHaveBeenCalledWith(
        [
          expect.objectContaining({ name: 'a.sdlxliff' }),
          expect.objectContaining({ name: 'b.sdlxliff' }),
        ],
        'batch-id',
      )
    })
  })

  it('should show toast error and not call startUpload when createBatch fails', async () => {
    mockCreateBatch.mockResolvedValue({ success: false, code: 'CREATE_FAILED', error: 'DB error' })
    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, [makeFile('a.sdlxliff'), makeFile('b.sdlxliff')])

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
      expect(mockStartUpload).not.toHaveBeenCalled()
    })
  })

  it('should render DuplicateDetectionDialog when pendingDuplicate is set', () => {
    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: {
        file: makeFile('report.sdlxliff'),
        fileId: 'file-id',
        duplicateInfo: {
          isDuplicate: true,
          originalUploadDate: '2025-01-01T00:00:00.000Z',
          existingScore: 85,
          existingFileId: 'existing-id',
        },
      },
      uploadedFiles: [],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('should show ColumnMappingDialog when an xlsx file upload completes (6.1)', async () => {
    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [
        {
          fileId: 'xlsx-file-id',
          fileName: 'data.xlsx',
          fileSizeBytes: 1024,
          fileType: 'xlsx',
          fileHash: 'hash',
          storagePath: 'path/data.xlsx',
          status: 'uploaded',
          batchId: null,
        },
      ],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)
    await waitFor(() => {
      expect(screen.getByTestId('column-mapping-dialog')).toBeInTheDocument()
      expect(screen.getByText('data.xlsx')).toBeInTheDocument()
    })
  })

  it('should dismiss ColumnMappingDialog and show toast.success after Confirm (H5 + M6)', async () => {
    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [
        {
          fileId: 'xlsx-file-id',
          fileName: 'data.xlsx',
          fileSizeBytes: 1024,
          fileType: 'xlsx',
          fileHash: 'hash',
          storagePath: 'path/data.xlsx',
          status: 'uploaded',
          batchId: null,
        },
      ],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    const { toast } = await import('sonner')
    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    // Dialog is visible
    expect(screen.getByTestId('column-mapping-dialog')).toBeInTheDocument()

    // Click Confirm (mock returns segmentCount=5)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      // Dialog should be dismissed
      expect(screen.queryByTestId('column-mapping-dialog')).toBeNull()
      // toast.success called with segment count
      expect(toast.success).toHaveBeenCalledWith('Parsed 5 segments successfully.')
    })
  })

  it('should dismiss ColumnMappingDialog after Cancel without toast (H5)', async () => {
    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [
        {
          fileId: 'xlsx-file-id',
          fileName: 'data.xlsx',
          fileSizeBytes: 1024,
          fileType: 'xlsx',
          fileHash: 'hash',
          storagePath: 'path/data.xlsx',
          status: 'uploaded',
          batchId: null,
        },
      ],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    const { toast } = await import('sonner')
    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    expect(screen.getByTestId('column-mapping-dialog')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByTestId('column-mapping-dialog')).toBeNull()
      expect(toast.success).not.toHaveBeenCalled()
    })
  })

  it('should NOT show ColumnMappingDialog for XLIFF/SDLXLIFF files (6.2)', async () => {
    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [
        {
          fileId: 'xliff-file-id',
          fileName: 'report.sdlxliff',
          fileSizeBytes: 2048,
          fileType: 'sdlxliff',
          fileHash: 'hash',
          storagePath: 'path/report.sdlxliff',
          status: 'uploaded',
          batchId: null,
        },
      ],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)
    await waitFor(() => {
      expect(screen.queryByTestId('column-mapping-dialog')).toBeNull()
    })
  })

  // =========================================================================
  // Story 3.2b5 — Upload-Pipeline Wiring (18 test stubs, ATDD RED phase)
  // =========================================================================

  // --- AC1: Auto-Parse Tests (6 tests) ---

  it('should call parseFile automatically when SDLXLIFF file upload completes', async () => {
    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [
        makeUploadedFile({
          fileId: 'sdlxliff-id',
          fileName: 'report.sdlxliff',
          fileType: 'sdlxliff',
        }),
      ],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    await waitFor(() => {
      expect(mockParseFile).toHaveBeenCalledWith('sdlxliff-id')
    })
  })

  it('should call parseFile automatically when XLIFF file upload completes', async () => {
    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [
        makeUploadedFile({ fileId: 'xliff-id', fileName: 'doc.xliff', fileType: 'xliff' }),
      ],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    await waitFor(() => {
      expect(mockParseFile).toHaveBeenCalledWith('xliff-id')
    })
  })

  it('should NOT call parseFile for Excel file (uses ColumnMappingDialog instead)', async () => {
    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [
        makeUploadedFile({ fileId: 'xlsx-id', fileName: 'data.xlsx', fileType: 'xlsx' }),
      ],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    // Wait a tick to ensure useEffect had a chance to run
    await waitFor(() => {
      expect(mockParseFile).not.toHaveBeenCalled()
    })
  })

  it('should NOT re-trigger parseFile for a file that was already parsed', async () => {
    const mockReturn = {
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [
        makeUploadedFile({
          fileId: 'parsed-id',
          fileName: 'report.sdlxliff',
          fileType: 'sdlxliff',
        }),
      ],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    }
    vi.mocked(useFileUpload).mockReturnValue(mockReturn)

    const { rerender } = render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    await waitFor(() => {
      expect(mockParseFile).toHaveBeenCalledTimes(1)
    })

    mockParseFile.mockClear()
    // Re-render with same uploadedFiles
    rerender(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    // Should NOT call parseFile again
    await waitFor(() => {
      expect(mockParseFile).not.toHaveBeenCalled()
    })
  })

  it('should show success toast with segment count after parse completes', async () => {
    mockParseFile.mockResolvedValue({
      success: true,
      data: { segmentCount: 127, fileId: 'sdlxliff-id' },
    })

    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [makeUploadedFile({ fileId: 'sdlxliff-id', fileName: 'report.sdlxliff' })],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('127'))
    })
  })

  it('should show error toast when parseFile fails (no crash)', async () => {
    mockParseFile.mockResolvedValue({ success: false, error: 'Invalid XML structure' })

    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [makeUploadedFile({ fileId: 'bad-file-id', fileName: 'broken.sdlxliff' })],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('broken.sdlxliff'))
    })
  })

  // --- AC2: ProcessingModeDialog Tests (6 tests) ---

  it('should show "Start Processing" button after file is parsed', async () => {
    mockParseFile.mockResolvedValue({
      success: true,
      data: { segmentCount: 42, fileId: 'sdlxliff-id' },
    })

    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [makeUploadedFile({ fileId: 'sdlxliff-id', fileName: 'report.sdlxliff' })],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start processing/i })).toBeInTheDocument()
    })
  })

  it('should NOT show "Start Processing" button when no files are parsed', () => {
    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    expect(screen.queryByRole('button', { name: /start processing/i })).toBeNull()
  })

  it('should disable "Start Processing" button while uploading', async () => {
    mockParseFile.mockResolvedValue({
      success: true,
      data: { segmentCount: 42, fileId: 'sdlxliff-id' },
    })

    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: true, // still uploading
      pendingDuplicate: null,
      uploadedFiles: [makeUploadedFile({ fileId: 'sdlxliff-id', fileName: 'report.sdlxliff' })],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start processing/i })).toBeDisabled()
    })
  })

  it('should open ProcessingModeDialog with correct fileIds when button clicked', async () => {
    mockParseFile.mockResolvedValue({
      success: true,
      data: { segmentCount: 42, fileId: 'sdlxliff-id' },
    })

    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [makeUploadedFile({ fileId: 'sdlxliff-id', fileName: 'report.sdlxliff' })],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start processing/i })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /start processing/i }))

    await waitFor(() => {
      expect(screen.getByTestId('processing-mode-dialog')).toBeInTheDocument()
      expect(screen.getByTestId('dialog-file-count').textContent).toContain('1 files')
      expect(screen.getByTestId('dialog-project-id').textContent).toContain(VALID_PROJECT_ID)
    })
  })

  it('should close dialog and reset state after processing starts', async () => {
    mockParseFile.mockResolvedValue({
      success: true,
      data: { segmentCount: 42, fileId: 'sdlxliff-id' },
    })

    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [makeUploadedFile({ fileId: 'sdlxliff-id', fileName: 'report.sdlxliff' })],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    // Wait for parse + button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start processing/i })).toBeInTheDocument()
    })

    // Open dialog
    await userEvent.click(screen.getByRole('button', { name: /start processing/i }))

    await waitFor(() => {
      expect(screen.getByTestId('processing-mode-dialog')).toBeInTheDocument()
    })

    // Click Start in the dialog mock
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      // Dialog closes after onStartProcessing callback
      // NOTE: toast.success is shown by ProcessingModeDialog internally (tested in ProcessingModeDialog.test.tsx)
      expect(screen.queryByTestId('processing-mode-dialog')).toBeNull()
    })
  })

  it('should count Excel file in parsedFiles after ColumnMappingDialog confirms', async () => {
    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [
        makeUploadedFile({ fileId: 'xlsx-id', fileName: 'data.xlsx', fileType: 'xlsx' }),
      ],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    // ColumnMappingDialog should be shown for Excel
    await waitFor(() => {
      expect(screen.getByTestId('column-mapping-dialog')).toBeInTheDocument()
    })

    // Confirm mapping (mock returns segmentCount=5)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    // After confirm, "Start Processing" button should appear (Excel now in parsedFiles)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start processing/i })).toBeInTheDocument()
    })
  })

  // --- AC3: Upload Progress Parse Status Tests (3 tests) ---

  it('should show "Parsing..." status while parse is in progress', async () => {
    // Make parseFile hang (never resolve)
    mockParseFile.mockReturnValue(new Promise(() => {}))

    vi.mocked(useFileUpload).mockReturnValue({
      progress: [
        {
          fileId: 'sdlxliff-id',
          fileName: 'report.sdlxliff',
          fileSizeBytes: 2048,
          bytesUploaded: 2048,
          percent: 100,
          etaSeconds: null,
          status: 'uploaded' as const,
          error: null,
        },
      ],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [makeUploadedFile({ fileId: 'sdlxliff-id', fileName: 'report.sdlxliff' })],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    await waitFor(() => {
      expect(screen.getByText(/parsing/i)).toBeInTheDocument()
    })
  })

  it('should show "Parsed (N segments)" after parse completes', async () => {
    mockParseFile.mockResolvedValue({
      success: true,
      data: { segmentCount: 42, fileId: 'sdlxliff-id' },
    })

    vi.mocked(useFileUpload).mockReturnValue({
      progress: [
        {
          fileId: 'sdlxliff-id',
          fileName: 'report.sdlxliff',
          fileSizeBytes: 2048,
          bytesUploaded: 2048,
          percent: 100,
          etaSeconds: null,
          status: 'uploaded' as const,
          error: null,
        },
      ],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [makeUploadedFile({ fileId: 'sdlxliff-id', fileName: 'report.sdlxliff' })],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    await waitFor(() => {
      expect(screen.getByText('Parsed (42 segments)')).toBeInTheDocument()
    })
  })

  it('should show "Parse failed" when parse fails', async () => {
    mockParseFile.mockResolvedValue({ success: false, error: 'Invalid XML' })

    vi.mocked(useFileUpload).mockReturnValue({
      progress: [
        {
          fileId: 'bad-id',
          fileName: 'broken.sdlxliff',
          fileSizeBytes: 2048,
          bytesUploaded: 2048,
          percent: 100,
          etaSeconds: null,
          status: 'uploaded' as const,
          error: null,
        },
      ],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [makeUploadedFile({ fileId: 'bad-id', fileName: 'broken.sdlxliff' })],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    await waitFor(() => {
      expect(screen.getByText(/parse failed/i)).toBeInTheDocument()
    })
  })

  // --- AC4: Boundary Tests (3 tests) ---

  it('should auto-parse SDLXLIFF and show ColumnMappingDialog for Excel in mixed upload', async () => {
    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [
        makeUploadedFile({
          fileId: 'sdlxliff-id',
          fileName: 'report.sdlxliff',
          fileType: 'sdlxliff',
        }),
        makeUploadedFile({ fileId: 'xlsx-id', fileName: 'data.xlsx', fileType: 'xlsx' }),
      ],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    await waitFor(() => {
      // SDLXLIFF should auto-parse
      expect(mockParseFile).toHaveBeenCalledWith('sdlxliff-id')
      // Excel should show ColumnMappingDialog (not auto-parse)
      expect(mockParseFile).not.toHaveBeenCalledWith('xlsx-id')
      expect(screen.getByTestId('column-mapping-dialog')).toBeInTheDocument()
    })
  })

  it('should parse multiple SDLXLIFF files sequentially', async () => {
    let resolveFirst: (v: unknown) => void
    const firstPromise = new Promise((r) => {
      resolveFirst = r
    })
    mockParseFile
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce({ success: true, data: { segmentCount: 20, fileId: 'file-2' } })

    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [
        makeUploadedFile({ fileId: 'file-1', fileName: 'first.sdlxliff' }),
        makeUploadedFile({ fileId: 'file-2', fileName: 'second.sdlxliff' }),
      ],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    // First file should start parsing
    await waitFor(() => {
      expect(mockParseFile).toHaveBeenCalledWith('file-1')
    })
    // Sequential guard: file-2 must NOT have started while file-1 is still parsing (CR R2 H1)
    expect(mockParseFile).not.toHaveBeenCalledWith('file-2')

    // Resolve first parse
    resolveFirst!({ success: true, data: { segmentCount: 10, fileId: 'file-1' } })

    // Second file should then parse
    await waitFor(() => {
      expect(mockParseFile).toHaveBeenCalledWith('file-2')
      expect(mockParseFile).toHaveBeenCalledTimes(2)
    })
  })

  it('should not render "Start Processing" button when zero files are parsed', async () => {
    // Set never-resolving mock BEFORE configuring uploadedFiles to avoid act() warning (CR R1 L1)
    mockParseFile.mockReturnValue(new Promise(() => {}))

    vi.mocked(useFileUpload).mockReturnValue({
      progress: [],
      largeFileWarnings: [],
      isUploading: false,
      pendingDuplicate: null,
      uploadedFiles: [makeUploadedFile({ fileId: 'sdlxliff-id', fileName: 'report.sdlxliff' })],
      startUpload: mockStartUpload,
      confirmRerun: mockConfirmRerun,
      cancelDuplicate: mockCancelDuplicate,
      reset: vi.fn(),
    })

    render(<UploadPageClient projectId={VALID_PROJECT_ID} />)

    // Flush microtask queue so useEffect setState settles before assertion
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /start processing/i })).toBeNull()
    })
  })
})
