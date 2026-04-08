import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/types/tenant'

vi.mock('server-only', () => ({}))

const TEST_TENANT_ID = asTenantId(faker.string.uuid())
const USER_ID = faker.string.uuid()
const OTHER_USER_ID = faker.string.uuid()
const FILE_ID = faker.string.uuid()

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

import { assertLockOwnership, checkLockOwnership } from './assertLockOwnership'

describe('checkLockOwnership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
  })

  it('should return locked: false when no active assignment exists', async () => {
    dbState.returnValues = [[]]

    const result = await checkLockOwnership(FILE_ID, TEST_TENANT_ID, USER_ID)

    expect(result).toEqual({ locked: false })
  })

  it('should return isOwner: true when current user owns the lock', async () => {
    dbState.returnValues = [[{ assignedTo: USER_ID, assigneeName: 'Test User' }]]

    const result = await checkLockOwnership(FILE_ID, TEST_TENANT_ID, USER_ID)

    expect(result).toEqual({ locked: true, isOwner: true })
  })

  it('should return isOwner: false with lockedBy name when another user owns the lock', async () => {
    dbState.returnValues = [[{ assignedTo: OTHER_USER_ID, assigneeName: 'Other Reviewer' }]]

    const result = await checkLockOwnership(FILE_ID, TEST_TENANT_ID, USER_ID)

    expect(result).toEqual({
      locked: true,
      isOwner: false,
      lockedBy: 'Other Reviewer',
    })
  })
})

describe('assertLockOwnership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
  })

  it('should return null when no lock exists (action proceeds)', async () => {
    dbState.returnValues = [[]]

    const result = await assertLockOwnership(FILE_ID, TEST_TENANT_ID, USER_ID)

    expect(result).toBeNull()
  })

  it('should return null when current user is the lock owner', async () => {
    dbState.returnValues = [[{ assignedTo: USER_ID, assigneeName: 'Test User' }]]

    const result = await assertLockOwnership(FILE_ID, TEST_TENANT_ID, USER_ID)

    expect(result).toBeNull()
  })

  it('should return LOCK_CONFLICT error when another user owns the lock', async () => {
    dbState.returnValues = [[{ assignedTo: OTHER_USER_ID, assigneeName: 'Other Reviewer' }]]

    const result = await assertLockOwnership(FILE_ID, TEST_TENANT_ID, USER_ID)

    expect(result).toEqual({
      success: false,
      error: 'File is being reviewed by another user',
      code: 'LOCK_CONFLICT',
    })
  })
})
