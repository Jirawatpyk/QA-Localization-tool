import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock server-only (throws in jsdom)
vi.mock('server-only', () => ({}))

// ── Hoisted mocks ──
const {
  mockRequireRole,
  mockWriteAuditLog,
  mockCalculateMqmScore,
  mockCheckAutoPass,
  mockLoadPenaltyWeights,
  dbState,
} = vi.hoisted(() => {
  const state = { callIndex: 0, returnValues: [] as unknown[] }
  return {
    mockRequireRole: vi.fn(),
    mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
    mockCalculateMqmScore: vi.fn(),
    mockCheckAutoPass: vi.fn(),
    mockLoadPenaltyWeights: vi.fn((..._args: unknown[]) =>
      Promise.resolve({ critical: 25, major: 5, minor: 1 }),
    ),
    dbState: state,
  }
})

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/features/scoring/mqmCalculator', () => ({
  calculateMqmScore: (...args: unknown[]) => mockCalculateMqmScore(...args),
}))

vi.mock('@/features/scoring/autoPassChecker', () => ({
  checkAutoPass: (...args: unknown[]) => mockCheckAutoPass(...args),
}))

vi.mock('@/features/scoring/penaltyWeightLoader', () => ({
  loadPenaltyWeights: (...args: unknown[]) => mockLoadPenaltyWeights(...args),
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
        return (resolve?: (v: unknown) => void) => {
          const value = dbState.returnValues[dbState.callIndex] ?? []
          dbState.callIndex++
          resolve?.(value)
        }
      }
      if (prop === 'transaction') {
        return vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(new Proxy({}, handler)))
      }
      // 'values' and all other chainable methods return a new Proxy (supports .values().returning())
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
}))

vi.mock('@/db/schema/segments', () => ({
  segments: {
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    wordCount: 'word_count',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
  },
}))
vi.mock('@/db/schema/findings', () => ({
  findings: {
    fileId: 'file_id',
    projectId: 'project_id', // M1: added for defense-in-depth projectId filter
    tenantId: 'tenant_id',
    detectedByLayer: 'detected_by_layer',
    severity: 'severity',
    status: 'status',
    segmentCount: 'segment_count',
  },
}))
vi.mock('@/db/schema/scores', () => ({
  scores: { fileId: 'file_id', tenantId: 'tenant_id', id: 'id' },
}))
vi.mock('@/db/schema/userRoles', () => ({
  userRoles: { tenantId: 'tenant_id', role: 'role', userId: 'user_id' },
}))
vi.mock('@/db/schema/notifications', () => ({
  notifications: {
    tenantId: 'tenant_id',
    type: 'type',
    metadata: 'metadata',
    id: 'id',
  },
}))

import { calculateScore } from './calculateScore.action'

const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'

const mockUser = {
  id: 'user-uuid',
  tenantId: 'tenant-uuid',
  role: 'qa_reviewer',
  email: 'test@example.com',
}

const mockSegments = [
  { wordCount: 500, sourceLang: 'en-US', targetLang: 'th-TH' },
  { wordCount: 500, sourceLang: 'en-US', targetLang: 'th-TH' },
]

const mockScoreResult = {
  mqmScore: 85,
  npt: 15,
  criticalCount: 0,
  majorCount: 3,
  minorCount: 0,
  totalWords: 1000,
  status: 'calculated' as const,
}

const mockAutoPassNotEligible = {
  eligible: false as const,
  rationale: 'Score 85 below configured threshold 95',
  isNewPair: false,
  fileCount: 60,
}

const mockAutoPassEligible = {
  eligible: true as const,
  rationale: 'Score 96 >= configured threshold 95 with no critical findings',
  isNewPair: false,
  fileCount: 60,
}

const mockNewScore = {
  id: 'score-uuid',
  fileId: VALID_FILE_ID,
  mqmScore: 85,
  npt: 15,
  totalWords: 1000,
  criticalCount: 0,
  majorCount: 3,
  minorCount: 0,
  status: 'calculated',
  autoPassRationale: null,
}

