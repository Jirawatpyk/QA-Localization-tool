import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ----- module mocks must come before imports -----
vi.mock('@/lib/constants', () => ({
  MAX_FILE_SIZE_BYTES: 15 * 1024 * 1024,
  DEFAULT_BATCH_SIZE: 50,
}))

// Short retry delays (1/2/4ms) so the retry test completes quickly without fake timers
vi.mock('../constants', () => ({
  LARGE_FILE_WARNING_BYTES: 10 * 1024 * 1024,
  UPLOAD_RETRY_COUNT: 3,
  UPLOAD_RETRY_BACKOFF_MS: [1, 2, 4],
}))

const mockCheckDuplicate = vi.fn()
vi.mock('../actions/checkDuplicate.action', () => ({
  checkDuplicate: (...args: unknown[]) => mockCheckDuplicate(...args),
}))

const mockCreateBatch = vi.fn()
vi.mock('../actions/createBatch.action', () => ({
  createBatch: (...args: unknown[]) => mockCreateBatch(...args),
}))

// Mock XMLHttpRequest — base class; subclasses override send() to auto-fire events
let xhrInstances: MockXHR[] = []

class MockXHR {
  upload = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  addEventListener = vi.fn()
  open = vi.fn()
  send = vi.fn()
  responseText = ''
  status = 0

  constructor() {
    xhrInstances.push(this)
  }
}

// ----- imports after mocks -----
import { useFileUpload } from './useFileUpload'

const VALID_PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

