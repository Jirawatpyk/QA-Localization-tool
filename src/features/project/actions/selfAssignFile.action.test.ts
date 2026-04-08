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
vi.mock('@/db/schema/files', () => ({ files: {} }))
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

    dbState.returnValues = [
      // Call 1 (S-FIX-7 H4): SELECT files for project verification
      [{ projectId: validInput.projectId }],
      // Call 2: INSERT .returning() → inserted row
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
      // Call 3: SELECT users.displayName
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

    dbState.returnValues = [
      // Call 1 (H4): SELECT files
      [{ projectId: validInput.projectId }],
      // Call 2: INSERT .returning() → empty (conflict, DO NOTHING)
      [],
      // Call 3: SELECT existing lock holder
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
      expect(result.data.ownedBySelf).toBe(false) // M12: explicit discriminator
      expect(result.data.assignment.assignedTo).toBe(otherUserId)
      expect(result.data.assignment.assigneeName).toBe('Other Reviewer')
    }

    // M11 fix: contested-lock conflict NOW writes a `self_assign_conflict` audit entry
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'self_assign_conflict',
        entityType: 'file_assignment',
        entityId: existingAssignmentId,
      }),
    )
  })

  it('should return own existing assignment when self already holds lock', async () => {
    const existingAssignmentId = faker.string.uuid()

    dbState.returnValues = [
      // Call 1 (H4): SELECT files
      [{ projectId: validInput.projectId }],
      // Call 2: INSERT .returning() → empty (conflict, own lock already exists)
      [],
      // Call 3: SELECT existing — own assignment
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
      expect(result.data.ownedBySelf).toBe(true) // R2-M3: explicit discriminator check
      expect(result.data.assignment.assignedTo).toBe(mockUser.id)
    }
  })

  it('should require write mode auth via requireRole(native_reviewer, write)', async () => {
    dbState.returnValues = [
      // Call 1 (H4): SELECT files
      [{ projectId: validInput.projectId }],
      // Call 2: INSERT
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
      // Call 3: SELECT users.displayName
      [{ displayName: 'Test Reviewer' }],
    ]

    await selfAssignFile(validInput)

    // Auth verification: write mode required (per Guardrail RBAC M3)
    expect(mockRequireRole).toHaveBeenCalledWith('native_reviewer', 'write')
  })

  it('should reject when file does not belong to project (S-FIX-7 H4)', async () => {
    const otherProjectId = faker.string.uuid()
    dbState.returnValues = [
      // Call 1 (H4): SELECT files — file belongs to a DIFFERENT project
      [{ projectId: otherProjectId }],
    ]

    const result = await selfAssignFile(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.error).toContain('does not belong to project')
    }
  })

  it('should return NOT_FOUND when file does not exist', async () => {
    dbState.returnValues = [
      // Call 1 (H4): SELECT files — empty
      [],
    ]

    const result = await selfAssignFile(validInput)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })
})
