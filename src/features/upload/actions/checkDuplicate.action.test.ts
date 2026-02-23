vi.mock('server-only', () => ({}))

const mockLimitFn = vi.fn().mockResolvedValue([])
const mockOrderByFn = vi.fn().mockReturnValue({ limit: mockLimitFn })
const mockWhereFn = vi.fn().mockReturnValue({ orderBy: mockOrderByFn })
const mockLeftJoinFn = vi.fn().mockReturnValue({ where: mockWhereFn })
const mockFromFn = vi.fn().mockReturnValue({ leftJoin: mockLeftJoinFn })
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
    fileHash: 'file_hash',
    createdAt: 'created_at',
  },
}))

vi.mock('@/db/schema/scores', () => ({
  scores: { mqmScore: 'mqm_score', fileId: 'file_id', tenantId: 'tenant_id' },
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
const VALID_HASH = 'a'.repeat(64)
const MOCK_USER = {
  id: 'b2c3d4e5-f6a7-4b2c-8d3e-4f5a6b7c8d9e',
  tenantId: 'c3d4e5f6-a7b8-4c3d-9e4f-5a6b7c8d9e0f',
  email: 'qa@test.com',
  role: 'qa_reviewer' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireRole.mockResolvedValue(MOCK_USER)
  mockLimitFn.mockResolvedValue([])
  mockOrderByFn.mockReturnValue({ limit: mockLimitFn })
  mockWhereFn.mockReturnValue({ orderBy: mockOrderByFn })
  mockLeftJoinFn.mockReturnValue({ where: mockWhereFn })
  mockFromFn.mockReturnValue({ leftJoin: mockLeftJoinFn })
  mockSelectFn.mockReturnValue({ from: mockFromFn })
})

describe('checkDuplicate', () => {
  it('should return isDuplicate false when no existing file found', async () => {
    mockLimitFn.mockResolvedValue([])
    const { checkDuplicate } = await import('./checkDuplicate.action')

    const result = await checkDuplicate({ fileHash: VALID_HASH, projectId: VALID_UUID })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isDuplicate).toBe(false)
    }
  })

  it('should return isDuplicate true when file hash exists', async () => {
    const existingFile = {
      id: 'f1e2d3c4-b5a6-4f1e-8d2c-3b4a5f6e7d8c',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      mqmScore: 85.5,
    }
    mockLimitFn.mockResolvedValue([existingFile])
    const { checkDuplicate } = await import('./checkDuplicate.action')

    const result = await checkDuplicate({ fileHash: VALID_HASH, projectId: VALID_UUID })

    expect(result.success).toBe(true)
    if (result.success && result.data.isDuplicate) {
      expect(result.data.existingScore).toBe(85.5)
      expect(result.data.existingFileId).toBe(existingFile.id)
      expect(result.data.originalUploadDate).toBe('2025-01-01T00:00:00.000Z')
    }
  })

  it('should return null existingScore when file has no score', async () => {
    mockLimitFn.mockResolvedValue([
      { id: 'f1e2d3c4-b5a6-4f1e-8d2c-3b4a5f6e7d8c', createdAt: new Date(), mqmScore: null },
    ])
    const { checkDuplicate } = await import('./checkDuplicate.action')

    const result = await checkDuplicate({ fileHash: VALID_HASH, projectId: VALID_UUID })

    expect(result.success).toBe(true)
    if (result.success && result.data.isDuplicate) {
      expect(result.data.existingScore).toBeNull()
    }
  })

  it('should return UNAUTHORIZED when not authenticated', async () => {
    mockRequireRole.mockRejectedValue({ success: false, code: 'UNAUTHORIZED' })
    const { checkDuplicate } = await import('./checkDuplicate.action')

    const result = await checkDuplicate({ fileHash: VALID_HASH, projectId: VALID_UUID })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('UNAUTHORIZED')
  })

  it('should return VALIDATION_ERROR for hash shorter than 64 chars', async () => {
    const { checkDuplicate } = await import('./checkDuplicate.action')

    const result = await checkDuplicate({ fileHash: 'too-short', projectId: VALID_UUID })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('should return VALIDATION_ERROR for invalid project ID', async () => {
    const { checkDuplicate } = await import('./checkDuplicate.action')

    const result = await checkDuplicate({ fileHash: VALID_HASH, projectId: 'not-a-uuid' })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR')
  })
})
