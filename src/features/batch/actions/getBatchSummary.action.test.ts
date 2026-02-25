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
  sql: vi.fn(() => 'sql-expr'),
  desc: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((...args: unknown[]) => args),
  isNull: vi.fn((...args: unknown[]) => args),
  max: vi.fn((...args: unknown[]) => args),
  min: vi.fn((...args: unknown[]) => args),
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

vi.mock('@/db/schema/uploadBatches', () => ({
  uploadBatches: {
    id: 'id',
    tenantId: 'tenant_id',
    projectId: 'project_id',
  },
}))

const VALID_BATCH_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'

const mockUser = {
  id: faker.string.uuid(),
  tenantId: faker.string.uuid(),
  role: 'qa_reviewer',
  email: 'reviewer@test.com',
}

// Helper: build a file row with score data for testing classification
function buildFileWithScore(
  overrides?: Partial<{
    fileId: string
    fileName: string
    mqmScore: number | null
    criticalCount: number
    status: string
    createdAt: Date
    updatedAt: Date
  }>,
) {
  return {
    fileId: overrides?.fileId ?? faker.string.uuid(),
    fileName: overrides?.fileName ?? `${faker.word.noun()}.sdlxliff`,
    mqmScore: overrides?.mqmScore !== undefined ? overrides.mqmScore : 97,
    criticalCount: overrides?.criticalCount ?? 0,
    status: overrides?.status ?? 'l1_completed',
    createdAt: overrides?.createdAt ?? new Date('2026-02-25T10:00:00Z'),
    updatedAt: overrides?.updatedAt ?? new Date('2026-02-25T10:05:00Z'),
  }
}

