import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/types/tenant'

vi.mock('server-only', () => ({}))

const TEST_TENANT_ID = asTenantId(faker.string.uuid())
const TEST_PROJECT_ID = faker.string.uuid()

const mockCurrentUser = {
  id: 'user-1',
  email: 'admin@test.com',
  tenantId: TEST_TENANT_ID,
  role: 'admin' as const,
}

const mockExisting = {
  id: 'project-1',
  tenantId: TEST_TENANT_ID,
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

    const result = await updateProject(TEST_PROJECT_ID, { name: 'New Name' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('New Name')
    }
  }, 15_000)

  it('should return NOT_FOUND when project does not exist', async () => {
    mockSelectWhere.mockResolvedValue([])

    const { updateProject } = await import('./updateProject.action')

    const result = await updateProject('550e8400-e29b-41d4-a716-446655440000', { name: 'Test' })

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

    const result = await updateProject(TEST_PROJECT_ID, { name: 'Test' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should accept partial update with only name', async () => {
    const { updateProject } = await import('./updateProject.action')

    const result = await updateProject(TEST_PROJECT_ID, { name: 'New Name' })

    expect(result.success).toBe(true)
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name' }))
  })

  it('should write audit log with old and new values', async () => {
    const { updateProject } = await import('./updateProject.action')

    await updateProject(TEST_PROJECT_ID, { name: 'New Name' })

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

    await updateProject(TEST_PROJECT_ID, { name: 'Test' })

    expect(mockRevalidatePath).toHaveBeenCalledWith('/projects')
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/projects/${TEST_PROJECT_ID}/settings`)
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    const { updateProject } = await import('./updateProject.action')

    const result = await updateProject(TEST_PROJECT_ID, { autoPassThreshold: 200 })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should return VALIDATION_ERROR for non-UUID projectId', async () => {
    const { updateProject } = await import('./updateProject.action')

    const result = await updateProject('not-a-uuid', { name: 'Test' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.error).toBe('Invalid project ID')
    }
  })

  it('should return UPDATE_FAILED when returning() is empty', async () => {
    mockReturning.mockResolvedValue([])

    const { updateProject } = await import('./updateProject.action')

    const result = await updateProject('550e8400-e29b-41d4-a716-446655440000', { name: 'Test' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UPDATE_FAILED')
    }
  })
})