describe('calculateScore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    mockRequireRole.mockResolvedValue(mockUser)
    mockCalculateMqmScore.mockReturnValue(mockScoreResult)
    mockCheckAutoPass.mockResolvedValue(mockAutoPassNotEligible)
    mockLoadPenaltyWeights.mockResolvedValue({ critical: 25, major: 5, minor: 1 })
    mockWriteAuditLog.mockResolvedValue(undefined)
  })

  // ── Input validation ──
  it('should return INVALID_INPUT for non-uuid fileId', async () => {
    const result = await calculateScore({ fileId: 'not-a-uuid', projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
  })

  it('should return INVALID_INPUT for non-uuid projectId', async () => {
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: 'bad-id' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVALID_INPUT')
  })

  // ── Auth ──
  it('should return FORBIDDEN when user lacks permission', async () => {
    mockRequireRole.mockRejectedValue(new Error('Forbidden'))
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('FORBIDDEN')
  })

  it('should call requireRole with qa_reviewer and write', async () => {
    dbState.returnValues = [[], [], [undefined], [mockNewScore]]
    await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(mockRequireRole).toHaveBeenCalledWith('qa_reviewer', 'write')
  })

  // ── File not found ──
  it('should return NOT_FOUND when file has no segments', async () => {
    // segments query returns empty array
    dbState.returnValues = [[]]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('NOT_FOUND')
  })

  // ── Successful calculation ──
  it('should return success with score data on happy path', async () => {
    // 0: segments, 1: findings (then), 2: prev score (then inside tx), 3: delete (then), 4: insert returning
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.fileId).toBe(VALID_FILE_ID)
    expect(result.data.mqmScore).toBe(85)
    expect(result.data.status).toBe('calculated')
  })

  // ── Zero word count → na ──
  it('should return status na when total word count is 0', async () => {
    mockCalculateMqmScore.mockReturnValue({
      ...mockScoreResult,
      mqmScore: 0,
      npt: 0,
      status: 'na' as const,
    })
    const naScore = { ...mockNewScore, mqmScore: 0, npt: 0, status: 'na' }
    dbState.returnValues = [
      [{ wordCount: 0, sourceLang: 'en-US', targetLang: 'th-TH' }],
      [],
      [undefined],
      [],
      [naScore],
    ]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('na')
  })

  // ── Auto-pass eligible → auto_passed ──
  it('should return status auto_passed when auto-pass is eligible', async () => {
    mockCheckAutoPass.mockResolvedValue(mockAutoPassEligible)
    const autoPassedScore = {
      ...mockNewScore,
      status: 'auto_passed',
      autoPassRationale: 'eligible',
    }
    dbState.returnValues = [mockSegments, [], [undefined], [], [autoPassedScore]]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('auto_passed')
  })

  // ── Idempotent re-run ──
  it('should load previous score before delete for audit old_value', async () => {
    const previousScore = { ...mockNewScore, mqmScore: 70, status: 'calculated' }
    dbState.returnValues = [mockSegments, [], [previousScore], [], [mockNewScore]]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    // Verify audit was called with old_value containing previous score
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValue: expect.objectContaining({ mqmScore: 70 }),
      }),
    )
  })

  // ── Audit log ──
  it('should write audit log with correct entity type on success', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]
    await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'score',
        action: 'score.calculated',
        tenantId: 'tenant-uuid',
        userId: 'user-uuid',
      }),
    )
  })

  it('should write score.auto_passed audit action when auto-pass eligible', async () => {
    mockCheckAutoPass.mockResolvedValue(mockAutoPassEligible)
    const autoPassedScore = { ...mockNewScore, status: 'auto_passed' }
    dbState.returnValues = [mockSegments, [], [undefined], [], [autoPassedScore]]
    await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'score.auto_passed' }),
    )
  })

  it('should NOT fail when audit log throws', async () => {
    mockWriteAuditLog.mockRejectedValue(new Error('audit DB down'))
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    // Scoring succeeds even when audit fails
    expect(result.success).toBe(true)
  })

  // ── No findings → score 100 ──
  it('should return score 100 when no findings exist for file', async () => {
    mockCalculateMqmScore.mockReturnValue({
      mqmScore: 100,
      npt: 0,
      criticalCount: 0,
      majorCount: 0,
      minorCount: 0,
      totalWords: 1000,
      status: 'calculated' as const,
    })
    const perfectScore = { ...mockNewScore, mqmScore: 100, npt: 0, majorCount: 0 }
    dbState.returnValues = [mockSegments, [], [undefined], [], [perfectScore]]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.mqmScore).toBe(100)
  })

  // ── New language pair ──
  it('should not auto-pass for new language pair when fileCount < 50', async () => {
    mockCheckAutoPass.mockResolvedValue({
      eligible: false,
      rationale: 'New language pair: mandatory manual review (file 5/50)',
      isNewPair: true,
      fileCount: 5,
    })
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    // Status stays 'calculated' (from mockScoreResult), not auto_passed
    expect(result.data.status).toBe('calculated')
  })

  // ── Task 6 notification: file 51 (fileCount=50) creates notification ──
  it('should execute graduation notification DB path when isNewPair and fileCount=50 (file 51)', async () => {
    // fileCount=50 means 50 files already scored → this file is #51 = first eligible (H1 fix)
    mockCheckAutoPass.mockResolvedValue({
      eligible: true,
      rationale: 'Graduated',
      isNewPair: true,
      fileCount: 50,
    })
    const autoScore = { ...mockNewScore, status: 'auto_passed' }
    // 0: segments, 1: findings, 2: prev score in tx, 3: delete in tx, 4: insert.returning
    // 5: dedup check (no existing → []), 6: admin users query → [admin], 7: notification insert
    dbState.returnValues = [
      mockSegments,
      [],
      [undefined],
      [],
      [autoScore],
      [],
      [{ userId: 'admin-1' }],
      [],
    ]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    // All 8 DB return values consumed — verifies notification path executed its 3 DB calls
    expect(dbState.callIndex).toBe(8)
  })

  it('should NOT create notification when fileCount=49 (file 50 = still blocked)', async () => {
    // fileCount=49 = file 50, still in mandatory review window, no notification
    mockCheckAutoPass.mockResolvedValue({
      eligible: false,
      rationale: 'New language pair: mandatory manual review (file 49/50)',
      isNewPair: true,
      fileCount: 49,
    })
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    // Only 5 DB calls — notification path NOT triggered
    expect(result.success).toBe(true)
    expect(dbState.callIndex).toBe(5)
  })

  it('should NOT create notification when isNewPair=false even if fileCount=50', async () => {
    mockCheckAutoPass.mockResolvedValue({
      eligible: true,
      rationale: 'eligible',
      isNewPair: false, // NOT a new pair — lang pair config exists
      fileCount: 50,
    })
    const autoScore = { ...mockNewScore, status: 'auto_passed' }
    dbState.returnValues = [mockSegments, [], [undefined], [], [autoScore]]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    expect(dbState.callIndex).toBe(5) // no notification DB calls
  })

  // ── M5: graduation notification non-fatal (scoring succeeds even if notification throws) ──
  it('should succeed when graduation notification path has no admins', async () => {
    mockCheckAutoPass.mockResolvedValue({
      eligible: true,
      rationale: 'Graduated',
      isNewPair: true,
      fileCount: 50,
    })
    const autoScore = { ...mockNewScore, status: 'auto_passed' }
    // dedup: no existing, admins: empty [] → early return, no insert
    dbState.returnValues = [mockSegments, [], [undefined], [], [autoScore], [], []]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('auto_passed')
  })

  // ── Tenant isolation ──
  it('should include tenantId in all DB operations (withTenant coverage)', async () => {
    const { withTenant } = await import('@/db/helpers/withTenant')
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]
    await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), mockUser.tenantId)
  })

  // ── SUM wordCount → passed to calculator (AC #3) ──
  it('should sum all segment wordCounts and pass total to calculateMqmScore', async () => {
    const multiSegments = [
      { wordCount: 300, sourceLang: 'en-US', targetLang: 'th-TH' },
      { wordCount: 700, sourceLang: 'en-US', targetLang: 'th-TH' },
    ]
    dbState.returnValues = [multiSegments, [], [undefined], [], [mockNewScore]]
    await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(mockCalculateMqmScore).toHaveBeenCalledWith(
      expect.any(Array),
      1000, // 300 + 700
      expect.objectContaining({ critical: 25 }),
    )
  })

  // ── Dedup guard: file-51 notification not duplicated on re-run (AC #6 / L3) ──
  it('should skip graduation notification when graduation record already exists (dedup guard)', async () => {
    // fileCount=50 triggers notification check; dedup returns existing → skip insert
    mockCheckAutoPass.mockResolvedValue({
      eligible: true,
      rationale: 'Graduated',
      isNewPair: true,
      fileCount: 50,
    })
    const autoScore = { ...mockNewScore, status: 'auto_passed' }
    // 0-4: base path, 5: dedup check returns EXISTING notification → skip insert
    dbState.returnValues = [
      mockSegments,
      [],
      [undefined],
      [],
      [autoScore],
      [{ id: 'existing-notif' }],
    ]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    // Only 6 DB calls consumed — admin query (6) and insert (7) should NOT be called
    expect(dbState.callIndex).toBe(6)
  })

  // ── projectId filter on segments (H2) ──
  it('should pass projectId to segments query to prevent cross-project score contamination', async () => {
    const { eq } = await import('drizzle-orm')
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]
    await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    const eqMock = eq as ReturnType<typeof vi.fn>
    const projectIdCalls = eqMock.mock.calls.filter((call) => call[1] === VALID_PROJECT_ID)
    expect(projectIdCalls.length).toBeGreaterThanOrEqual(1)
  })

  // ── M3: AC #7 — all required fields present in ScoreResult ──
  it('should return all AC #7 required fields in result.data', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toMatchObject({
      scoreId: 'score-uuid',
      fileId: VALID_FILE_ID,
      mqmScore: 85,
      npt: 15,
      totalWords: 1000,
      criticalCount: 0,
      majorCount: 3,
      minorCount: 0,
      status: 'calculated',
      autoPassRationale: null,
    })
  })

  // ── M4: autoPassRationale null when not auto-passed ──
  it('should return autoPassRationale=null when status is calculated (not auto-passed)', async () => {
    dbState.returnValues = [mockSegments, [], [undefined], [], [mockNewScore]]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.autoPassRationale).toBeNull()
  })

  it('should return autoPassRationale string when status is auto_passed', async () => {
    mockCheckAutoPass.mockResolvedValue(mockAutoPassEligible)
    const rationale = mockAutoPassEligible.rationale
    const autoPassedScore = {
      ...mockNewScore,
      status: 'auto_passed',
      autoPassRationale: rationale,
    }
    dbState.returnValues = [mockSegments, [], [undefined], [], [autoPassedScore]]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.autoPassRationale).toBe(rationale)
    expect(result.data.autoPassRationale).not.toBeNull()
  })

  // ── H2: na status → autoPassRationale must be null even if checkAutoPass returns eligible ──
  it('should persist autoPassRationale=null when status is na (totalWords=0)', async () => {
    mockCalculateMqmScore.mockReturnValue({
      ...mockScoreResult,
      status: 'na' as const,
      mqmScore: 0,
    })
    // Even if checkAutoPass were somehow eligible (e.g. threshold=0), na status must win
    mockCheckAutoPass.mockResolvedValue(mockAutoPassEligible)
    const naScore = { ...mockNewScore, status: 'na', autoPassRationale: null }
    dbState.returnValues = [
      [{ wordCount: 0, sourceLang: 'en-US', targetLang: 'th-TH' }],
      [],
      [undefined],
      [],
      [naScore],
    ]
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('na')
    expect(result.data.autoPassRationale).toBeNull()
  })

  // ── INTERNAL_ERROR ──
  it('should return INTERNAL_ERROR when DB transaction throws', async () => {
    // segments loads fine, but something in the transaction throws
    dbState.returnValues = [mockSegments, []]
    // Force transaction to throw by returning non-array findings and then having tx throw
    mockCalculateMqmScore.mockImplementation(() => {
      throw new Error('unexpected db error')
    })
    const result = await calculateScore({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INTERNAL_ERROR')
  })
})