describe('getBatchSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue(mockUser)
  })

  // ── P0: Core behavior ──

  it('[P0] should return ActionResult with both groups for valid batch', async () => {
    // Setup: project with threshold 95, 2 files — one pass, one needs review
    const passFile = buildFileWithScore({ mqmScore: 97, criticalCount: 0 })
    const reviewFile = buildFileWithScore({ mqmScore: 80, criticalCount: 0 })
    dbState.returnValues = [
      [{ autoPassThreshold: 95 }], // project query
      [passFile, reviewFile], // files + scores JOIN query
    ]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    const result = await getBatchSummary({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveProperty('recommendedPass')
    expect(result.data).toHaveProperty('needReview')
    expect(result.data.recommendedPass).toBeInstanceOf(Array)
    expect(result.data.needReview).toBeInstanceOf(Array)
  })

  it('[P0] should partition ALL files into exactly 2 groups with no overlap', async () => {
    const files = Array.from({ length: 5 }, (_, i) =>
      buildFileWithScore({
        fileId: faker.string.uuid(),
        mqmScore: i < 3 ? 97 : 80,
        criticalCount: 0,
      }),
    )
    dbState.returnValues = [[{ autoPassThreshold: 95 }], files]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    const result = await getBatchSummary({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    const passIds = result.data.recommendedPass.map((f: { fileId: string }) => f.fileId)
    const reviewIds = result.data.needReview.map((f: { fileId: string }) => f.fileId)

    // No overlap: intersection must be empty
    const overlap = passIds.filter((id: string) => reviewIds.includes(id))
    expect(overlap).toHaveLength(0)

    // Complete partition: every file in exactly one group
    expect(passIds.length + reviewIds.length).toBe(5)
  })

  it('[P0] should classify file as Recommended Pass when score >= threshold AND criticalCount=0', async () => {
    const passFile = buildFileWithScore({ mqmScore: 96, criticalCount: 0 })
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [passFile]]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    const result = await getBatchSummary({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.recommendedPass).toHaveLength(1)
    expect(result.data.needReview).toHaveLength(0)
  })

  it('[P0] should classify file as Need Review when criticalCount > 0 even if score >= threshold', async () => {
    const criticalFile = buildFileWithScore({ mqmScore: 98, criticalCount: 1 })
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [criticalFile]]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    const result = await getBatchSummary({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.recommendedPass).toHaveLength(0)
    expect(result.data.needReview).toHaveLength(1)
  })

  it('[P0] should classify file as Need Review when score is null', async () => {
    const nullScoreFile = buildFileWithScore({ mqmScore: null, criticalCount: 0 })
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [nullScoreFile]]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    const result = await getBatchSummary({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.recommendedPass).toHaveLength(0)
    expect(result.data.needReview).toHaveLength(1)
  })

  it('[P0] should include withTenant filter on files query and scores JOIN', async () => {
    dbState.returnValues = [[{ autoPassThreshold: 95 }], []]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    await getBatchSummary({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    // withTenant must be called at least once with the user's tenantId
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), mockUser.tenantId)
  })

  // ── P1: Sorting and defaults ──

  it('[P1] should sort Recommended Pass by score DESC then file_id ASC', async () => {
    const fileA = buildFileWithScore({
      fileId: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
      mqmScore: 98,
      criticalCount: 0,
    })
    const fileB = buildFileWithScore({
      fileId: 'b2b2b2b2-c3c3-4d4d-8e5e-f6f6f6f6f6f6',
      mqmScore: 99,
      criticalCount: 0,
    })
    const fileC = buildFileWithScore({
      fileId: 'c3c3c3c3-d4d4-4e5e-8f6f-a7a7a7a7a7a7',
      mqmScore: 98,
      criticalCount: 0,
    })

    dbState.returnValues = [[{ autoPassThreshold: 95 }], [fileA, fileB, fileC]]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    const result = await getBatchSummary({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    const passFiles = result.data.recommendedPass
    // Score DESC: 99 first, then 98s; same score → file_id ASC
    expect(passFiles[0]!.fileId).toBe(fileB.fileId)
    expect(passFiles[1]!.fileId).toBe(fileA.fileId)
    expect(passFiles[2]!.fileId).toBe(fileC.fileId)
  })

  it('[P1] should sort Need Review by score ASC then file_id ASC', async () => {
    const fileA = buildFileWithScore({
      fileId: 'a1a1a1a1-b2b2-4c3c-8d4d-e5e5e5e5e5e5',
      mqmScore: 70,
      criticalCount: 0,
    })
    const fileB = buildFileWithScore({
      fileId: 'b2b2b2b2-c3c3-4d4d-8e5e-f6f6f6f6f6f6',
      mqmScore: 60,
      criticalCount: 0,
    })
    const fileC = buildFileWithScore({
      fileId: 'c3c3c3c3-d4d4-4e5e-8f6f-a7a7a7a7a7a7',
      mqmScore: 70,
      criticalCount: 0,
    })

    dbState.returnValues = [[{ autoPassThreshold: 95 }], [fileA, fileB, fileC]]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    const result = await getBatchSummary({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    const reviewFiles = result.data.needReview
    // Score ASC: 60 first, then 70s; same score → file_id ASC
    expect(reviewFiles[0]!.fileId).toBe(fileB.fileId)
    expect(reviewFiles[1]!.fileId).toBe(fileA.fileId)
    expect(reviewFiles[2]!.fileId).toBe(fileC.fileId)
  })

  it('[P1] should produce stable sort when files have identical scores', async () => {
    const files = Array.from({ length: 4 }, (_, i) =>
      buildFileWithScore({
        fileId: `${String.fromCharCode(97 + i)}1${String.fromCharCode(97 + i)}1${String.fromCharCode(97 + i)}1${String.fromCharCode(97 + i)}1-b2b2-4c3c-8d4d-e5e5e5e5e5e5`,
        mqmScore: 80,
        criticalCount: 0,
      }),
    )
    dbState.returnValues = [[{ autoPassThreshold: 95 }], files]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    const result1 = await getBatchSummary({ batchId: VALID_BATCH_ID, projectId: VALID_PROJECT_ID })
    // Reset for second call
    dbState.callIndex = 0
    dbState.returnValues = [[{ autoPassThreshold: 95 }], files]
    const result2 = await getBatchSummary({ batchId: VALID_BATCH_ID, projectId: VALID_PROJECT_ID })

    expect(result1.success).toBe(true)
    expect(result2.success).toBe(true)
    if (!result1.success || !result2.success) return
    // Stable: same input → same order
    const ids1 = result1.data.needReview.map((f: { fileId: string }) => f.fileId)
    const ids2 = result2.data.needReview.map((f: { fileId: string }) => f.fileId)
    expect(ids1).toEqual(ids2)
  })

  it('[P1] should use default threshold 95 when project autoPassThreshold is null', async () => {
    // Score of 96 should pass with default threshold 95
    const passFile = buildFileWithScore({ mqmScore: 96, criticalCount: 0 })
    dbState.returnValues = [
      [{ autoPassThreshold: null }], // project has no threshold set
      [passFile],
    ]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    const result = await getBatchSummary({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.recommendedPass).toHaveLength(1)
    expect(result.data.needReview).toHaveLength(0)
  })

  it('[P1] should calculate processing time as MAX(updatedAt) - MIN(createdAt)', async () => {
    const file1 = buildFileWithScore({
      mqmScore: 97,
      criticalCount: 0,
      createdAt: new Date('2026-02-25T10:00:00Z'),
      updatedAt: new Date('2026-02-25T10:05:00Z'),
    })
    const file2 = buildFileWithScore({
      mqmScore: 80,
      criticalCount: 0,
      createdAt: new Date('2026-02-25T10:01:00Z'),
      updatedAt: new Date('2026-02-25T10:10:00Z'),
    })
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [file1, file2]]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    const result = await getBatchSummary({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    // MAX(updatedAt) = 10:10:00, MIN(createdAt) = 10:00:00 => 600 seconds = 600000 ms
    expect(result.data.processingTimeMs).toBe(600_000)
  })

  // ── P2: Edge cases ──

  it('[P2] should return empty groups and zero counts for empty batch', async () => {
    dbState.returnValues = [
      [{ autoPassThreshold: 95 }],
      [], // no files in batch
    ]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    const result = await getBatchSummary({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.recommendedPass).toHaveLength(0)
    expect(result.data.needReview).toHaveLength(0)
    expect(result.data.totalFiles).toBe(0)
  })

  it('[P2] should return null processing time when all files still processing', async () => {
    const processingFile = buildFileWithScore({
      mqmScore: null,
      criticalCount: 0,
      status: 'l1_processing',
    })
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [processingFile]]

    const { getBatchSummary } = await import('./getBatchSummary.action')
    const result = await getBatchSummary({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.processingTimeMs).toBeNull()
  })
})
