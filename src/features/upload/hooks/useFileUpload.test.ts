import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ----- module mocks must come before imports -----
vi.mock('@/lib/constants', () => ({
  MAX_FILE_SIZE_BYTES: 15 * 1024 * 1024,
  DEFAULT_BATCH_SIZE: 50,
}))

const mockCheckDuplicate = vi.fn()
vi.mock('../actions/checkDuplicate.action', () => ({
  checkDuplicate: (...args: unknown[]) => mockCheckDuplicate(...args),
}))

const mockCreateBatch = vi.fn()
vi.mock('../actions/createBatch.action', () => ({
  createBatch: (...args: unknown[]) => mockCreateBatch(...args),
}))

// Mock XMLHttpRequest for upload — must be a real class for `new XMLHttpRequest()` to work
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

// Setup global XMLHttpRequest mock — uses real class so `new XMLHttpRequest()` works
function setupXhrMock(responseBody: unknown, status = 200) {
  xhrInstances = []

  class FakeXHR extends MockXHR {
    override status = status
    override responseText = JSON.stringify(responseBody)
  }

  Object.defineProperty(global, 'XMLHttpRequest', {
    writable: true,
    configurable: true,
    value: FakeXHR,
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

    // Fire-and-forget: don't await — largeFileWarnings is set synchronously before first await in processFiles.
    // XHR will hang in the background (no mock needed) but test completes when state is updated.
    act(() => {
      void result.current.startUpload([makeFile('medium.sdlxliff', 11 * 1024 * 1024)])
    })

    await waitFor(() => {
      expect(result.current.largeFileWarnings).toContain('medium.sdlxliff')
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
