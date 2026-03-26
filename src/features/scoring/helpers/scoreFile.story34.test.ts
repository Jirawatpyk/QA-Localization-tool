/** Story 3.4 ATDD — scoreFile partial status support */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

// ── Hoisted mocks ──
const { mockCheckAutoPass, dbState, dbMockModule } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    mockCheckAutoPass: vi.fn((..._args: unknown[]) =>
      Promise.resolve({ eligible: false, rationale: null, isNewPair: false, fileCount: 0 }),
    ),
    dbState,
    dbMockModule,
  }
})

vi.mock('@/features/scoring/autoPassChecker', () => ({
  checkAutoPass: (...args: unknown[]) => mockCheckAutoPass(...args),
}))

vi.mock('@/features/scoring/mqmCalculator', () => ({
  calculateMqmScore: vi.fn((..._args: unknown[]) => ({
    mqmScore: 85.5,
    npt: 14.5,
    totalWords: 300,
    criticalCount: 0,
    majorCount: 1,
    minorCount: 2,
    penaltyPoints: 14.5,
    status: 'calculated',
  })),
}))

vi.mock('@/features/scoring/penaltyWeightLoader', () => ({
  loadPenaltyWeights: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ critical: 25, major: 5, minor: 1 }),
  ),
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((...args: unknown[]) => ({ sql: args })),
}))

vi.mock('@/db/schema/scores', () => ({
  scores: {
    id: 'id',
    tenantId: 'tenant_id',
    fileId: 'file_id',
    status: 'status',
    mqmScore: 'mqm_score',
    layerCompleted: 'layer_completed',
    criticalCount: 'critical_count',
    majorCount: 'major_count',
    minorCount: 'minor_count',
    npt: 'npt',
    totalWords: 'total_words',
    autoPassRationale: 'auto_pass_rationale',
  },
}))

vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    tenantId: 'tenant_id',
    fileId: 'file_id',
    projectId: 'project_id',
    severity: 'severity',
    status: 'status',
    segmentCount: 'segment_count',
    detectedByLayer: 'detected_by_layer',
  },
}))

vi.mock('@/db/schema/segments', () => ({
  segments: {
    id: 'id',
    tenantId: 'tenant_id',
    fileId: 'file_id',
    projectId: 'project_id',
    wordCount: 'word_count',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
  },
}))

vi.mock('@/db/schema/notifications', () => ({
  notifications: {
    id: 'id',
    tenantId: 'tenant_id',
    userId: 'user_id',
    type: 'type',
    title: 'title',
    message: 'message',
    metadata: 'metadata',
  },
}))

vi.mock('@/db/schema/userRoles', () => ({
  userRoles: {
    userId: 'user_id',
    tenantId: 'tenant_id',
    role: 'role',
  },
}))

vi.mock('@/features/scoring/constants', () => ({
  NEW_PAIR_FILE_THRESHOLD: 50,
}))

vi.mock('inngest', () => ({
  NonRetriableError: class NonRetriableError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'NonRetriableError'
    }
  },
}))

// ── Constants ──

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')
const VALID_USER_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'
const VALID_SCORE_ID = 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b'

function buildScoreInput(overrides?: Record<string, unknown>) {
  return {
    fileId: VALID_FILE_ID,
    projectId: VALID_PROJECT_ID,
    tenantId: VALID_TENANT_ID,
    userId: VALID_USER_ID,
    ...overrides,
  }
}

function buildInsertedScore(overrides?: Record<string, unknown>) {
  return {
    id: VALID_SCORE_ID,
    fileId: VALID_FILE_ID,
    projectId: VALID_PROJECT_ID,
    tenantId: VALID_TENANT_ID,
    mqmScore: 85.5,
    npt: 14.5,
    totalWords: 300,
    criticalCount: 0,
    majorCount: 1,
    minorCount: 2,
    status: 'partial',
    layerCompleted: 'L1',
    autoPassRationale: null,
    calculatedAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * DB call sequence in scoreFile:
 * 0: SELECT segments (word count)
 * 1: SELECT findings
 * 2: tx SELECT prev score
 * 3: tx DELETE old score
 * 4: tx INSERT new score .returning()
 */
function setupDbReturns(opts?: {
  prevScore?: Record<string, unknown>
  inserted?: Record<string, unknown>
}) {
  dbState.returnValues = [
    [{ wordCount: 150, sourceLang: 'en', targetLang: 'th' }], // 0: segments
    [{ severity: 'major', status: 'pending', segmentCount: 1 }], // 1: findings
    opts?.prevScore ? [opts.prevScore] : [], // 2: tx prev score
    [], // 3: tx delete
    [opts?.inserted ?? buildInsertedScore()], // 4: tx insert returning
  ]
}

// ── Suite ──

describe('scoreFile — partial status (Story 3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockCheckAutoPass.mockResolvedValue({
      eligible: false,
      rationale: null,
      isNewPair: false,
      fileCount: 0,
    })
  })

  // T22
  it('[P0] should save score with status=partial when scoreStatus param provided', async () => {
    setupDbReturns()

    const { scoreFile } = await import('./scoreFile')
    await scoreFile(buildScoreInput({ scoreStatus: 'partial', layerCompleted: 'L1' }))

    // The INSERT .values() captures include status='partial'
    const insertValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertValues).toBeDefined()
    expect(insertValues.status).toBe('partial')
  })

  // T70
  it('[P0] should NOT trigger auto-pass evaluation when scoreStatus=partial', async () => {
    setupDbReturns({ inserted: buildInsertedScore({ mqmScore: 100 }) })

    const { scoreFile } = await import('./scoreFile')
    await scoreFile(buildScoreInput({ scoreStatus: 'partial', layerCompleted: 'L1' }))

    // checkAutoPass must NOT be called when scoreStatus=partial
    expect(mockCheckAutoPass).not.toHaveBeenCalled()
  })

  it('[P0] should include partial in ScoreFileResult.status union type', async () => {
    setupDbReturns()

    const { scoreFile } = await import('./scoreFile')
    const result = await scoreFile(
      buildScoreInput({ scoreStatus: 'partial', layerCompleted: 'L1' }),
    )

    // Runtime check that status='partial' is returned
    expect(result.status).toBe('partial')
  })

  it('[P1] should pass through layerCompleted override alongside partial status', async () => {
    setupDbReturns({ inserted: buildInsertedScore({ layerCompleted: 'L1L2' }) })

    const { scoreFile } = await import('./scoreFile')
    await scoreFile(buildScoreInput({ scoreStatus: 'partial', layerCompleted: 'L1L2' }))

    // Verify the DB write captured both status and layerCompleted
    const insertValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertValues.status).toBe('partial')
    expect(insertValues.layerCompleted).toBe('L1L2')
  })

  it('[P1] should set autoPassRationale to null when status is partial', async () => {
    setupDbReturns()

    const { scoreFile } = await import('./scoreFile')
    await scoreFile(buildScoreInput({ scoreStatus: 'partial', layerCompleted: 'L1' }))

    const insertValues = dbState.valuesCaptures[0] as Record<string, unknown>
    expect(insertValues.autoPassRationale).toBeNull()
  })
})
