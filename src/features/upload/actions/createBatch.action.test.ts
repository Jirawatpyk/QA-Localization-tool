vi.mock('server-only', () => ({}))

const mockReturningFn = vi.fn()
const mockValuesFn = vi.fn().mockReturnValue({ returning: mockReturningFn })
const mockInsertFn = vi.fn().mockReturnValue({ values: mockValuesFn })

vi.mock('@/db/client', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsertFn(...args),
  },
}))

vi.mock('@/db/schema/uploadBatches', () => ({
  uploadBatches: {
    id: 'id',
    tenantId: 'tenant_id',
    projectId: 'project_id',
    fileCount: 'file_count',
    createdBy: 'created_by',
    createdAt: 'created_at',
  },
}))

const mockRequireRole = vi.fn()
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

import { beforeEach, describe, expect, it, vi } from 'vitest'

const VALID_UUID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const MOCK_USER = {
  id: 'b2c3d4e5-f6a7-4b2c-8d3e-4f5a6b7c8d9e',
  tenantId: 'c3d4e5f6-a7b8-4c3d-9e4f-5a6b7c8d9e0f',
  email: 'qa@test.com',
  role: 'qa_reviewer' as const,
}
const MOCK_BATCH = {
  id: 'd4e5f6a7-b8c9-4d4e-ae5f-6a7b8c9d0e1f',
  projectId: VALID_UUID,
  tenantId: MOCK_USER.tenantId,
  fileCount: 3,
  createdBy: MOCK_USER.id,
  createdAt: new Date('2025-06-01T10:00:00.000Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireRole.mockResolvedValue(MOCK_USER)
  mockReturningFn.mockResolvedValue([MOCK_BATCH])
  mockValuesFn.mockReturnValue({ returning: mockReturningFn })
  mockInsertFn.mockReturnValue({ values: mockValuesFn })
})

describe('createBatch', () => {
  it('should create a batch successfully', async () => {
    const { createBatch } = await import('./createBatch.action')

    const result = await createBatch({ projectId: VALID_UUID, fileCount: 3 })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(MOCK_BATCH.id)
      expect(result.data.fileCount).toBe(3)
      expect(result.data.projectId).toBe(VALID_UUID)
      expect(result.data.createdAt).toBe('2025-06-01T10:00:00.000Z')
    }
  })

  it('should write an audit log on success', async () => {
    const { createBatch } = await import('./createBatch.action')

    await createBatch({ projectId: VALID_UUID, fileCount: 3 })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'upload_batch.created',
        entityType: 'upload_batch',
        tenantId: MOCK_USER.tenantId,
      }),
    )
  })

  it('should return UNAUTHORIZED when not authenticated', async () => {
    mockRequireRole.mockRejectedValue({ success: false, code: 'UNAUTHORIZED' })
    const { createBatch } = await import('./createBatch.action')

    const result = await createBatch({ projectId: VALID_UUID, fileCount: 3 })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('UNAUTHORIZED')
  })

  it('should return VALIDATION_ERROR for invalid project ID', async () => {
    const { createBatch } = await import('./createBatch.action')

    const result = await createBatch({ projectId: 'bad-uuid', fileCount: 3 })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('should return VALIDATION_ERROR for fileCount exceeding 50', async () => {
    const { createBatch } = await import('./createBatch.action')

    const result = await createBatch({ projectId: VALID_UUID, fileCount: 51 })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('should return CREATE_FAILED when DB insert returns empty', async () => {
    mockReturningFn.mockResolvedValue([])
    const { createBatch } = await import('./createBatch.action')

    const result = await createBatch({ projectId: VALID_UUID, fileCount: 3 })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('CREATE_FAILED')
  })
})
