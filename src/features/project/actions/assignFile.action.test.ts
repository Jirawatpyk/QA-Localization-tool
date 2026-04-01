import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/types/tenant'

vi.mock('server-only', () => ({}))

const TEST_TENANT_ID = asTenantId(faker.string.uuid())

const FILE_ID = faker.string.uuid()
const PROJECT_ID = faker.string.uuid()
const USER_ADMIN_ID = faker.string.uuid()
const USER_REVIEWER_ID = faker.string.uuid()
const ASSIGNMENT_ID = faker.string.uuid()

const mockCurrentUser = {
  id: USER_ADMIN_ID,
  email: 'admin@test.com',
  tenantId: TEST_TENANT_ID,
  role: 'qa_reviewer' as const,
  nativeLanguages: ['th'],
}

const mockFile = { id: FILE_ID, fileName: 'test.sdlxliff' }
const mockAssignment = {
  id: ASSIGNMENT_ID,
  fileId: FILE_ID,
  projectId: PROJECT_ID,
  tenantId: TEST_TENANT_ID,
  assignedTo: USER_REVIEWER_ID,
  assignedBy: USER_ADMIN_ID,
  status: 'assigned',
  priority: 'normal',
  notes: null,
  startedAt: null,
  completedAt: null,
  lastActiveAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ── Track DB calls explicitly ──
let dbCallIndex = 0
let dbReturnValues: unknown[][] = []
let dbThrowAtCallIndex: number | null = null
let dbThrowError: Error | null = null

const dbProxy = (): unknown =>
  new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'returning') {
          return vi.fn(() => {
            if (dbThrowAtCallIndex !== null && dbCallIndex === dbThrowAtCallIndex) {
              dbCallIndex++
              return Promise.reject(dbThrowError ?? new Error('DB error'))
            }
            const value = dbReturnValues[dbCallIndex] ?? []
            dbCallIndex++
            return Promise.resolve(value)
          })
        }
        if (prop === 'then') {
          return (resolve?: (v: unknown) => void, reject?: (err: unknown) => void) => {
            if (dbThrowAtCallIndex !== null && dbCallIndex === dbThrowAtCallIndex) {
              dbCallIndex++
              reject?.(dbThrowError ?? new Error('DB error'))
              return
            }
            const value = dbReturnValues[dbCallIndex] ?? []
            dbCallIndex++
            resolve?.(value)
          }
        }
        if (prop === 'values') {
          return vi.fn(() => dbProxy())
        }
        return vi.fn(() => dbProxy())
      },
    },
  )

vi.mock('@/db/client', () => ({
  db: new Proxy(
    {},
    {
      get: () => vi.fn(() => dbProxy()),
    },
  ),
}))

vi.mock('@/db/helpers/withTenant', () => ({ withTenant: vi.fn() }))
vi.mock('@/db/schema/fileAssignments', () => ({ fileAssignments: {} }))
vi.mock('@/db/schema/files', () => ({ files: {} }))

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

import { assignFile } from './assignFile.action'

describe('assignFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbCallIndex = 0
    dbReturnValues = []
    dbThrowAtCallIndex = null
    dbThrowError = null
  })

  it('should create an assignment with valid input', async () => {
    // Call 0: SELECT file → [mockFile]
    // Call 1: INSERT + returning → [mockAssignment]
    dbReturnValues = [[mockFile], [mockAssignment]]

    const result = await assignFile({
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      assignedTo: USER_REVIEWER_ID,
      priority: 'normal',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(ASSIGNMENT_ID)
      expect(result.data.status).toBe('assigned')
    }
    expect(mockRequireRole).toHaveBeenCalledWith('qa_reviewer', 'write')
    expect(mockWriteAuditLog).toHaveBeenCalled()
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'file_assigned',
        userId: USER_REVIEWER_ID,
      }),
    )
  })

  it('should return FORBIDDEN when not authorized', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden'))

    const result = await assignFile({
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      assignedTo: USER_REVIEWER_ID,
    })

    expect(result).toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'Admin or QA reviewer access required',
    })
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    const result = await assignFile({ fileId: 'not-a-uuid' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should return NOT_FOUND when file does not exist', async () => {
    dbReturnValues = [[]] // empty file query

    const result = await assignFile({
      fileId: faker.string.uuid(),
      projectId: faker.string.uuid(),
      assignedTo: faker.string.uuid(),
    })

    expect(result).toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: 'File not found in project',
    })
  })

  it('should return CONFLICT when db.insert throws unique constraint (23505)', async () => {
    dbReturnValues = [[mockFile]] // Call 0: SELECT file → found
    // Call 1: INSERT returning → reject with 23505
    const pgError = new Error('unique_violation') as Error & { code: string }
    pgError.code = '23505'
    dbThrowAtCallIndex = 1
    dbThrowError = pgError

    const result = await assignFile({
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      assignedTo: USER_REVIEWER_ID,
      priority: 'normal',
    })

    expect(result).toEqual({
      success: false,
      code: 'CONFLICT',
      error: 'File already has an active assignment',
    })
  })

  it('should return CREATE_FAILED when db.insert returns empty array', async () => {
    // Call 0: SELECT file → found
    // Call 1: INSERT returning → [] (empty)
    dbReturnValues = [[mockFile], []]

    const result = await assignFile({
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      assignedTo: USER_REVIEWER_ID,
      priority: 'normal',
    })

    expect(result).toEqual({
      success: false,
      code: 'CREATE_FAILED',
      error: 'Failed to create assignment',
    })
  })

  it('should send urgent notification for urgent priority', async () => {
    dbReturnValues = [[mockFile], [{ ...mockAssignment, priority: 'urgent' }]]

    const result = await assignFile({
      fileId: FILE_ID,
      projectId: PROJECT_ID,
      assignedTo: USER_REVIEWER_ID,
      priority: 'urgent',
    })

    expect(result.success).toBe(true)
    // 2 notifications: file_assigned + file_urgent
    expect(mockCreateNotification).toHaveBeenCalledTimes(2)
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'file_urgent' }),
    )
  })
})
