/**
 * ATDD Tests — Story 3.5: Score Lifecycle & Confidence Display
 * AC: approveFile server action — score guard + auth + audit
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

// ── Hoisted mocks — MUST be first ──
const { dbState, dbMockModule, mockRequireRole, mockGetCurrentUser, mockWriteAuditLog } =
  vi.hoisted(() => {
    const { dbState, dbMockModule } = createDrizzleMock()
    return {
      dbState,
      dbMockModule,
      mockRequireRole: vi.fn((..._args: unknown[]) =>
        Promise.resolve({
          id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
          tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
          role: 'qa_reviewer',
        }),
      ),
      mockGetCurrentUser: vi.fn((..._args: unknown[]) =>
        Promise.resolve({
          id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
          tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
        }),
      ),
      mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
    }
  })

vi.mock('server-only', () => ({}))

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}))

vi.mock('@/features/audit/helpers/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
}))

vi.mock('@/db/schema/scores', () => ({
  scores: {
    id: 'id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    status: 'status',
    mqmScore: 'mqm_score',
    layerCompleted: 'layer_completed',
    criticalCount: 'critical_count',
    majorCount: 'major_count',
    minorCount: 'minor_count',
    npt: 'npt',
  },
}))

vi.mock('@/db/schema/files', () => ({
  files: {
    id: 'id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    status: 'status',
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/features/review/helpers/assertLockOwnership', () => ({
  assertLockOwnership: vi.fn().mockResolvedValue(null),
}))

// Static import — stub file exists at this path, Vite can resolve it
import { approveFile } from '@/features/review/actions/approveFile.action'

// ── Constants ──

const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')
const VALID_USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

function buildScoreMock(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'score-id-0001-0000-0000-000000000000',
    fileId: VALID_FILE_ID,
    projectId: VALID_PROJECT_ID,
    tenantId: VALID_TENANT_ID,
    mqmScore: 95,
    status: 'calculated',
    layerCompleted: 'L1L2',
    criticalCount: 0,
    majorCount: 2,
    minorCount: 1,
    npt: 5,
    ...overrides,
  }
}

// ── Tests ──

describe('approveFile.action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    mockRequireRole.mockResolvedValue({
      id: VALID_USER_ID,
      tenantId: VALID_TENANT_ID,
      role: 'qa_reviewer',
    })
  })

  // 3.5-U-011: rejects calculating -> SCORE_STALE
  it('[P0] should return SCORE_STALE when score status is calculating', async () => {
    // Arrange: score row with status='calculating' (pipeline still running)
    dbState.returnValues = [[buildScoreMock({ status: 'calculating' })]]

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert: guard rejects stale score — UI should re-fetch and show spinner
    expect(result).toEqual({
      success: false,
      error: expect.any(String),
      code: 'SCORE_STALE',
    })
  })

  // 3.5-U-012: rejects partial -> SCORE_PARTIAL
  it('[P0] should return SCORE_PARTIAL when score status is partial', async () => {
    // Arrange: score row with status='partial' (AI pipeline failed mid-run)
    dbState.returnValues = [[buildScoreMock({ status: 'partial' })]]

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert: partial scores cannot be approved — incomplete analysis
    expect(result).toEqual({
      success: false,
      error: expect.any(String),
      code: 'SCORE_PARTIAL',
    })
  })

  // 3.5-U-013: rejects na -> SCORE_NA
  it('[P0] should return SCORE_NA when score status is na', async () => {
    // Arrange: score row with status='na' (no findings, no score yet)
    dbState.returnValues = [[buildScoreMock({ status: 'na' })]]

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert
    expect(result).toEqual({
      success: false,
      error: expect.any(String),
      code: 'SCORE_NA',
    })
  })

  // 3.5-U-014: rejects auto_passed -> ALREADY_APPROVED
  it('[P0] should return ALREADY_APPROVED when score status is auto_passed', async () => {
    // Arrange: file already auto-passed by pipeline
    dbState.returnValues = [[buildScoreMock({ status: 'auto_passed' })]]

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert: idempotent guard — not an error, but indicates already done
    expect(result).toEqual({
      success: false,
      error: expect.any(String),
      code: 'ALREADY_APPROVED',
    })
  })

  // 3.5-U-015: allows calculated -> success
  it('[P0] should return success with score data when status is calculated', async () => {
    // Arrange: valid calculated score
    const mockScore = buildScoreMock({ status: 'calculated', mqmScore: 95 })
    dbState.returnValues = [[mockScore]]

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert: returns score data for the UI to render
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toMatchObject({
        fileId: VALID_FILE_ID,
        mqmScore: expect.any(Number),
      })
    }
  })

  // 3.5-U-016: allows overridden -> success
  it('[P0] should return success when status is overridden', async () => {
    // Arrange: score was manually overridden by PM — still approvable
    const mockScore = buildScoreMock({ status: 'overridden', mqmScore: 88 })
    dbState.returnValues = [[mockScore]]

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert: overridden scores CAN be approved by reviewer
    expect(result.success).toBe(true)
  })

  // 3.5-U-017: auth qa_reviewer allowed
  it('[P0] should allow qa_reviewer role', async () => {
    // Arrange: authenticated as qa_reviewer (minimum required role)
    mockRequireRole.mockResolvedValue({
      id: VALID_USER_ID,
      tenantId: VALID_TENANT_ID,
      role: 'qa_reviewer',
    })
    dbState.returnValues = [[buildScoreMock({ status: 'calculated' })]]

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert: qa_reviewer is allowed to approve
    expect(result.success).toBe(true)
    expect(mockRequireRole).toHaveBeenCalledWith('qa_reviewer')
  })

  // 3.5-U-018: auth native_reviewer denied
  it('[P0] should deny native_reviewer role', async () => {
    // Arrange: native_reviewer does not have approval rights
    mockRequireRole.mockRejectedValue(new Error('Forbidden: insufficient role'))

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert: native_reviewer cannot approve files
    expect(result).toEqual({
      success: false,
      error: expect.any(String),
      code: expect.any(String),
    })
  })

  // 3.5-U-019: auth admin allowed via role hierarchy
  it('[P0] should allow admin role via hierarchy', async () => {
    // Arrange: admin inherits qa_reviewer permissions
    mockRequireRole.mockResolvedValue({
      id: VALID_USER_ID,
      tenantId: VALID_TENANT_ID,
      role: 'admin',
    })
    dbState.returnValues = [[buildScoreMock({ status: 'calculated' })]]

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert
    expect(result.success).toBe(true)
  })

  // 3.5-U-020: tenant isolation — cross-tenant fileId
  it('[P0] should return error for cross-tenant fileId', async () => {
    // Arrange: DB returns empty (RLS filters out cross-tenant file)
    dbState.returnValues = [[]] // No score found = cross-tenant blocked

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert: cannot approve file from another tenant
    expect(result.success).toBe(false)
  })

  // 3.5-U-021: cross-project guard (RT-2 critical)
  it('[P0] should return error for fileId from different project in same tenant', async () => {
    // Arrange: fileId belongs to a different project within the same tenant
    // DB score query uses eq(scores.projectId, projectId) — returns empty
    const differentProjectId = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'
    dbState.returnValues = [[]] // Different project ID blocks the result

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: differentProjectId })

    // Assert: cross-project contamination prevented even within same tenant
    expect(result.success).toBe(false)
    expect(result).toMatchObject({ code: expect.stringMatching(/NOT_FOUND|SCORE_NOT_FOUND/) })
  })

  // 3.5-U-022: missing score
  it('[P0] should return SCORE_NOT_FOUND when no score exists', async () => {
    // Arrange: file exists but no score row (pipeline hasn't run yet)
    dbState.returnValues = [[]] // Empty score result

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert
    expect(result).toEqual({
      success: false,
      error: expect.any(String),
      code: 'SCORE_NOT_FOUND',
    })
  })

  // 3.5-U-023: Zod validation — invalid UUID
  it('[P1] should reject invalid UUID in fileId', async () => {
    // Arrange: malformed fileId (not a valid UUID v4)
    // Act
    const result = await approveFile({ fileId: 'not-a-uuid', projectId: VALID_PROJECT_ID })

    // Assert: input validation rejects before hitting DB
    expect(result).toEqual({
      success: false,
      error: expect.any(String),
      code: expect.stringMatching(/VALIDATION|INVALID_INPUT/),
    })
  })

  // 3.5-U-024: audit log written on success
  it('[P1] should write audit log on successful approve', async () => {
    // Arrange: valid score that can be approved
    dbState.returnValues = [[buildScoreMock({ status: 'calculated' })]]

    // Act
    await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert: audit trail is mandatory for all state-changing actions
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'file',
        action: expect.stringContaining('approve'),
        tenantId: VALID_TENANT_ID,
      }),
    )
  })

  // 3.5-U-025: SCORE_STALE returns current score data for UI re-fetch
  it('[P1] should return SCORE_STALE with current score data for UI re-fetch', async () => {
    // Arrange: score is calculating (pipeline still running)
    const calculatingScore = buildScoreMock({ status: 'calculating', mqmScore: null })
    dbState.returnValues = [[calculatingScore]]

    // Act
    const result = await approveFile({ fileId: VALID_FILE_ID, projectId: VALID_PROJECT_ID })

    // Assert: UI needs current score data to show spinner/reload trigger
    expect(result.success).toBe(false)
    expect(result).toMatchObject({
      code: 'SCORE_STALE',
    })
  })
})
