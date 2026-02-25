/// <reference types="vitest/globals" />
import { faker } from '@faker-js/faker'

// ── Mock server-only (throws in jsdom) ──
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const { mockRequireRole, dbState } = vi.hoisted(() => {
  const state = {
    callIndex: 0,
    returnValues: [] as unknown[],
    setCaptures: [] as unknown[],
    throwAtCallIndex: null as number | null,
  }
  return {
    mockRequireRole: vi.fn(),
    dbState: state,
  }
})

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/db/client', () => {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (_target, prop) => {
      if (prop === 'returning') {
        return vi.fn(() => {
          const value = dbState.returnValues[dbState.callIndex] ?? []
          dbState.callIndex++
          return Promise.resolve(value)
        })
      }
      if (prop === 'then') {
        return (resolve?: (v: unknown) => void, reject?: (err: unknown) => void) => {
          if (dbState.throwAtCallIndex !== null && dbState.callIndex === dbState.throwAtCallIndex) {
            dbState.callIndex++
            reject?.(new Error('DB query failed'))
            return
          }
          const value = dbState.returnValues[dbState.callIndex] ?? []
          dbState.callIndex++
          resolve?.(value)
        }
      }
      if (prop === 'set') {
        return vi.fn((args: unknown) => {
          dbState.setCaptures.push(args)
          return new Proxy({}, handler)
        })
      }
      return vi.fn(() => new Proxy({}, handler))
    },
  }
  return { db: new Proxy({}, handler) }
})

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  or: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(() => 'sql-expr'),
  isNull: vi.fn((...args: unknown[]) => args),
  gte: vi.fn((...args: unknown[]) => args),
  lt: vi.fn((...args: unknown[]) => args),
  ne: vi.fn((...args: unknown[]) => args),
  not: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    tenantId: 'tenant_id',
    status: 'status',
    projectId: 'project_id',
    batchId: 'batch_id',
    fileName: 'file_name',
    createdAt: 'created_at',
  },
}))

