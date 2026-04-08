import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/types/tenant'

vi.mock('server-only', () => ({}))

const TEST_TENANT_ID = asTenantId(faker.string.uuid())

const mockUser = {
  id: 'user-self',
  email: 'reviewer@test.com',
  tenantId: TEST_TENANT_ID,
  role: 'native_reviewer' as const,
  nativeLanguages: ['th'],
}

const { dbState, dbMockModule } = vi.hoisted(() =>
  (
    globalThis as unknown as {
      createDrizzleMock: () => import('@/test/drizzleMock').DrizzleMockResult
    }
  ).createDrizzleMock(),
)
vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/db/helpers/withTenant', () => ({ withTenant: vi.fn() }))
vi.mock('@/db/schema/fileAssignments', () => ({ fileAssignments: {} }))
vi.mock('@/db/schema/users', () => ({ users: {} }))

const mockRequireRole = vi.fn().mockResolvedValue(mockUser)
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

import { selfAssignFile } from './selfAssignFile.action'

describe('selfAssignFile', () => {
  const validInput = {
    fileId: faker.string.uuid(),
    projectId: faker.string.uuid(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
  })

  it('should return UNAUTHORIZED when not authenticated', async () => {
    mockRequireRole.mockRejectedValueOnce({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Not authenticated',
    })

    const result = await selfAssignFile(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UNAUTHORIZED')
    }
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    const result = await selfAssignFile({ fileId: 'not-uuid' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should self-assign successfully when no existing assignment', async () => {
    const assignmentId = faker.string.uuid()
    const now = new Date()

    // Call 1: INSERT .returning() → inserted row
    dbState.returnValues = [
      [
        {
          id: assignmentId,
          fileId: validInput.fileId,
          projectId: validInput.projectId,
          assignedTo: mockUser.id,
          assignedBy: mockUser.id,
          status: 'in_progress',
          priority: 'normal',
          lastActiveAt: now,
        },
      ],
      // Call 2: SELECT users.displayName
      [{ displayName: 'Test Reviewer' }],
    ]

    const result = await selfAssignFile(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.created).toBe(true)
      expect(result.data.assignment.id).toBe(assignmentId)
      expect(result.data.assignment.assignedTo).toBe(mockUser.id)
      expect(result.data.assignment.status).toBe('in_progress')
      expect(result.data.assignment.assigneeName).toBe('Test Reviewer')
    }

    // Audit log should have been called
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'self_assign',
        entityType: 'file_assignment',
        entityId: assignmentId,
      }),
    )
  })

  it('should return conflict data when another reviewer has the lock', async () => {
    const otherUserId = faker.string.uuid()
    const existingAssignmentId = faker.string.uuid()

    // Call 1: INSERT .returning() → empty (conflict, DO NOTHING)
    dbState.returnValues = [
      [],
      // Call 2: SELECT existing lock holder
      [
        {
          id: existingAssignmentId,
          fileId: validInput.fileId,
          projectId: validInput.projectId,
          assignedTo: otherUserId,
          assignedBy: otherUserId,
          status: 'in_progress',
          priority: 'normal',
          lastActiveAt: new Date(),
          assigneeName: 'Other Reviewer',
        },
      ],
    ]

    const result = await selfAssignFile(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.created).toBe(false)
      expect(result.data.assignment.assignedTo).toBe(otherUserId)
      expect(result.data.assignment.assigneeName).toBe('Other Reviewer')
    }

    // No audit log on conflict
    expect(mockWriteAuditLog).not.toHaveBeenCalled()
  })

  it('should return own existing assignment when self already holds lock', async () => {
    const existingAssignmentId = faker.string.uuid()

    // Call 1: INSERT .returning() → empty (conflict, own lock already exists)
    dbState.returnValues = [
      [],
      // Call 2: SELECT existing — own assignment
      [
        {
          id: existingAssignmentId,
          fileId: validInput.fileId,
          projectId: validInput.projectId,
          assignedTo: mockUser.id,
          assignedBy: mockUser.id,
          status: 'in_progress',
          priority: 'normal',
          lastActiveAt: new Date(),
          assigneeName: 'Test Reviewer',
        },
      ],
    ]

    const result = await selfAssignFile(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.created).toBe(false)
      expect(result.data.assignment.assignedTo).toBe(mockUser.id)
    }
  })

  it('should use withTenant for tenant isolation', async () => {
    dbState.returnValues = [
      [
        {
          id: faker.string.uuid(),
          fileId: validInput.fileId,
          projectId: validInput.projectId,
          assignedTo: mockUser.id,
          assignedBy: mockUser.id,
          status: 'in_progress',
          priority: 'normal',
          lastActiveAt: new Date(),
        },
      ],
      [{ displayName: 'Test Reviewer' }],
    ]

    await selfAssignFile(validInput)

    // requireRole is called with write mode
    expect(mockRequireRole).toHaveBeenCalledWith('native_reviewer', 'write')
  })
})
