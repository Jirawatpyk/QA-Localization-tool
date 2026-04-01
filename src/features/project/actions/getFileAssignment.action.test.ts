import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/types/tenant'

vi.mock('server-only', () => ({}))

const TEST_TENANT_ID = asTenantId(faker.string.uuid())

const FILE_ID = faker.string.uuid()
const PROJECT_ID = faker.string.uuid()
const ASSIGNMENT_ID = faker.string.uuid()
const USER_ID = faker.string.uuid()
const ASSIGNEE_ID = faker.string.uuid()

const mockCurrentUser = {
  id: USER_ID,
  email: 'reviewer@test.com',
  tenantId: TEST_TENANT_ID,
  role: 'native_reviewer' as const,
  nativeLanguages: ['th'],
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
vi.mock('@/db/schema/users', () => ({ users: {} }))

const mockRequireRole = vi.fn().mockResolvedValue(mockCurrentUser)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

import { getFileAssignment } from './getFileAssignment.action'

describe('getFileAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
  })

  it('should return assignment with currentUserId on happy path', async () => {
    const dbRow = {
      id: ASSIGNMENT_ID,
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      assignedTo: ASSIGNEE_ID,
      assignedBy: USER_ID,
      status: 'assigned',
      priority: 'normal',
      lastActiveAt: new Date('2026-03-30T12:00:00Z'),
      assigneeName: 'Test Reviewer',
    }
    dbState.returnValues = [[dbRow]]

    const result = await getFileAssignment({ fileId: FILE_ID, projectId: PROJECT_ID })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.currentUserId).toBe(USER_ID)
      expect(result.data.assignment).not.toBeNull()
      expect(result.data.assignment!.id).toBe(ASSIGNMENT_ID)
      expect(result.data.assignment!.assigneeName).toBe('Test Reviewer')
      expect(result.data.assignment!.lastActiveAt).toBe('2026-03-30T12:00:00.000Z')
    }
  })

  it('should return null assignment when no active assignment exists', async () => {
    dbState.returnValues = [[]]

    const result = await getFileAssignment({ fileId: FILE_ID, projectId: PROJECT_ID })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.assignment).toBeNull()
      expect(result.data.currentUserId).toBe(USER_ID)
    }
  })

  it('should return UNAUTHORIZED when requireRole throws', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Not authenticated'))

    const result = await getFileAssignment({ fileId: FILE_ID, projectId: PROJECT_ID })

    expect(result).toEqual({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Not authenticated',
    })
  })

  it('should return VALIDATION_ERROR for invalid fileId format', async () => {
    const result = await getFileAssignment({ fileId: 'not-a-uuid', projectId: PROJECT_ID })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })
})
