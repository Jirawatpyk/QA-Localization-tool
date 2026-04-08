/**
 * Story 4.4b TA: undoBulkAction boundary tests
 * Gap: G-03 (empty array guard — Guardrail #5: inArray(col, []) = invalid SQL)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──
const { dbState, dbMockModule, mockRequireRole } = vi.hoisted(() => {
  const { dbState, dbMockModule } = createDrizzleMock()
  return {
    dbState,
    dbMockModule,
    mockRequireRole: vi.fn((..._args: unknown[]) =>
      Promise.resolve({
        id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
        role: 'qa_reviewer',
        nativeLanguages: [] as string[],
      }),
    ),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: vi.fn((..._args: unknown[]) => Promise.resolve()),
}))
vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
}))
vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn((..._args: unknown[]) => Promise.resolve()) },
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/features/review/helpers/assertLockOwnership', () => ({
  assertLockOwnership: vi.fn().mockResolvedValue(null),
}))

import { undoBulkAction } from '@/features/review/actions/undoBulkAction.action'

function resetDbState() {
  dbState.callIndex = 0
  dbState.returnValues = []
  dbState.setCaptures = []
  dbState.valuesCaptures = []
  dbState.throwAtCallIndex = null
}

describe('undoBulkAction — Boundary Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbState()
  })

  // ── TA-U08: P1 — Empty findings array rejected by Zod .min(1) (Guardrail #5 defense-in-depth) ──

  it('should return VALIDATION error when findings array is empty (TA-U08)', async () => {
    const result = await undoBulkAction({
      findings: [],
      fileId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      force: false,
    })

    // Zod .min(1) rejects empty array before reaching the inArray guard
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }
    // Must NOT call DB at all
    expect(dbState.callIndex).toBe(0)
  })

  // ── Boundary: single finding (minimum non-empty) ──

  it('should handle single-finding bulk undo (minimum non-empty input)', async () => {
    const findingId = '00000000-0000-4000-8000-000000000010'

    dbState.returnValues = [
      [{ id: findingId, status: 'accepted', severity: 'major' }], // SELECT findings
      [{ segmentId: null }], // SELECT finding.segmentId (non-native lookup)
      undefined, // transaction
    ]

    const result = await undoBulkAction({
      findings: [
        {
          findingId,
          previousState: 'pending',
          expectedCurrentState: 'accepted',
        },
      ],
      fileId: '00000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000002',
      force: false,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reverted).toContain(findingId)
    }
  })
})
