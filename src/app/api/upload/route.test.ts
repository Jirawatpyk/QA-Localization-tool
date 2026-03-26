vi.mock('server-only', () => ({}))

// Mock rate limiter — always allow (tests focus on upload logic, not rate limiting)
vi.mock('@/lib/ratelimit', () => ({
  mutationLimiter: {
    limit: vi.fn().mockResolvedValue({ success: true, limit: 100, remaining: 99, reset: 0 }),
  },
}))

const mockUploadStorage = vi.fn().mockResolvedValue({ error: null })
const mockRemoveStorage = vi.fn().mockResolvedValue({ error: null })
const mockStorageFrom = vi
  .fn()
  .mockReturnValue({ upload: mockUploadStorage, remove: mockRemoveStorage })
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from: mockStorageFrom } }),
}))

const mockReturningFn = vi.fn()
const mockValuesFn = vi.fn().mockReturnValue({ returning: mockReturningFn })
const mockInsertFn = vi.fn().mockReturnValue({ values: mockValuesFn })
// Chainable update mock for duplicate re-run path (UPDATE existing file)
const mockUpdateReturningFn = vi.fn()
const mockUpdateWhereFn = vi.fn().mockReturnValue({ returning: mockUpdateReturningFn })
const mockUpdateSetFn = vi.fn().mockReturnValue({ where: mockUpdateWhereFn })
const mockUpdateFn = vi.fn().mockReturnValue({ set: mockUpdateSetFn })
// Chainable select mock for ownership verification (projects + uploadBatches) + file existence check
const mockLimitFn = vi.fn().mockResolvedValue([{ id: 'some-id' }])
const mockWhereFn = vi.fn().mockReturnValue({ limit: mockLimitFn })
const mockFromFn = vi.fn().mockReturnValue({ where: mockWhereFn })
const mockSelectFn = vi.fn().mockReturnValue({ from: mockFromFn })
// Transaction mock: forward callback with tx that has same mocks as db
const mockTransactionFn = vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
  return fn({
    select: (...args: unknown[]) => mockSelectFn(...args),
    insert: (...args: unknown[]) => mockInsertFn(...args),
    update: (...args: unknown[]) => mockUpdateFn(...args),
  })
})
vi.mock('@/db/client', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsertFn(...args),
    select: (...args: unknown[]) => mockSelectFn(...args),
    update: (...args: unknown[]) => mockUpdateFn(...args),
    transaction: (...args: unknown[]) => mockTransactionFn(...(args as [never])),
  },
}))

vi.mock('@/db/schema/files', () => ({
  files: {},
}))

vi.mock('@/db/schema/projects', () => ({
  projects: { id: 'id', tenantId: 'tenant_id' },
}))

vi.mock('@/db/schema/uploadBatches', () => ({
  uploadBatches: { id: 'id', tenantId: 'tenant_id' },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}))

const mockRequireRole = vi.fn()
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/features/upload/utils/fileHash.server', () => ({
  computeFileHash: vi.fn().mockReturnValue('a'.repeat(64)),
}))

vi.mock('@/features/upload/utils/storagePath', () => ({
  buildStoragePath: vi.fn().mockReturnValue('tenant/project/hash/file.sdlxliff'),
}))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn().mockReturnValue({}),
}))

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const VALID_UUID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const MOCK_USER = {
  id: 'b2c3d4e5-f6a7-4b2c-8d3e-4f5a6b7c8d9e',
  tenantId: 'c3d4e5f6-a7b8-4c3d-9e4f-5a6b7c8d9e0f',
  email: 'qa@test.com',
  role: 'qa_reviewer' as const,
}

const MOCK_FILE_RECORD = {
  id: 'f1e2d3c4-b5a6-4f1e-8d2c-3b4a5f6e7d8c',
  tenantId: MOCK_USER.tenantId,
  projectId: VALID_UUID,
  fileName: 'report.sdlxliff',
  fileType: 'sdlxliff',
  fileSizeBytes: 100,
  fileHash: 'a'.repeat(64),
  storagePath: 'path/to/file',
  status: 'uploaded',
  uploadedBy: MOCK_USER.id,
  batchId: null,
  createdAt: new Date(),
}

function makeFile(name: string, content = 'test content', sizeOverride?: number): File {
  const file = new File([content], name, { type: 'application/xml' })
  if (sizeOverride !== undefined) {
    Object.defineProperty(file, 'size', { value: sizeOverride, writable: false })
  }
  return file
}

/**
 * Build a NextRequest with a mocked formData() method.
 * NextRequest.formData() is unreliable in jsdom — we spy on the instance method.
 */