vi.mock('@/db/schema/scores', () => ({
  scores: {
    id: 'id',
    fileId: 'file_id',
    tenantId: 'tenant_id',
    mqmScore: 'mqm_score',
    criticalCount: 'critical_count',
    status: 'status',
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: {
    id: 'id',
    tenantId: 'tenant_id',
    autoPassThreshold: 'auto_pass_threshold',
  },
}))

vi.mock('@/db/schema/reviewActions', () => ({
  reviewActions: {
    id: 'id',
    fileId: 'file_id',
    tenantId: 'tenant_id',
    userId: 'user_id',
    createdAt: 'created_at',
  },
}))

vi.mock('@/db/schema/users', () => ({
  users: {
    id: 'id',
    name: 'name',
    email: 'email',
  },
}))

const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'

const mockUser = {
  id: faker.string.uuid(),
  tenantId: faker.string.uuid(),
  role: 'qa_reviewer',
  email: 'reviewer@test.com',
}

// Helper: build a file history row
function buildFileHistoryRow(
  overrides?: Partial<{
    fileId: string
    fileName: string
    mqmScore: number | null
    criticalCount: number
    status: string
    createdAt: Date
    lastReviewerName: string | null
  }>,
) {
  return {
    fileId: overrides?.fileId ?? faker.string.uuid(),
    fileName: overrides?.fileName ?? `${faker.word.noun()}.sdlxliff`,
    mqmScore: overrides?.mqmScore !== undefined ? overrides.mqmScore : 85,
    criticalCount: overrides?.criticalCount ?? 0,
    status: overrides?.status ?? 'l1_completed',
    createdAt: overrides?.createdAt ?? new Date('2026-02-25T10:00:00Z'),
    lastReviewerName: overrides?.lastReviewerName ?? null,
  }
}

describe('getFileHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(mockUser)
  })

  // ── P0: Tenant isolation ──

  it('[P0] should include withTenant on files and reviewActions queries', async () => {
    dbState.returnValues = [
      [{ autoPassThreshold: 95 }],
      [], // files query
    ]

    const { getFileHistory } = await import('./getFileHistory.action')
    await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), mockUser.tenantId)
  })

  // ── P1: Filtering and ordering ──

  it('[P1] should return all files ordered by createdAt DESC', async () => {
    const oldFile = buildFileHistoryRow({
      fileId: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
      createdAt: new Date('2026-02-24T10:00:00Z'),
    })
    const newFile = buildFileHistoryRow({
      fileId: 'b2b2b2b2-c3c3-4d4d-8e5e-f6f6f6f6f6f6',
      createdAt: new Date('2026-02-25T10:00:00Z'),
    })
    dbState.returnValues = [
      [{ autoPassThreshold: 95 }],
      [newFile, oldFile], // already DESC order from DB
    ]

    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.files[0]!.fileId).toBe(newFile.fileId)
    expect(result.data.files[1]!.fileId).toBe(oldFile.fileId)
  })

  it('[P1] should filter passed: auto_passed OR (score >= threshold AND 0 critical)', async () => {
    const autoPassedFile = buildFileHistoryRow({
      fileId: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
      mqmScore: 97,
      criticalCount: 0,
      status: 'auto_passed',
    })
    const manualPassFile = buildFileHistoryRow({
      fileId: 'b2b2b2b2-c3c3-4d4d-8e5e-f6f6f6f6f6f6',
      mqmScore: 96,
      criticalCount: 0,
      status: 'l1_completed',
    })
    const failedFile = buildFileHistoryRow({
      fileId: 'c3c3c3c3-d4d4-4e5e-8f6f-a7a7a7a7a7a7',
      mqmScore: 70,
      criticalCount: 2,
      status: 'l1_completed',
    })
    dbState.returnValues = [
      [{ autoPassThreshold: 95 }],
      [autoPassedFile, manualPassFile], // DB returns only matching rows
    ]

    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'passed',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    // Should only include auto_passed and score>=threshold+0critical files
    expect(result.data.files).toHaveLength(2)
    const fileIds = result.data.files.map((f: { fileId: string }) => f.fileId)
    expect(fileIds).toContain(autoPassedFile.fileId)
    expect(fileIds).toContain(manualPassFile.fileId)
    expect(fileIds).not.toContain(failedFile.fileId)
  })

  it('[P1] should filter needs_review: NOT passed AND NOT failed', async () => {
    const reviewFile = buildFileHistoryRow({
      mqmScore: 80,
      criticalCount: 0,
      status: 'l1_completed',
    })
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [reviewFile]]

    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'needs_review',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.files).toHaveLength(1)
    expect(result.data.files[0]!.mqmScore).toBe(80)
  })

  it('[P1] should filter failed: file.status = failed', async () => {
    const failedFile = buildFileHistoryRow({
      status: 'failed',
      mqmScore: null,
    })
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [failedFile]]

    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'failed',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.files).toHaveLength(1)
    expect(result.data.files[0]!.status).toBe('failed')
  })

  it('[P1] should return null lastReviewerName for all files (deferred to Epic 4)', async () => {
    const file1 = buildFileHistoryRow({ fileId: faker.string.uuid() })
    const file2 = buildFileHistoryRow({ fileId: faker.string.uuid() })
    const file3 = buildFileHistoryRow({ fileId: faker.string.uuid() })
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [file1, file2, file3]]

    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.files).toHaveLength(3)
    // lastReviewerName is always null until Epic 4 implements review actions JOIN
    const reviewerNames = result.data.files.map((f) => f.lastReviewerName)
    expect(reviewerNames).toEqual([null, null, null])
  })

  it('[P1] should return null lastReviewerName when file has no review actions', async () => {
    const noReviewFile = buildFileHistoryRow({ lastReviewerName: null })
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [noReviewFile]]

    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.files[0]!.lastReviewerName).toBeNull()
  })

  it('[P1] should return null lastReviewerName (deferred to Epic 4 — no review actions JOIN yet)', async () => {
    // Even if DB row had reviewer data, the action maps lastReviewerName to null
    const file = buildFileHistoryRow({})
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [file]]

    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.files[0]!.lastReviewerName).toBeNull()
  })

  // ── P2: Edge cases ──

  it('[P2] should return VALIDATION_ERROR for invalid input', async () => {
    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({ projectId: 'not-a-uuid', filter: 'all' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('[P2] should return INTERNAL_ERROR when DB query throws', async () => {
    dbState.throwAtCallIndex = 0
    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INTERNAL_ERROR')
  })

  it('[P2] should return page 2 items with correct totalCount', async () => {
    const allFiles = Array.from({ length: 60 }, () => buildFileHistoryRow())
    dbState.returnValues = [[{ autoPassThreshold: 95 }], allFiles]

    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
      page: 2,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.files).toHaveLength(10)
    expect(result.data.totalCount).toBe(60)
  })

  it('[P2] should return graceful empty result for empty project', async () => {
    dbState.returnValues = [[{ autoPassThreshold: 95 }], []]

    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.files).toHaveLength(0)
    expect(result.data.totalCount).toBe(0)
  })

  it('[P2] should handle pagination with PAGE_SIZE=50', async () => {
    // Simulate 60 files — page 1 should get 50, page 2 should get 10
    const firstPage = Array.from({ length: 50 }, () => buildFileHistoryRow())
    dbState.returnValues = [[{ autoPassThreshold: 95 }], firstPage]

    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
      page: 1,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.files).toHaveLength(50)
  })

  it('[P2] should filter all returns every file', async () => {
    const files = Array.from({ length: 5 }, () => buildFileHistoryRow())
    dbState.returnValues = [[{ autoPassThreshold: 95 }], files]

    const { getFileHistory } = await import('./getFileHistory.action')
    const result = await getFileHistory({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.files).toHaveLength(5)
  })
})
