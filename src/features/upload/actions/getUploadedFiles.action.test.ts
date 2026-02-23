vi.mock('server-only', () => ({}))

const mockOrderByFn = vi.fn().mockResolvedValue([])
const mockWhereFn = vi.fn().mockReturnValue({ orderBy: mockOrderByFn })
const mockFromFn = vi.fn().mockReturnValue({ where: mockWhereFn })
const mockSelectFn = vi.fn().mockReturnValue({ from: mockFromFn })

vi.mock('@/db/client', () => ({
  db: {
    select: (...args: unknown[]) => mockSelectFn(...args),
  },
}))

vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    tenantId: 'tenant_id',
    projectId: 'project_id',
    fileName: 'file_name',
    fileType: 'file_type',
    fileSizeBytes: 'file_size_bytes',
    fileHash: 'file_hash',
    status: 'status',
    storagePath: 'storage_path',
    batchId: 'batch_id',
    createdAt: 'created_at',
  },
}))

const mockRequireRole = vi.fn()
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn().mockReturnValue({ sql: 'tenant_filter' }),
}))

import { beforeEach, describe, expect, it, vi } from 'vitest'

const VALID_UUID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const MOCK_USER = {
  id: 'b2c3d4e5-f6a7-4b2c-8d3e-4f5a6b7c8d9e',
  tenantId: 'c3d4e5f6-a7b8-4c3d-9e4f-5a6b7c8d9e0f',
  email: 'qa@test.com',
  role: 'qa_reviewer' as const,
}

const MOCK_FILE_ROW = {
  id: 'f1e2d3c4-b5a6-4f1e-8d2c-3b4a5f6e7d8c',
  fileName: 'report.sdlxliff',
  fileType: 'sdlxliff',
  fileSizeBytes: 1024,
  fileHash: 'a'.repeat(64),
  status: 'uploaded',
  storagePath: 'path/to/file',
  batchId: null,
  createdAt: new Date('2025-06-01T10:00:00.000Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireRole.mockResolvedValue(MOCK_USER)
  mockOrderByFn.mockResolvedValue([MOCK_FILE_ROW])
  mockWhereFn.mockReturnValue({ orderBy: mockOrderByFn })
  mockFromFn.mockReturnValue({ where: mockWhereFn })
  mockSelectFn.mockReturnValue({ from: mockFromFn })
})

describe('getUploadedFiles', () => {
  it('should return files for a project', async () => {
    const { getUploadedFiles } = await import('./getUploadedFiles.action')

    const result = await getUploadedFiles({ projectId: VALID_UUID })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0]?.fileName).toBe('report.sdlxliff')
    }
  })

  it('should convert createdAt to ISO string', async () => {
    const { getUploadedFiles } = await import('./getUploadedFiles.action')

    const result = await getUploadedFiles({ projectId: VALID_UUID })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]?.createdAt).toBe('2025-06-01T10:00:00.000Z')
    }
  })

  it('should return empty array when no files exist', async () => {
    mockOrderByFn.mockResolvedValue([])
    const { getUploadedFiles } = await import('./getUploadedFiles.action')

    const result = await getUploadedFiles({ projectId: VALID_UUID })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toHaveLength(0)
  })

  it('should return UNAUTHORIZED when not authenticated', async () => {
    mockRequireRole.mockRejectedValue({ success: false, code: 'UNAUTHORIZED' })
    const { getUploadedFiles } = await import('./getUploadedFiles.action')

    const result = await getUploadedFiles({ projectId: VALID_UUID })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('UNAUTHORIZED')
  })

  it('should return VALIDATION_ERROR for invalid project ID', async () => {
    const { getUploadedFiles } = await import('./getUploadedFiles.action')

    const result = await getUploadedFiles({ projectId: 'not-a-uuid' })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR')
  })
})
