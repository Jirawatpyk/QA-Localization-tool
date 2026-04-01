import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/types/tenant'

vi.mock('server-only', () => ({}))

const TEST_TENANT_ID = asTenantId(faker.string.uuid())

const PROJECT_ID = faker.string.uuid()
const CURRENT_ASSIGNMENT_ID = faker.string.uuid()
const NEW_ASSIGNMENT_ID = faker.string.uuid()
const USER_TAKER_ID = faker.string.uuid()
const USER_ORIGINAL_ID = faker.string.uuid()
const FILE_ID = faker.string.uuid()

const mockCurrentUser = {
  id: USER_TAKER_ID,
  email: 'taker@test.com',
  tenantId: TEST_TENANT_ID,
  role: 'qa_reviewer' as const,
  nativeLanguages: ['th'],
}

const mockOldAssignment = {
  id: CURRENT_ASSIGNMENT_ID,
  fileId: FILE_ID,
  projectId: PROJECT_ID,
  tenantId: TEST_TENANT_ID,
  assignedTo: USER_ORIGINAL_ID,
  assignedBy: USER_ORIGINAL_ID,
  status: 'assigned',
  priority: 'normal',
  notes: null,
  startedAt: null,
  completedAt: null,
  lastActiveAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockNewAssignment = {
  id: NEW_ASSIGNMENT_ID,
  fileId: FILE_ID,
  projectId: PROJECT_ID,
  tenantId: TEST_TENANT_ID,
  assignedTo: USER_TAKER_ID,
  assignedBy: USER_TAKER_ID,
  status: 'in_progress',
  priority: 'normal',
  startedAt: new Date(),
  completedAt: null,
  lastActiveAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ── Drizzle mock ──
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

const mockRequireRole = vi.fn().mockResolvedValue(mockCurrentUser)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

const mockCreateNotification = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/notifications/createNotification', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  NOTIFICATION_TYPES: {
    FILE_ASSIGNED: 'file_assigned',
    FILE_REASSIGNED: 'file_reassigned',
    FILE_URGENT: 'file_urgent',
    ASSIGNMENT_COMPLETED: 'assignment_completed',
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { takeOverFile } from './takeOverFile.action'

describe('takeOverFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
  })

  it('should successfully take over an assignment', async () => {
    // Call 0: SELECT old assignment check → [{ assignedTo: USER_ORIGINAL_ID }]
    // Call 1 (tx): UPDATE cancel old → [mockOldAssignment]
    // Call 2 (tx): INSERT new → [mockNewAssignment]
    dbState.returnValues = [
      [{ assignedTo: USER_ORIGINAL_ID }],
      [mockOldAssignment],
      [mockNewAssignment],
    ]

    const result = await takeOverFile({
      currentAssignmentId: CURRENT_ASSIGNMENT_ID,
      projectId: PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(NEW_ASSIGNMENT_ID)
      expect(result.data.assignedTo).toBe(USER_TAKER_ID)
      expect(result.data.status).toBe('in_progress')
    }
    expect(mockRequireRole).toHaveBeenCalledWith('qa_reviewer', 'write')
  })

  it('should return FORBIDDEN when requireRole throws', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden'))

    const result = await takeOverFile({
      currentAssignmentId: CURRENT_ASSIGNMENT_ID,
      projectId: PROJECT_ID,
    })

    expect(result).toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'Admin or QA reviewer access required',
    })
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    const result = await takeOverFile({ currentAssignmentId: 'not-a-uuid' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should return CONFLICT when trying to take over own assignment', async () => {
    // Old assignment is assigned to the current user
    dbState.returnValues = [[{ assignedTo: USER_TAKER_ID }]]

    const result = await takeOverFile({
      currentAssignmentId: CURRENT_ASSIGNMENT_ID,
      projectId: PROJECT_ID,
    })

    expect(result).toEqual({
      success: false,
      code: 'CONFLICT',
      error: 'Cannot take over your own assignment',
    })
  })

  it('should return CONFLICT when old assignment no longer active (SELECT phase)', async () => {
    // Empty SELECT → assignment not found / already cancelled
    dbState.returnValues = [[]]

    const result = await takeOverFile({
      currentAssignmentId: CURRENT_ASSIGNMENT_ID,
      projectId: PROJECT_ID,
    })

    expect(result).toEqual({
      success: false,
      code: 'CONFLICT',
      error: 'Assignment no longer active',
    })
  })

  it('should return CONFLICT when cancel returns empty rows (stale in transaction)', async () => {
    // Call 0: SELECT old → found
    // Call 1 (tx): UPDATE cancel → [] (concurrent cancel)
    dbState.returnValues = [[{ assignedTo: USER_ORIGINAL_ID }], []]

    const result = await takeOverFile({
      currentAssignmentId: CURRENT_ASSIGNMENT_ID,
      projectId: PROJECT_ID,
    })

    expect(result).toEqual({
      success: false,
      code: 'CONFLICT',
      error: 'Assignment no longer active — may have been completed or cancelled',
    })
  })

  it('should call writeAuditLog with correct params on success', async () => {
    dbState.returnValues = [
      [{ assignedTo: USER_ORIGINAL_ID }],
      [mockOldAssignment],
      [mockNewAssignment],
    ]

    await takeOverFile({
      currentAssignmentId: CURRENT_ASSIGNMENT_ID,
      projectId: PROJECT_ID,
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TEST_TENANT_ID,
        userId: USER_TAKER_ID,
        entityType: 'file_assignment',
        entityId: NEW_ASSIGNMENT_ID,
        action: 'file_takeover',
        oldValue: expect.objectContaining({
          assignmentId: CURRENT_ASSIGNMENT_ID,
          assignedTo: USER_ORIGINAL_ID,
        }),
        newValue: expect.objectContaining({
          assignmentId: NEW_ASSIGNMENT_ID,
          assignedTo: USER_TAKER_ID,
          status: 'in_progress',
        }),
      }),
    )
  })

  it('should call createNotification for the original assignee with .catch', async () => {
    dbState.returnValues = [
      [{ assignedTo: USER_ORIGINAL_ID }],
      [mockOldAssignment],
      [mockNewAssignment],
    ]

    await takeOverFile({
      currentAssignmentId: CURRENT_ASSIGNMENT_ID,
      projectId: PROJECT_ID,
    })

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TEST_TENANT_ID,
        userId: USER_ORIGINAL_ID,
        type: 'file_reassigned',
        projectId: PROJECT_ID,
      }),
    )
  })
})
