import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock DB
const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockResolvedValue(undefined),
})
vi.mock('@/db/client', () => ({
  db: {
    insert: () => mockInsert(),
  },
}))

vi.mock('@/db/schema/auditLogs', () => ({
  auditLogs: { name: 'audit_logs' },
}))

describe('writeAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should insert an audit log entry', async () => {
    const { writeAuditLog } = await import('./writeAuditLog')

    await writeAuditLog({
      tenantId: 'tenant-1',
      userId: 'user-1',
      entityType: 'project',
      entityId: 'project-1',
      action: 'project.created',
      newValue: { name: 'Test Project' },
    })

    expect(mockInsert).toHaveBeenCalled()
  })

  it('should accept entry without userId (system event)', async () => {
    const { writeAuditLog } = await import('./writeAuditLog')

    await writeAuditLog({
      tenantId: 'tenant-1',
      entityType: 'system',
      entityId: 'system-1',
      action: 'migration.applied',
    })

    expect(mockInsert).toHaveBeenCalled()
  })

  it('should throw if insert fails', async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('DB write failed')),
    })

    const { writeAuditLog } = await import('./writeAuditLog')

    await expect(
      writeAuditLog({
        tenantId: 'tenant-1',
        entityType: 'test',
        entityId: 'test-1',
        action: 'test.action',
      }),
    ).rejects.toThrow('DB write failed')
  })
})
