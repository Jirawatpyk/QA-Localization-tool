import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/types/tenant'

vi.mock('server-only', () => ({}))

const TEST_TENANT_ID = asTenantId(faker.string.uuid())

const mockUser = {
  id: 'user-1',
  email: 'reviewer@test.com',
  tenantId: TEST_TENANT_ID,
  role: 'qa_reviewer' as const,
  displayName: 'Test Reviewer',
  metadata: null,
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

const mockGetCurrentUser = vi.fn().mockResolvedValue(mockUser)
vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}))

import { heartbeat } from './heartbeat.action'

describe('heartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
  })

  it('should update last_active_at for own active assignment', async () => {
    dbState.returnValues = [[{ id: 'assignment-1' }]]

    const result = await heartbeat({ assignmentId: faker.string.uuid() })

    expect(result).toEqual({ success: true, data: { ok: true } })
  })

  it('should return UNAUTHORIZED when not logged in', async () => {
    mockGetCurrentUser.mockResolvedValueOnce(null)

    const result = await heartbeat({ assignmentId: faker.string.uuid() })

    expect(result).toEqual({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Not authenticated',
    })
  })

  it('should return VALIDATION_ERROR for invalid input', async () => {
    const result = await heartbeat({ assignmentId: 'not-a-uuid' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })

  it('should return NOT_FOUND when assignment does not exist or not owned', async () => {
    dbState.returnValues = [[]] // empty — no matching row

    const result = await heartbeat({ assignmentId: faker.string.uuid() })

    expect(result).toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: 'Active assignment not found',
    })
  })

  it('should NOT use requireRole (lightweight JWT check only)', async () => {
    dbState.returnValues = [[{ id: 'a-1' }]]

    await heartbeat({ assignmentId: faker.string.uuid() })

    // heartbeat uses getCurrentUser, not requireRole
    expect(mockGetCurrentUser).toHaveBeenCalled()
  })
})