function makeFile(name: string, size = 1024): File {
  const file = new File(['x'.repeat(Math.min(size, 10))], name, { type: 'application/xml' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

/**
 * Auto-resolving XHR mock: fires 'load' after a microtask when send() is called.
 */
function setupXhrMock(responseBody: unknown, status = 200) {
  xhrInstances = []

  class AutoXHR extends MockXHR {
    override status = status
    override responseText = JSON.stringify(responseBody)

    override send = vi.fn().mockImplementation(function (this: AutoXHR) {
      void Promise.resolve().then(() => {
        const loadHandler = (this.addEventListener.mock.calls as [string, () => void][]).find(
          ([event]) => event === 'load',
        )?.[1]
        if (loadHandler) loadHandler()
      })
    })
  }

  Object.defineProperty(global, 'XMLHttpRequest', {
    writable: true,
    configurable: true,
    value: AutoXHR,
  })
}

/**
 * Auto-erroring XHR mock: fires 'error' (status=0) after a microtask when send() is called.
 * Used to test the retry/backoff logic.
 */
function setupXhrErrorMock() {
  xhrInstances = []

  class ErrorXHR extends MockXHR {
    override status = 0
    override responseText = ''

    override send = vi.fn().mockImplementation(function (this: ErrorXHR) {
      void Promise.resolve().then(() => {
        const errorHandler = (this.addEventListener.mock.calls as [string, () => void][]).find(
          ([event]) => event === 'error',
        )?.[1]
        if (errorHandler) errorHandler()
      })
    })
  }

  Object.defineProperty(global, 'XMLHttpRequest', {
    writable: true,
    configurable: true,
    value: ErrorXHR,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  xhrInstances = []

  mockCheckDuplicate.mockResolvedValue({ success: true, data: { isDuplicate: false } })
  mockCreateBatch.mockResolvedValue({
    success: true,
    data: {
      id: 'batch-id',
      projectId: VALID_PROJECT_ID,
      tenantId: 'tenant-id',
      fileCount: 1,
      createdAt: '2025-06-01T10:00:00.000Z',
    },
  })

  // mock crypto.randomUUID and crypto.subtle
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn().mockReturnValue('mock-uuid'),
    subtle: {
      digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
    },
  })
})

describe('useFileUpload', () => {
  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    expect(result.current.progress).toHaveLength(0)
    expect(result.current.isUploading).toBe(false)
    expect(result.current.pendingDuplicate).toBeNull()
    expect(result.current.uploadedFiles).toHaveLength(0)
  })

  it('should reject unsupported file format immediately', async () => {
    setupXhrMock({ success: true, data: { files: [] } })
    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    await act(async () => {
      await result.current.startUpload([makeFile('document.pdf')])
    })

    expect(result.current.progress[0]?.status).toBe('error')
    expect(result.current.progress[0]?.error).toBe('UNSUPPORTED_FORMAT')
  })

  it('should reject file exceeding MAX_FILE_SIZE_BYTES', async () => {
    setupXhrMock({ success: true, data: { files: [] } })
    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    await act(async () => {
      await result.current.startUpload([makeFile('large.sdlxliff', 16 * 1024 * 1024)])
    })

    expect(result.current.progress[0]?.status).toBe('error')
    expect(result.current.progress[0]?.error).toBe('FILE_SIZE_EXCEEDED')
  })

  it('should mark file as large warning between 10-15MB', async () => {
    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    // Fire-and-forget: largeFileWarnings is set synchronously before first await in processFiles
    act(() => {
      void result.current.startUpload([makeFile('medium.sdlxliff', 11 * 1024 * 1024)])
    })

    await waitFor(() => {
      expect(result.current.largeFileWarnings).toContain('medium.sdlxliff')
    })
  })

  it('should accept a file exactly at 10MB boundary without large-file warning', async () => {
    setupXhrMock({ success: true, data: { files: [] } })
    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    act(() => {
      void result.current.startUpload([makeFile('exact.sdlxliff', 10 * 1024 * 1024)])
    })

    await waitFor(() => {
      expect(result.current.largeFileWarnings).toHaveLength(0)
    })
  })

  it('should set pendingDuplicate when duplicate detected', async () => {
    mockCheckDuplicate.mockResolvedValue({
      success: true,
      data: {
        isDuplicate: true,
        existingFileId: 'existing-id',
        originalUploadDate: '2025-01-01T00:00:00.000Z',
        existingScore: 85.0,
      },
    })

    setupXhrMock({ success: true, data: { files: [] } })
    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    await act(async () => {
      await result.current.startUpload([makeFile('report.sdlxliff')])
    })

    await waitFor(() => {
      expect(result.current.pendingDuplicate).not.toBeNull()
    })
    expect(result.current.pendingDuplicate?.duplicateInfo.isDuplicate).toBe(true)
  })

  it('should check duplicate for each file in batch — detect 2nd file as duplicate', async () => {
    // File 1: not duplicate (uploads), File 2: duplicate (pauses queue)
    mockCheckDuplicate
      .mockResolvedValueOnce({ success: true, data: { isDuplicate: false } })
      .mockResolvedValueOnce({
        success: true,
        data: {
          isDuplicate: true,
          existingFileId: 'existing-id',
          originalUploadDate: '2025-01-01T00:00:00.000Z',
          existingScore: null,
        },
      })

    setupXhrMock({
      success: true,
      data: {
        files: [
          {
            fileId: 'file-1',
            fileName: 'report1.sdlxliff',
            fileSizeBytes: 1024,
            fileType: 'sdlxliff',
            fileHash: 'a'.repeat(64),
            storagePath: 'path/1',
            status: 'uploaded',
            batchId: null,
          },
        ],
      },
    })

    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    act(() => {
      void result.current.startUpload([makeFile('report1.sdlxliff'), makeFile('report2.sdlxliff')])
    })

    await waitFor(() => {
      expect(result.current.pendingDuplicate).not.toBeNull()
    })
    expect(result.current.pendingDuplicate?.file.name).toBe('report2.sdlxliff')
    expect(mockCheckDuplicate).toHaveBeenCalledTimes(2)
  })

  it('should set BATCH_SIZE_EXCEEDED error for all files when > 50 files provided', async () => {
    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))
    const files = Array.from({ length: 51 }, (_, i) => makeFile(`file-${i}.sdlxliff`))

    await act(async () => {
      await result.current.startUpload(files)
    })

    expect(result.current.progress).toHaveLength(51)
    expect(result.current.progress.every((f) => f.error === 'BATCH_SIZE_EXCEEDED')).toBe(true)
    expect(result.current.isUploading).toBe(false)
  })

  it('should include batchId in XHR FormData when provided', async () => {
    setupXhrMock({ success: true, data: { files: [] } })
    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    const appendSpy = vi.spyOn(FormData.prototype, 'append')

    act(() => {
      void result.current.startUpload([makeFile('report.sdlxliff')], 'test-batch-id')
    })

    await waitFor(() => {
      expect(appendSpy).toHaveBeenCalledWith('batchId', 'test-batch-id')
    })
  })

  it('should set NETWORK_ERROR status after exhausting all retries', async () => {
    // UPLOAD_RETRY_BACKOFF_MS: [1, 2, 4] (mocked short delays)
    // UPLOAD_RETRY_COUNT: 3 → 1 original + 3 retries = 4 total XHR calls
    setupXhrErrorMock()
    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    act(() => {
      void result.current.startUpload([makeFile('report.sdlxliff')])
    })

    await waitFor(
      () => {
        expect(result.current.progress[0]?.status).toBe('error')
        expect(result.current.progress[0]?.error).toBe('NETWORK_ERROR')
      },
      { timeout: 5000 },
    )

    // 1 original + 3 retries (retryCount 0→1→2→3, stops when 3 < 3 is false)
    expect(xhrInstances.length).toBe(4)
  })

  it('should complete confirmRerun and mark file as uploaded', async () => {
    mockCheckDuplicate.mockResolvedValueOnce({
      success: true,
      data: {
        isDuplicate: true,
        existingFileId: 'existing-id',
        originalUploadDate: '2025-01-01T00:00:00.000Z',
        existingScore: null,
      },
    })

    const fileResult = {
      fileId: 'file-1',
      fileName: 'report.sdlxliff',
      fileSizeBytes: 1024,
      fileType: 'sdlxliff',
      fileHash: 'a'.repeat(64),
      storagePath: 'path/1',
      status: 'uploaded',
      batchId: null,
    }
    setupXhrMock({ success: true, data: { files: [fileResult] } })

    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    await act(async () => {
      await result.current.startUpload([makeFile('report.sdlxliff')])
    })
    expect(result.current.pendingDuplicate).not.toBeNull()

    // Confirm re-run — XHR auto-resolves via microtask
    act(() => {
      result.current.confirmRerun()
    })

    await waitFor(
      () => {
        expect(result.current.uploadedFiles.length).toBeGreaterThan(0)
        expect(result.current.pendingDuplicate).toBeNull()
      },
      { timeout: 5000 },
    )
  })

  it('should reset state when reset() is called', async () => {
    setupXhrMock({ success: true, data: { files: [] } })
    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    // add some progress state
    await act(async () => {
      await result.current.startUpload([makeFile('document.pdf')]) // unsupported
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.progress).toHaveLength(0)
    expect(result.current.isUploading).toBe(false)
    expect(result.current.largeFileWarnings).toHaveLength(0)
  })

  // H5: confirmRerun resumes processing of remaining queued files
  it('should process remaining queued files after confirmRerun', async () => {
    // File 1: not duplicate → uploads. File 2: duplicate → pauses. File 3: queued.
    mockCheckDuplicate
      .mockResolvedValueOnce({ success: true, data: { isDuplicate: false } }) // f1
      .mockResolvedValueOnce({
        success: true,
        data: {
          isDuplicate: true,
          existingFileId: 'existing-id',
          originalUploadDate: '2025-01-01T00:00:00.000Z',
          existingScore: null,
        },
      }) // f2 (duplicate)
      .mockResolvedValueOnce({ success: true, data: { isDuplicate: false } }) // f3 (from queue)

    const fileResult = {
      fileId: 'uploaded-id',
      fileName: 'report.sdlxliff',
      fileSizeBytes: 1024,
      fileType: 'sdlxliff',
      fileHash: 'a'.repeat(64),
      storagePath: 'path/1',
      status: 'uploaded',
      batchId: null,
    }
    setupXhrMock({ success: true, data: { files: [fileResult] } })

    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    act(() => {
      void result.current.startUpload([
        makeFile('f1.sdlxliff'),
        makeFile('f2.sdlxliff'),
        makeFile('f3.sdlxliff'),
      ])
    })

    // Wait for f2 to be detected as duplicate
    await waitFor(() => {
      expect(result.current.pendingDuplicate?.file.name).toBe('f2.sdlxliff')
    })

    // Confirm re-run — f2 uploads, then f3 processes from the queue
    act(() => {
      result.current.confirmRerun()
    })

    await waitFor(
      () => {
        // Queue fully drained: no more pending duplicate, uploading finished
        expect(result.current.pendingDuplicate).toBeNull()
        expect(result.current.isUploading).toBe(false)
        // checkDuplicate called for f1, f2, and f3 (queue continuation)
        expect(mockCheckDuplicate).toHaveBeenCalledTimes(3)
      },
      { timeout: 5000 },
    )
  })

  // L6: file exactly at MAX_FILE_SIZE_BYTES boundary should NOT be rejected
  it('should accept a file exactly at MAX_FILE_SIZE_BYTES boundary', async () => {
    setupXhrMock({ success: true, data: { files: [] } })
    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    await act(async () => {
      await result.current.startUpload([makeFile('exact.sdlxliff', 15 * 1024 * 1024)])
    })

    // Boundary is exclusive (> not >=), so 15MB exactly should not be FILE_SIZE_EXCEEDED
    expect(result.current.progress[0]?.error).not.toBe('FILE_SIZE_EXCEEDED')
  })

  // H7: mixed batch — valid + invalid files in same batch
  it('should process valid files and mark invalid files with error in a mixed batch', async () => {
    // Use unique UUIDs per call to prevent updateFileProgress from overwriting error entries
    // (all having the same mock-uuid causes all entries to be updated when valid file progresses)
    let uuidIndex = 0
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockImplementation(() => `test-uuid-${uuidIndex++}`),
      subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) },
    })

    const validResult = {
      fileId: 'file-valid',
      fileName: 'valid.sdlxliff',
      fileSizeBytes: 1024,
      fileType: 'sdlxliff',
      fileHash: 'a'.repeat(64),
      storagePath: 'path/valid',
      status: 'uploaded',
      batchId: null,
    }
    setupXhrMock({ success: true, data: { files: [validResult] } })

    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    await act(async () => {
      await result.current.startUpload([
        makeFile('invalid.pdf'), // unsupported
        makeFile('valid.sdlxliff'), // supported
        makeFile('toolarge.sdlxliff', 16 * 1024 * 1024), // exceeds max size
      ])
    })

    const progress = result.current.progress
    expect(progress).toHaveLength(3)

    const pdfEntry = progress.find((f) => f.fileName === 'invalid.pdf')
    expect(pdfEntry?.status).toBe('error')
    expect(pdfEntry?.error).toBe('UNSUPPORTED_FORMAT')

    const largeEntry = progress.find((f) => f.fileName === 'toolarge.sdlxliff')
    expect(largeEntry?.status).toBe('error')
    expect(largeEntry?.error).toBe('FILE_SIZE_EXCEEDED')

    // valid file should have been attempted (uploaded or in a terminal state — not pending)
    const validEntry = progress.find((f) => f.fileName === 'valid.sdlxliff')
    expect(validEntry?.status).not.toBe('pending')
  })

  it('should cancel pending duplicate and clear queue', async () => {
    mockCheckDuplicate.mockResolvedValue({
      success: true,
      data: {
        isDuplicate: true,
        existingFileId: 'existing-id',
        originalUploadDate: '2025-01-01T00:00:00.000Z',
        existingScore: null,
      },
    })

    setupXhrMock({ success: true, data: { files: [] } })
    const { result } = renderHook(() => useFileUpload({ projectId: VALID_PROJECT_ID }))

    await act(async () => {
      await result.current.startUpload([makeFile('report.sdlxliff')])
    })

    await waitFor(() => expect(result.current.pendingDuplicate).not.toBeNull())

    act(() => {
      result.current.cancelDuplicate()
    })

    expect(result.current.pendingDuplicate).toBeNull()
    expect(result.current.isUploading).toBe(false)
  })
})
