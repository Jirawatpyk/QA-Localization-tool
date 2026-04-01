import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/types/tenant'

vi.mock('server-only', () => ({}))

const TEST_TENANT_ID = asTenantId(faker.string.uuid())

const mockCurrentUser = {
  id: faker.string.uuid(),
  email: 'admin@test.com',
  tenantId: TEST_TENANT_ID,
  role: 'qa_reviewer' as const,
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
vi.mock('@/db/schema/userRoles', () => ({ userRoles: {} }))
vi.mock('@/db/schema/users', () => ({ users: {} }))

const mockRequireRole = vi.fn().mockResolvedValue(mockCurrentUser)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

import { getEligibleReviewers } from './getEligibleReviewers.action'

describe('getEligibleReviewers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
  })

  it('should return reviewers sorted by workload with auto-suggest on lowest', async () => {
    const reviewers = [
      {
        userId: faker.string.uuid(),
        displayName: 'Alice',
        email: 'alice@test.com',
        role: 'native_reviewer',
        nativeLanguages: ['th'],
        workload: 1,
      },
      {
        userId: faker.string.uuid(),
        displayName: 'Bob',
        email: 'bob@test.com',
        role: 'native_reviewer',
        nativeLanguages: ['th'],
        workload: 3,
      },
    ]
    dbState.returnValues = [reviewers]

    const result = await getEligibleReviewers({ targetLanguage: 'th' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0]!.isAutoSuggested).toBe(true)
      expect(result.data[0]!.workload).toBe(1)
      expect(result.data[1]!.isAutoSuggested).toBe(false)
    }
  })

  it('should return empty array when no matching reviewers', async () => {
    dbState.returnValues = [[]]

    const result = await getEligibleReviewers({ targetLanguage: 'ja' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([])
    }
  })

  it('should not auto-suggest when multiple reviewers have tied workload', async () => {
    const reviewers = [
      {
        userId: faker.string.uuid(),
        displayName: 'Alice',
        email: 'alice@test.com',
        role: 'native_reviewer',
        nativeLanguages: ['th'],
        workload: 2,
      },
      {
        userId: faker.string.uuid(),
        displayName: 'Bob',
        email: 'bob@test.com',
        role: 'native_reviewer',
        nativeLanguages: ['th'],
        workload: 2,
      },
    ]
    dbState.returnValues = [reviewers]

    const result = await getEligibleReviewers({ targetLanguage: 'th' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]!.isAutoSuggested).toBe(false)
      expect(result.data[1]!.isAutoSuggested).toBe(false)
    }
  })

  it('should auto-suggest when only a single reviewer exists', async () => {
    const reviewers = [
      {
        userId: faker.string.uuid(),
        displayName: 'Solo',
        email: 'solo@test.com',
        role: 'native_reviewer',
        nativeLanguages: ['th'],
        workload: 5,
      },
    ]
    dbState.returnValues = [reviewers]

    const result = await getEligibleReviewers({ targetLanguage: 'th' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0]!.isAutoSuggested).toBe(true)
    }
  })

  it('should return FORBIDDEN when requireRole throws', async () => {
    mockRequireRole.mockRejectedValueOnce(new Error('Forbidden'))

    const result = await getEligibleReviewers({ targetLanguage: 'th' })

    expect(result).toEqual({
      success: false,
      code: 'FORBIDDEN',
      error: 'Admin or QA reviewer access required',
    })
  })

  it('should return VALIDATION_ERROR for invalid targetLanguage', async () => {
    const result = await getEligibleReviewers({ targetLanguage: '' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
  })
})