function makeRequest(mockFd: FormData, contentLength?: number): NextRequest {
  const headers: Record<string, string> = {}
  if (contentLength !== undefined) {
    headers['content-length'] = String(contentLength)
  }
  const req = new NextRequest('http://localhost/api/upload', {
    method: 'POST',
    headers,
  })
  vi.spyOn(req, 'formData').mockResolvedValue(mockFd)
  return req
}

beforeEach(() => {
  vi.clearAllMocks()
  // mockReset clears mockResolvedValueOnce queues (vi.clearAllMocks doesn't)
  mockLimitFn.mockReset()
  mockReturningFn.mockReset()
  mockUploadStorage.mockReset()

  mockRequireRole.mockResolvedValue(MOCK_USER)
  mockReturningFn.mockResolvedValue([MOCK_FILE_RECORD])
  mockValuesFn.mockReturnValue({ returning: mockReturningFn })
  mockInsertFn.mockReturnValue({ values: mockValuesFn })
  mockUploadStorage.mockResolvedValue({ error: null })
  mockRemoveStorage.mockResolvedValue({ error: null })
  mockStorageFrom.mockReturnValue({ upload: mockUploadStorage, remove: mockRemoveStorage })
  // Update mock chain (duplicate re-run path)
  mockUpdateReturningFn.mockResolvedValue([MOCK_FILE_RECORD])
  mockUpdateWhereFn.mockReturnValue({ returning: mockUpdateReturningFn })
  mockUpdateSetFn.mockReturnValue({ where: mockUpdateWhereFn })
  mockUpdateFn.mockReturnValue({ set: mockUpdateSetFn })
  // Select mock: first call = project ownership (found), subsequent = file existence (not found)
  mockLimitFn.mockResolvedValueOnce([{ id: VALID_UUID }]).mockResolvedValue([])
  mockWhereFn.mockReturnValue({ limit: mockLimitFn })
  mockFromFn.mockReturnValue({ where: mockWhereFn })
  mockSelectFn.mockReturnValue({ from: mockFromFn })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/upload', () => {
  it('should upload a single valid sdlxliff file successfully', async () => {
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('report.sdlxliff'))

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.files).toHaveLength(1)
  })

  it('should return 401 when not authenticated', async () => {
    mockRequireRole.mockRejectedValue({ success: false, code: 'UNAUTHORIZED' })
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('report.sdlxliff'))

    const response = await POST(makeRequest(formData))
    expect(response.status).toBe(401)
  })

  it('should reject via Content-Length header exceeding batch max size', async () => {
    // threshold = DEFAULT_BATCH_SIZE (50) × (MAX_FILE_SIZE_BYTES + 65536)
    const batchMaxBytes = 50 * (15 * 1024 * 1024 + 65536)
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('large.sdlxliff'))

    const response = await POST(makeRequest(formData, batchMaxBytes + 1))
    const body = await response.json()

    expect(response.status).toBe(413)
    expect(body.error).toContain('batch upload')
  })

  it('should reject files exceeding 15MB by actual size', async () => {
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('large.sdlxliff', 'x', 16 * 1024 * 1024))

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(413)
    expect(body.error).toContain('15MB')
  })

  it('should reject unsupported file formats', async () => {
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('document.pdf'))

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain('Unsupported format')
  })

  it('should reject batch exceeding 50 files', async () => {
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    for (let i = 0; i < 51; i++) {
      formData.append('files', makeFile(`file-${i}.sdlxliff`))
    }

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain('50 files')
  })

  it('should return 400 when projectId is missing', async () => {
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('files', makeFile('report.sdlxliff'))

    const response = await POST(makeRequest(formData))
    expect(response.status).toBe(400)
  })

  it('should include warning for files between 10-15MB', async () => {
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('medium.sdlxliff', 'x', 11 * 1024 * 1024))

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.warnings).toHaveLength(1)
    expect(body.data.warnings[0]).toContain('Large file')
  })

  it('should return 500 when storage upload fails', async () => {
    mockUploadStorage.mockResolvedValue({ error: { message: 'Storage error' } })
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('report.sdlxliff'))

    const response = await POST(makeRequest(formData))
    expect(response.status).toBe(500)
  })

  it('should write audit log for each uploaded file', async () => {
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('report.sdlxliff'))
    formData.append('files', makeFile('data.xlsx'))

    await POST(makeRequest(formData))

    // M9: assert all required audit log fields (action, entityType, entityId, tenantId, userId)
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(2)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'file.uploaded',
        entityType: 'file',
        entityId: MOCK_FILE_RECORD.id,
        tenantId: MOCK_USER.tenantId,
        userId: MOCK_USER.id,
      }),
    )
  })

  it('should accept xlf files', async () => {
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('report.xlf'))

    const response = await POST(makeRequest(formData))
    expect(response.status).toBe(200)
  })

  it('should return 400 when no files are provided', async () => {
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)

    const response = await POST(makeRequest(formData))
    expect(response.status).toBe(400)
  })

  it('should return 404 when projectId does not belong to the authenticated tenant', async () => {
    mockLimitFn.mockReset()
    mockLimitFn.mockResolvedValue([]) // project not found for this tenant
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('report.sdlxliff'))

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toContain('Project not found')
  })

  it('should return 500 when DB insert returns empty (fileRecord is undefined)', async () => {
    mockReturningFn.mockResolvedValueOnce([]) // empty means no record returned
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('report.sdlxliff'))

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toContain('Failed to record file')
    // H5: storage orphan must be cleaned up when DB insert fails
    expect(mockRemoveStorage).toHaveBeenCalledWith(['tenant/project/hash/file.sdlxliff'])
  })

  it('should treat storage "already exists" as idempotent success', async () => {
    mockUploadStorage.mockResolvedValueOnce({
      error: { message: 'The resource already exists' },
    })
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('report.sdlxliff'))

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
  })

  // L6: file exactly at MAX_FILE_SIZE_BYTES (15MB) should succeed — boundary is exclusive
  it('should accept a file exactly at 15MB without rejecting', async () => {
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('exact.sdlxliff', 'x', 15 * 1024 * 1024))

    const response = await POST(makeRequest(formData))

    expect(response.status).toBe(200)
  })

  it('should return 404 when batchId does not belong to the authenticated tenant', async () => {
    // First call (project check) returns found, second call (batch check) returns not found
    mockLimitFn.mockReset()
    mockLimitFn
      .mockResolvedValueOnce([{ id: VALID_UUID }]) // project owned
      .mockResolvedValue([]) // batch not owned (+ default for file existence)
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('batchId', 'd4e5f6a7-b8c9-4d4e-ae5f-6a7b8c9d0e1f')
    formData.append('files', makeFile('report.sdlxliff'))

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toContain('Batch not found')
  })

  // H6: UUID validation — invalid projectId / batchId must be rejected before DB queries
  it('should return 400 when projectId is not a valid UUID', async () => {
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', 'not-a-uuid')
    formData.append('files', makeFile('report.sdlxliff'))

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain('Invalid project ID')
    // DB must NOT be queried for an invalid UUID
    expect(mockSelectFn).not.toHaveBeenCalled()
  })

  it('should return 400 when batchId is present but not a valid UUID', async () => {
    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('batchId', 'bad-batch-id')
    formData.append('files', makeFile('report.sdlxliff'))

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain('Invalid batch ID')
    // DB must NOT be queried for an invalid UUID
    expect(mockSelectFn).not.toHaveBeenCalled()
  })

  // 2.1-UNIT-003 [P1]: Partial batch failure — file 1 storage OK, file 2 storage fails
  it('should return 500 when second file storage upload fails in a batch', async () => {
    // File 1 succeeds, file 2 fails storage upload
    mockUploadStorage
      .mockResolvedValueOnce({ error: null }) // file 1 OK
      .mockResolvedValueOnce({ error: { message: 'Disk quota exceeded' } }) // file 2 fails

    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('report1.sdlxliff'))
    formData.append('files', makeFile('report2.sdlxliff'))

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    // Route returns 500 on first storage failure — entire batch aborts
    expect(response.status).toBe(500)
    expect(body.error).toContain('Storage upload failed')
  })

  // 2.1-UNIT-009 [P2]: Re-upload with "already exists" for first file, normal for second
  it('should handle mixed already-exists and fresh uploads in same batch', async () => {
    const fileRecord1 = {
      ...MOCK_FILE_RECORD,
      id: 'f1e2d3c4-b5a6-4f1e-8d2c-3b4a5f6e7d81',
      fileName: 'report1.sdlxliff',
    }
    const fileRecord2 = {
      ...MOCK_FILE_RECORD,
      id: 'f1e2d3c4-b5a6-4f1e-8d2c-3b4a5f6e7d82',
      fileName: 'report2.sdlxliff',
    }

    mockUploadStorage
      .mockResolvedValueOnce({ error: { message: 'The resource already exists' } }) // file 1 idempotent
      .mockResolvedValueOnce({ error: null }) // file 2 fresh upload

    mockReturningFn.mockResolvedValueOnce([fileRecord1]).mockResolvedValueOnce([fileRecord2])

    const { POST } = await import('./route')
    const formData = new FormData()
    formData.append('projectId', VALID_UUID)
    formData.append('files', makeFile('report1.sdlxliff'))
    formData.append('files', makeFile('report2.sdlxliff'))

    const response = await POST(makeRequest(formData))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.files).toHaveLength(2)
    // Both files should have DB records
    expect(mockInsertFn).toHaveBeenCalledTimes(2)
  })
})
