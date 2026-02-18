import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockCurrentUser = {
  id: 'user-1',
  email: 'admin@test.com',
  tenantId: 'tenant-1',
  role: 'admin' as const,
}

const mockExisting = {
  id: 'project-1',
  tenantId: 'tenant-1',
  name: 'Old Name',
  description: 'Old desc',
  sourceLang: 'en',
  targetLangs: ['th'],
  processingMode: 'economy',
  status: 'draft',
  autoPassThreshold: 95,
  aiBudgetMonthlyUsd: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockUpdated = { ...mockExisting, name: 'New Name' }

const mockReturning = vi.fn().mockResolvedValue([mockUpdated])
const mockSetWhere = vi.fn().mockReturnValue({ returning: mockReturning })
const mockSet = vi.fn().mockReturnValue({ where: mockSetWhere })
const mockUpdate = vi.fn().mockReturnValue({ set: mockSet })

const mockSelectWhere = vi.fn().mockResolvedValue([mockExisting])
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere })
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom })

vi.mock('@/db/client', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    name: 'projects',
    id: 'id',
    tenantId: 'tenant_id',
  },
}))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn().mockReturnValue('tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((a: unknown, b: unknown) => [a, b]),
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

describe('updateProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockCurrentUser)
    mockSelectWhere.mockResolvedValue([mockExisting])
    mockReturning.mockResolvedValue([mockUpdated])
  })

  it('should update project successfully for admin', async () => {
    const { updateProject } = await import('./updateProject.action')

    const result = await updateProject('project-1', { name: 'New Name' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('New Name')
    }
  }, 15_000)

  it('should return NOT_FOUND when project does not exist', async () => {
    mockSelectWhere.mockResolvedValue([])

    const { updateProject } = await import('./updateProject.action')

    const result = await updateProject('nonexistent', { name: 'Test' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  it('should return FORBIDDEN for non-admin', async () => {
    mockRequireRole.mockRejectedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Insufficient permissions',
    })

    const { updateProject } = await import('./updateProject.action')

    const result = await updateProject('project-1', { name: 'Test' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should accept partial update with only name', async () => {
    const { updateProject } = await import('./updateProject.action')

    const result = await updateProject('project-1', { name: 'New Name' })

    expect(result.success).toBe(true)
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name' }))
  })

  it('should write audit log with old and new values', async () => {
    const { updateProject } = await import('./updateProject.action')

    await updateProject('project-1', { name: 'New Name' })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'project',
        action: 'project.updated',
        oldValue: expect.objectContaining({ name: 'Old Name' }),
        newValue: expect.objectContaining({ name: 'New Name' }),
      }),
    )
  })

  it('should call revalidatePath for both /projects and /projects/{id}/settings', async () => {
    const { updateProject } = await import('./updateProject.action')

    await updateProject('project-1', { name: 'Test' })

    expect(mockRevalidatePath).toHaveBeenCalledWith('/projects')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/projects/project-1/settings')
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    const { updateProject } = await import('./updateProject.action')

    const result = await updateProject('project-1', { autoPassThreshold: 200 })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })
})
