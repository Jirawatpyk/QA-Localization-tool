import { faker } from '@faker-js/faker'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { asTenantId } from '@/types/tenant'

vi.mock('server-only', () => ({}))

// R3-P2: spy on drizzle `inArray` so we can assert the R2-D2 admin-exclusion
// filter is actually passed to the JOIN predicate. The behavioral test alone
// is a no-op because the drizzle mock doesn't enforce SQL — we need to verify
// the call site directly. We capture every `inArray` invocation and search
// for one matching `REVIEWER_ROLES`.
const mockInArrayCalls: unknown[][] = []
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    inArray: (...args: unknown[]) => {
      mockInArrayCalls.push(args)
      return actual.inArray(args[0] as never, args[1] as never)
    },
  }
})

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
    mockInArrayCalls.length = 0
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

  it('should auto-suggest the first-sorted matched reviewer even when workloads tie (D2)', async () => {
    // Previously, a strict `<` comparison suppressed the star whenever two
    // matched reviewers tied on workload. D2 fix: SQL ORDER BY already provides
    // a deterministic tie-break, so the first matched row always wins.
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
      expect(result.data[0]!.isAutoSuggested).toBe(true)
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

  it('should set isLanguageMatch=true for all results when includeAll=false (default)', async () => {
    const reviewers = [
      {
        userId: faker.string.uuid(),
        displayName: 'Alice',
        email: 'alice@test.com',
        role: 'native_reviewer',
        nativeLanguages: ['th'],
        workload: 1,
      },
    ]
    dbState.returnValues = [reviewers]

    const result = await getEligibleReviewers({ targetLanguage: 'th' })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]!.isLanguageMatch).toBe(true)
    }
  })

  it('should compute isLanguageMatch per reviewer when includeAll=true', async () => {
    // includeAll requires admin role (P1 security gate)
    mockRequireRole.mockResolvedValueOnce({ ...mockCurrentUser, role: 'admin' })
    const reviewers = [
      {
        userId: faker.string.uuid(),
        displayName: 'Matched',
        email: 'matched@test.com',
        role: 'native_reviewer',
        nativeLanguages: ['th', 'ja'],
        workload: 0,
      },
      {
        userId: faker.string.uuid(),
        displayName: 'Unmatched',
        email: 'unmatched@test.com',
        role: 'qa_reviewer',
        nativeLanguages: ['en'],
        workload: 2,
      },
      {
        userId: faker.string.uuid(),
        displayName: 'NullLangs',
        email: 'null@test.com',
        role: 'qa_reviewer',
        nativeLanguages: null,
        workload: 1,
      },
    ]
    dbState.returnValues = [reviewers]

    const result = await getEligibleReviewers({ targetLanguage: 'th', includeAll: true })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(3)
      expect(result.data[0]!.isLanguageMatch).toBe(true) // Matched
      expect(result.data[1]!.isLanguageMatch).toBe(false) // Unmatched
      expect(result.data[2]!.isLanguageMatch).toBe(false) // null langs
      // Only the matched reviewer should be auto-suggested
      expect(result.data[0]!.isAutoSuggested).toBe(true)
      expect(result.data[1]!.isAutoSuggested).toBe(false)
      expect(result.data[2]!.isAutoSuggested).toBe(false)
    }
  })

  it('should not auto-suggest any reviewer when includeAll=true and none match target language', async () => {
    // includeAll requires admin role (P1 security gate)
    mockRequireRole.mockResolvedValueOnce({ ...mockCurrentUser, role: 'admin' })
    const reviewers = [
      {
        userId: faker.string.uuid(),
        displayName: 'OnlyEn',
        email: 'en@test.com',
        role: 'qa_reviewer',
        nativeLanguages: ['en'],
        workload: 0,
      },
    ]
    dbState.returnValues = [reviewers]

    const result = await getEligibleReviewers({ targetLanguage: 'th', includeAll: true })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]!.isLanguageMatch).toBe(false)
      expect(result.data[0]!.isAutoSuggested).toBe(false)
    }
  })

  it('should return FORBIDDEN when non-admin requests includeAll=true (P1 security gate)', async () => {
    // Default mockCurrentUser has role 'qa_reviewer' — must be rejected.
    const result = await getEligibleReviewers({ targetLanguage: 'th', includeAll: true })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('R2-D2 + R3-P2: should invoke inArray with REVIEWER_ROLES in the JOIN predicate', async () => {
    // R3-P2 upgrade: directly verify the SQL-level filter is constructed,
    // not just that the mock output happens to lack admins. The spy on
    // drizzle `inArray` (module-level mock above) captures every call — we
    // assert one was made with the reviewer-role tuple.
    mockRequireRole.mockResolvedValueOnce({ ...mockCurrentUser, role: 'admin' })
    dbState.returnValues = [[]] // empty result — we're testing the call site, not the data

    await getEligibleReviewers({ targetLanguage: 'th', includeAll: true })

    // Find an inArray call whose 2nd argument is exactly the reviewer-role tuple.
    // Other inArray calls in the same action (e.g., fileAssignments.status) must
    // not mask this one.
    const roleFilterCall = mockInArrayCalls.find((args) => {
      const values = args[1]
      return (
        Array.isArray(values) &&
        values.length === 2 &&
        values.includes('qa_reviewer') &&
        values.includes('native_reviewer') &&
        !values.includes('admin')
      )
    })
    expect(roleFilterCall).toBeDefined()
  })

  it('R2-D2: should also filter admins when includeAll=false (default path)', async () => {
    dbState.returnValues = [[]]

    await getEligibleReviewers({ targetLanguage: 'th' })

    // Same predicate must be applied on the default (language-matched) path.
    const roleFilterCall = mockInArrayCalls.find((args) => {
      const values = args[1]
      return (
        Array.isArray(values) &&
        values.includes('qa_reviewer') &&
        values.includes('native_reviewer') &&
        !values.includes('admin')
      )
    })
    expect(roleFilterCall).toBeDefined()
  })

  // ---- R4-P1: read-side canonicalization of targetLanguage ----

  it('R4-P1: should normalize targetLanguage before SQL JSONB compare (th-TH → th-th)', async () => {
    // A reviewer was stored with canonical form `['th-th']` by R3-P1 on write.
    // The file's project targetLanguage is `th-TH` (common real-world form).
    // Without R4-P1, the JSONB `@>` compare fails (case-sensitive) and the
    // reviewer is invisible. With R4-P1, targetLanguage is canonicalized to
    // `th-th` before the query, so the stored reviewer matches.
    const reviewers = [
      {
        userId: faker.string.uuid(),
        displayName: 'Canonical Reviewer',
        email: 'canon@test.com',
        role: 'native_reviewer',
        nativeLanguages: ['th-th'], // canonical form in DB
        workload: 0,
      },
    ]
    dbState.returnValues = [reviewers]

    const result = await getEligibleReviewers({ targetLanguage: 'th-TH' }) // uppercase input

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0]!.userId).toBe(reviewers[0]!.userId)
      expect(result.data[0]!.isLanguageMatch).toBe(true)
    }
  })

  it('R4-P1: includeAll path should compute isLanguageMatch using canonicalized targetLanguage', async () => {
    mockRequireRole.mockResolvedValueOnce({ ...mockCurrentUser, role: 'admin' })
    const reviewers = [
      {
        userId: faker.string.uuid(),
        displayName: 'Matched',
        email: 'matched@test.com',
        role: 'native_reviewer',
        nativeLanguages: ['th-th'], // canonical
        workload: 0,
      },
      {
        userId: faker.string.uuid(),
        displayName: 'Unmatched',
        email: 'unmatched@test.com',
        role: 'qa_reviewer',
        nativeLanguages: ['ja-jp'], // canonical but different
        workload: 1,
      },
    ]
    dbState.returnValues = [reviewers]

    const result = await getEligibleReviewers({
      targetLanguage: 'TH-TH', // uppercase input — must normalize to th-th
      includeAll: true,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      const matched = result.data.find((r) => r.displayName === 'Matched')
      const unmatched = result.data.find((r) => r.displayName === 'Unmatched')
      expect(matched?.isLanguageMatch).toBe(true)
      expect(matched?.isAutoSuggested).toBe(true)
      expect(unmatched?.isLanguageMatch).toBe(false)
    }
  })
})
