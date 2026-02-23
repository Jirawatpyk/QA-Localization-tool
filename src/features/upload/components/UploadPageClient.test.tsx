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

// ----- imports after mocks -----
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFileUpload } from '../hooks/useFileUpload'

import { UploadPageClient } from './UploadPageClient'

const VALID_PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

function makeFile(name: string): File {
  return new File(['content'], name, { type: 'application/xml' })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStartUpload.mockResolvedValue(undefined)
  mockCreateBatch.mockResolvedValue({
    success: true,
    data: {
      id: 'batch-id',
      projectId: VALID_PROJECT_ID,
      tenantId: 'tenant-id',
      fileCount: 2,
      createdAt: '',
    },
  })
})

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
    expect(screen.getByRole('dialog')).not.toBeNull()
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
      expect(screen.getByTestId('column-mapping-dialog')).toBeTruthy()
      expect(screen.getByText('data.xlsx')).toBeTruthy()
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
    expect(screen.getByTestId('column-mapping-dialog')).toBeTruthy()

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

    expect(screen.getByTestId('column-mapping-dialog')).toBeTruthy()

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
})
