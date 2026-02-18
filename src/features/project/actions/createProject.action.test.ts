import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock server-only
vi.mock('server-only', () => ({}))

const mockCurrentUser = {
  id: 'user-1',
  email: 'admin@test.com',
  tenantId: 'tenant-1',
  role: 'admin' as const,
}

const mockProject = {
  id: 'project-1',
  tenantId: 'tenant-1',
  name: 'Test Project',
  description: null,
  sourceLang: 'en',
  targetLangs: ['th', 'ja'],
  processingMode: 'economy',
  status: 'draft',
  autoPassThreshold: 95,
  aiBudgetMonthlyUsd: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockReturning = vi.fn().mockResolvedValue([mockProject])
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
const mockInsert = vi.fn().mockReturnValue({ values: mockValues })

vi.mock('@/db/client', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: { name: 'projects' },
}))

const mockRequireRole = vi.fn().mockResolvedValue(mockCurrentUser)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

const mockRevalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}))

describe('createProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    mockReturning.mockResolvedValue([mockProject])
  })

  it('should create project successfully for admin', async () => {
    const { createProject } = await import('./createProject.action')

    const result = await createProject({
      name: 'Test Project',
      sourceLang: 'en',
      targetLangs: ['th', 'ja'],
      processingMode: 'economy',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe('project-1')
      expect(result.data.name).toBe('Test Project')
    }
  })

  it('should call requireRole with admin write', async () => {
    const { createProject } = await import('./createProject.action')

    await createProject({
      name: 'Test',
      sourceLang: 'en',
      targetLangs: ['th'],
      processingMode: 'economy',
    })

    expect(mockRequireRole).toHaveBeenCalledWith('admin', 'write')
  })

  it('should return FORBIDDEN for non-admin', async () => {
    mockRequireRole.mockRejectedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Insufficient permissions',
    })

    const { createProject } = await import('./createProject.action')

    const result = await createProject({
      name: 'Test',
      sourceLang: 'en',
      targetLangs: ['th'],
      processingMode: 'economy',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    const { createProject } = await import('./createProject.action')

    const result = await createProject({
      name: '',
      sourceLang: 'en',
      targetLangs: ['th'],
      processingMode: 'economy',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should write audit log with correct fields', async () => {
    const { createProject } = await import('./createProject.action')

    await createProject({
      name: 'Test Project',
      sourceLang: 'en',
      targetLangs: ['th'],
      processingMode: 'economy',
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        entityType: 'project',
        entityId: 'project-1',
        action: 'project.created',
        newValue: expect.objectContaining({ name: 'Test Project' }),
      }),
    )
    // oldValue should NOT be present for creates
    const callArg = mockWriteAuditLog.mock.calls[0]?.[0] as Record<string, unknown> | undefined
    expect(callArg).toBeDefined()
    expect(callArg).not.toHaveProperty('oldValue')
  })

  it('should set tenantId from currentUser not from input', async () => {
    const { createProject } = await import('./createProject.action')

    await createProject({
      name: 'Test',
      sourceLang: 'en',
      targetLangs: ['th'],
      processingMode: 'economy',
    })

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
      }),
    )
  })

  it('should call revalidatePath after success', async () => {
    const { createProject } = await import('./createProject.action')

    await createProject({
      name: 'Test',
      sourceLang: 'en',
      targetLangs: ['th'],
      processingMode: 'economy',
    })

    expect(mockRevalidatePath).toHaveBeenCalledWith('/projects')
  })
})
