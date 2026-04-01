import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/types/tenant'

vi.mock('server-only', () => ({}))

const TEST_TENANT_ID = asTenantId(faker.string.uuid())

const PROJECT_ID = faker.string.uuid()
const ASSIGNMENT_ID = faker.string.uuid()
const USER_ASSIGNEE_ID = faker.string.uuid()
const USER_ASSIGNER_ID = faker.string.uuid()
const FILE_ID = faker.string.uuid()

const mockCurrentUser = {
  id: USER_ASSIGNEE_ID,
  email: 'reviewer@test.com',
  tenantId: TEST_TENANT_ID,
  role: 'qa_reviewer' as const,
  nativeLanguages: ['th'],
}

const makeAssignment = (overrides: Record<string, unknown> = {}) => ({
  id: ASSIGNMENT_ID,
  fileId: FILE_ID,
  projectId: PROJECT_ID,
  tenantId: TEST_TENANT_ID,
  assignedTo: USER_ASSIGNEE_ID,
  assignedBy: USER_ASSIGNER_ID,
  status: 'assigned',
  priority: 'normal',
  notes: null,
  startedAt: null,
  completedAt: null,
  lastActiveAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

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

import { updateAssignmentStatus } from './updateAssignmentStatus.action'

describe('updateAssignmentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
    dbState.setCaptures.length = 0
    dbState.valuesCaptures.length = 0
  })

  it('should transition assigned→in_progress with startedAt + lastActiveAt set', async () => {
    const currentAssignment = makeAssignment({ status: 'assigned' })
    const updatedAssignment = makeAssignment({
      status: 'in_progress',
      startedAt: new Date(),
      lastActiveAt: new Date(),
    })
    // Call 0: SELECT current assignment
    // Call 1: UPDATE returning
    dbState.returnValues = [[currentAssignment], [updatedAssignment]]

    const result = await updateAssignmentStatus({
      assignmentId: ASSIGNMENT_ID,
      projectId: PROJECT_ID,
      status: 'in_progress',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('in_progress')
    }
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'assignment_status_changed',
        oldValue: { status: 'assigned' },
        newValue: { status: 'in_progress' },
      }),
    )
  })

  it('should transition in_progress→completed with completedAt set and notification sent', async () => {
    const currentAssignment = makeAssignment({ status: 'in_progress' })
    const updatedAssignment = makeAssignment({
      status: 'completed',
      completedAt: new Date(),
    })
    dbState.returnValues = [[currentAssignment], [updatedAssignment]]

    const result = await updateAssignmentStatus({
      assignmentId: ASSIGNMENT_ID,
      projectId: PROJECT_ID,
      status: 'completed',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('completed')
    }
    // Notification sent to assignedBy (not self)
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ASSIGNER_ID,
        type: 'assignment_completed',
      }),
    )
  })

  it('should transition in_progress→assigned (release) with startedAt + lastActiveAt cleared', async () => {
    const currentAssignment = makeAssignment({
      status: 'in_progress',
      startedAt: new Date(),
      lastActiveAt: new Date(),
    })
    const updatedAssignment = makeAssignment({
      status: 'assigned',
      startedAt: null,
      lastActiveAt: null,
    })
    dbState.returnValues = [[currentAssignment], [updatedAssignment]]

    const result = await updateAssignmentStatus({
      assignmentId: ASSIGNMENT_ID,
      projectId: PROJECT_ID,
      status: 'assigned',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('assigned')
    }
    // set() captures should include null for startedAt, lastActiveAt
    expect(dbState.setCaptures.length).toBeGreaterThan(0)
    const setCaptured = dbState.setCaptures[0] as Record<string, unknown>
    expect(setCaptured.startedAt).toBeNull()
    expect(setCaptured.lastActiveAt).toBeNull()
  })

  it('should return INVALID_TRANSITION for completed→in_progress', async () => {
    const currentAssignment = makeAssignment({ status: 'completed' })
    dbState.returnValues = [[currentAssignment]]

    const result = await updateAssignmentStatus({
      assignmentId: ASSIGNMENT_ID,
      projectId: PROJECT_ID,
      status: 'in_progress',
    })

    expect(result).toEqual({
      success: false,
      code: 'INVALID_TRANSITION',
      error: "Cannot transition from 'completed' to 'in_progress'",
    })
  })

  it('should return FORBIDDEN when requireRole throws', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden'))

    const result = await updateAssignmentStatus({
      assignmentId: ASSIGNMENT_ID,
      projectId: PROJECT_ID,
      status: 'in_progress',
    })

    expect(result).toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'Authentication required',
    })
  })

  it('should return FORBIDDEN when user is not assignee/assigner/admin', async () => {
    const otherUserId = faker.string.uuid()
    mockRequireRole.mockResolvedValueOnce({
      ...mockCurrentUser,
      id: otherUserId,
      role: 'native_reviewer' as const,
    })
    const currentAssignment = makeAssignment({ status: 'assigned' })
    dbState.returnValues = [[currentAssignment]]

    const result = await updateAssignmentStatus({
      assignmentId: ASSIGNMENT_ID,
      projectId: PROJECT_ID,
      status: 'in_progress',
    })

    expect(result).toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'Not authorized to update this assignment',
    })
  })

  it('should return NOT_FOUND when assignment does not exist', async () => {
    dbState.returnValues = [[]]

    const result = await updateAssignmentStatus({
      assignmentId: ASSIGNMENT_ID,
      projectId: PROJECT_ID,
      status: 'in_progress',
    })

    expect(result).toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: 'Assignment not found',
    })
  })

  it('should return CONFLICT on concurrent status change', async () => {
    const currentAssignment = makeAssignment({ status: 'assigned' })
    // Call 0: SELECT → found
    // Call 1: UPDATE returning → [] (optimistic lock fail)
    dbState.returnValues = [[currentAssignment], []]

    const result = await updateAssignmentStatus({
      assignmentId: ASSIGNMENT_ID,
      projectId: PROJECT_ID,
      status: 'in_progress',
    })

    expect(result).toEqual({
      success: false,
      code: 'CONFLICT',
      error: 'Assignment status changed concurrently',
    })
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    const result = await updateAssignmentStatus({
      assignmentId: 'not-a-uuid',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })
})
