/**
 * ATDD Tests — Story 5.2a: Non-Native Auto-Tag
 * AC1: Auto-tag on every review action (metadata.non_native)
 * AC3: Write-once tag (Guardrail #66)
 * AC6: Audit trail includes non_native
 *
 * TDD RED PHASE — all tests skipped until implementation complete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { asTenantId } from '@/types/tenant'

// ── Hoisted mocks — MUST be first ──
const {
  dbState,
  dbMockModule,
  mockRequireRole,
  mockWriteAuditLog,
  mockInngestSend,
  mockDetermineNonNative,
} = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    dbState,
    dbMockModule,
    mockRequireRole: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
        role: 'qa_reviewer',
        nativeLanguages: ['en'],
      }),
    ),
    mockWriteAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
    mockInngestSend: vi.fn((..._args: unknown[]) => Promise.resolve()),
    mockDetermineNonNative: vi.fn((..._args: unknown[]) => true),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
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

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: (...args: unknown[]) => mockInngestSend(...args) },
}))

vi.mock('@/lib/auth/determineNonNative', () => ({
  determineNonNative: (...args: unknown[]) => mockDetermineNonNative(...args),
}))

vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    segmentId: 'segment_id',
    status: 'status',
    severity: 'severity',
    category: 'category',
    detectedByLayer: 'detected_by_layer',
    sourceTextExcerpt: 'source_text_excerpt',
    targetTextExcerpt: 'target_text_excerpt',
    updatedAt: 'updated_at',
  },
}))

vi.mock('@/db/schema/segments', () => ({
  segments: {
    id: 'id',
    tenantId: 'tenant_id',
    targetLang: 'target_lang',
  },
}))

vi.mock('@/db/schema/reviewActions', () => ({
  reviewActions: {
    id: 'id',
    findingId: 'finding_id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    actionType: 'action_type',
    previousState: 'previous_state',
    newState: 'new_state',
    userId: 'user_id',
    batchId: 'batch_id',
    metadata: 'metadata',
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { executeReviewAction } from '@/features/review/actions/helpers/executeReviewAction'

const FINDING_ID = 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
const FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const TENANT_ID = asTenantId('c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f')
const USER_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const SEGMENT_ID = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'

function buildFindingRow(overrides?: Record<string, unknown>) {
  return {
    id: FINDING_ID,
    fileId: FILE_ID,
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    segmentId: SEGMENT_ID,
    status: 'pending',
    severity: 'major',
    category: 'accuracy',
    detectedByLayer: 'L2',
    sourceTextExcerpt: 'source text',
    targetTextExcerpt: 'target text',
    ...overrides,
  }
}

describe('executeReviewAction — Non-Native Auto-Tag (Story 5.2a)', () => {
  beforeEach(() => {
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockDetermineNonNative.mockClear()
    mockWriteAuditLog.mockClear()
    mockInngestSend.mockClear()
  })

  // ── AC1: Non-native user gets metadata.non_native = true ──

  it('[P0][AC1] should set metadata.non_native = true when reviewer is non-native', async () => {
    // Arrange: finding row + segment targetLang lookup
    mockDetermineNonNative.mockReturnValue(true)
    dbState.returnValues = [
      [buildFindingRow()], // finding SELECT
      [{ targetLang: 'th-TH' }], // segment targetLang SELECT
      undefined, // UPDATE (transaction)
      undefined, // INSERT review_actions (transaction)
    ]

    // Act
    const result = await executeReviewAction({
      input: { findingId: FINDING_ID, fileId: FILE_ID, projectId: PROJECT_ID },
      action: 'accept',
      user: { id: USER_ID, tenantId: TENANT_ID, nativeLanguages: ['en'] },
    })

    // Assert
    expect(result.success).toBe(true)
    expect(mockDetermineNonNative).toHaveBeenCalledWith(['en'], 'th-TH')

    // review_actions INSERT should include metadata with non_native: true
    const reviewActionInsert = dbState.valuesCaptures.find(
      (c: unknown) =>
        typeof c === 'object' && c !== null && 'actionType' in (c as Record<string, unknown>),
    ) as Record<string, unknown> | undefined
    expect(reviewActionInsert).toBeDefined()
    expect(reviewActionInsert?.metadata).toEqual({ non_native: true })
  })

  // ── AC1: Native user gets metadata.non_native = false ──

  it('[P0][AC1] should set metadata.non_native = false when reviewer is native', async () => {
    mockDetermineNonNative.mockReturnValue(false) // native
    dbState.returnValues = [[buildFindingRow()], [{ targetLang: 'th-TH' }], undefined, undefined]

    const result = await executeReviewAction({
      input: { findingId: FINDING_ID, fileId: FILE_ID, projectId: PROJECT_ID },
      action: 'accept',
      user: { id: USER_ID, tenantId: TENANT_ID, nativeLanguages: ['th'] },
    })

    expect(result.success).toBe(true)
    expect(mockDetermineNonNative).toHaveBeenCalledWith(['th'], 'th-TH')

    const reviewActionInsert = dbState.valuesCaptures.find(
      (c: unknown) =>
        typeof c === 'object' && c !== null && 'actionType' in (c as Record<string, unknown>),
    ) as Record<string, unknown> | undefined
    expect(reviewActionInsert?.metadata).toEqual({ non_native: false })
  })

  // ── AC1: Cross-file finding (segmentId null) defaults to non_native: true ──

  it('[P1][AC1] should default non_native = true when segmentId is null (cross-file finding)', async () => {
    mockDetermineNonNative.mockReturnValue(true) // empty nativeLanguages or unknown lang
    dbState.returnValues = [
      [buildFindingRow({ segmentId: null })], // finding with no segment
      undefined, // UPDATE
      undefined, // INSERT review_actions
    ]

    const result = await executeReviewAction({
      input: { findingId: FINDING_ID, fileId: FILE_ID, projectId: PROJECT_ID },
      action: 'accept',
      user: { id: USER_ID, tenantId: TENANT_ID, nativeLanguages: ['en'] },
    })

    expect(result.success).toBe(true)
    // Should call determineNonNative with 'unknown' since no segment
    expect(mockDetermineNonNative).toHaveBeenCalledWith(['en'], 'unknown')

    const reviewActionInsert = dbState.valuesCaptures.find(
      (c: unknown) =>
        typeof c === 'object' && c !== null && 'actionType' in (c as Record<string, unknown>),
    ) as Record<string, unknown> | undefined
    expect(reviewActionInsert?.metadata).toEqual({ non_native: true })
  })

  // ── AC6: Audit log includes non_native in newValue ──

  it('[P1][AC6] should include non_native in audit log newValue', async () => {
    mockDetermineNonNative.mockReturnValue(true)
    dbState.returnValues = [[buildFindingRow()], [{ targetLang: 'th-TH' }], undefined, undefined]

    await executeReviewAction({
      input: { findingId: FINDING_ID, fileId: FILE_ID, projectId: PROJECT_ID },
      action: 'accept',
      user: { id: USER_ID, tenantId: TENANT_ID, nativeLanguages: ['en'] },
    })

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({ non_native: true }),
      }),
    )
  })
})
