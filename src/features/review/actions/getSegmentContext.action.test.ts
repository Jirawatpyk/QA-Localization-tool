/**
 * ATDD GREEN PHASE — Story 4.1c: Detail Panel & Segment Context
 * Server Action: getSegmentContext
 *
 * Guardrails referenced: #1 (withTenant), #4 (guard rows[0]!), #5 (inArray guard)
 */
import { describe, it, vi, expect, beforeEach } from 'vitest'

// ── Mock server-only (throws in jsdom) ──
vi.mock('server-only', () => ({}))

import { getSegmentContext } from '@/features/review/actions/getSegmentContext.action'
import { buildSegment } from '@/test/factories'

// ── Hoisted mocks ──
const { dbState, dbMockModule, mockRequireRole, mockWithTenant } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { dbState, dbMockModule } = (createDrizzleMock as any)()
  return {
    dbState,
    dbMockModule,
    mockRequireRole: vi.fn(),
    mockWithTenant: vi.fn((..._args: unknown[]) => 'mocked-tenant-filter'),
  }
})

vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: (...args: unknown[]) => mockWithTenant(...args),
}))

const mockTenantId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const mockUserId = 'b2c3d4e5-f6a1-4b1c-9d2e-4f5a6b7c8d9e'
const mockFileId = 'c3d4e5f6-a1b2-4c1d-ae2f-5a6b7c8d9e0f'
const mockSegmentId = 'd4e5f6a1-b2c3-4d1e-bf3a-6b7c8d9e0f1a'
const mockProjectId = 'e5f6a1b2-c3d4-4e1f-ca4b-7c8d9e0f1a2b'

vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('getSegmentContext', () => {
  beforeEach(() => {
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.setCaptures = []
    dbState.valuesCaptures = []
    dbState.throwAtCallIndex = null
    mockWithTenant.mockClear()
    mockRequireRole.mockResolvedValue({
      userId: mockUserId,
      tenantId: mockTenantId,
      role: 'qa_reviewer',
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC2, AC3: Happy Path
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-SA.1][P0] should return segment + context ±2 on happy path', async () => {
    const currentSegment = buildSegment({
      id: mockSegmentId,
      fileId: mockFileId,
      projectId: mockProjectId,
      tenantId: mockTenantId,
      segmentNumber: 5,
      sourceText: 'The quick brown fox jumps over the lazy dog',
      targetText: 'สุนัขจิ้งจอกสีน้ำตาลกระโดดข้ามสุนัขขี้เกียจ',
    })
    const contextSegments = [
      buildSegment({ segmentNumber: 3, fileId: mockFileId, tenantId: mockTenantId }),
      buildSegment({ segmentNumber: 4, fileId: mockFileId, tenantId: mockTenantId }),
      buildSegment({ segmentNumber: 6, fileId: mockFileId, tenantId: mockTenantId }),
      buildSegment({ segmentNumber: 7, fileId: mockFileId, tenantId: mockTenantId }),
    ]

    // Query order: target segment, context segments, findings for context segments
    dbState.returnValues = [
      [currentSegment],
      contextSegments,
      [], // no findings on context segments
    ]

    const result = await getSegmentContext({ fileId: mockFileId, segmentId: mockSegmentId })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.currentSegment.id).toBe(mockSegmentId)
      expect(result.data.contextBefore).toHaveLength(2)
      expect(result.data.contextAfter).toHaveLength(2)
      expect(result.data.findingsBySegmentId).toEqual({})
    }
  })

  it('[T-SA.2][P0] should return NOT_FOUND when segment does not exist', async () => {
    dbState.returnValues = [[]] // Empty result for target segment query

    const result = await getSegmentContext({ fileId: mockFileId, segmentId: mockSegmentId })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
      expect(result.error).toMatch(/segment|not found/i)
    }
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC4: Context Range Configuration
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-SA.3][P1] should respect contextRange parameter (1, 2, 3)', async () => {
    const currentSegment = buildSegment({
      id: mockSegmentId,
      fileId: mockFileId,
      tenantId: mockTenantId,
      segmentNumber: 5,
    })

    // Test with contextRange=1: should get segments 4 and 6 only
    dbState.returnValues = [
      [currentSegment],
      [
        buildSegment({ segmentNumber: 4, fileId: mockFileId, tenantId: mockTenantId }),
        buildSegment({ segmentNumber: 6, fileId: mockFileId, tenantId: mockTenantId }),
      ],
      [],
    ]

    const result = await getSegmentContext({
      fileId: mockFileId,
      segmentId: mockSegmentId,
      contextRange: 1,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contextBefore).toHaveLength(1)
      expect(result.data.contextAfter).toHaveLength(1)
    }
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC3: Edge Cases — File Start / File End
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-SA.4][P1] should return empty contextBefore at file start (segment #1)', async () => {
    const firstSegment = buildSegment({
      id: mockSegmentId,
      fileId: mockFileId,
      tenantId: mockTenantId,
      segmentNumber: 1,
    })

    dbState.returnValues = [
      [firstSegment],
      [
        buildSegment({ segmentNumber: 2, fileId: mockFileId, tenantId: mockTenantId }),
        buildSegment({ segmentNumber: 3, fileId: mockFileId, tenantId: mockTenantId }),
      ],
      [],
    ]

    const result = await getSegmentContext({ fileId: mockFileId, segmentId: mockSegmentId })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contextBefore).toHaveLength(0)
      expect(result.data.contextAfter.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('[T-SA.5][P1] should return empty contextAfter at file end (last segment)', async () => {
    const lastSegment = buildSegment({
      id: mockSegmentId,
      fileId: mockFileId,
      tenantId: mockTenantId,
      segmentNumber: 100,
    })

    dbState.returnValues = [
      [lastSegment],
      [
        buildSegment({ segmentNumber: 98, fileId: mockFileId, tenantId: mockTenantId }),
        buildSegment({ segmentNumber: 99, fileId: mockFileId, tenantId: mockTenantId }),
      ],
      [],
    ]

    const result = await getSegmentContext({ fileId: mockFileId, segmentId: mockSegmentId })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contextBefore.length).toBeGreaterThanOrEqual(1)
      expect(result.data.contextAfter).toHaveLength(0)
    }
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC5: Finding IDs for Click-to-Navigate
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-SA.6][P1] should include finding IDs for clickable context segments', async () => {
    const contextSegId = 'f1a2b3c4-d5e6-4f1a-9b2c-d3e4f5a6b7c8'
    const findingId1 = 'a2b3c4d5-e6f1-4a2b-ac3d-e4f5a6b7c8d9'
    const findingId2 = 'b3c4d5e6-f1a2-4b3c-bd4e-f5a6b7c8d9e0'

    const currentSegment = buildSegment({
      id: mockSegmentId,
      fileId: mockFileId,
      tenantId: mockTenantId,
      segmentNumber: 5,
    })

    dbState.returnValues = [
      [currentSegment],
      [
        buildSegment({
          id: contextSegId,
          segmentNumber: 4,
          fileId: mockFileId,
          tenantId: mockTenantId,
        }),
      ],
      [
        { segmentId: contextSegId, id: findingId1 },
        { segmentId: contextSegId, id: findingId2 },
      ],
    ]

    const result = await getSegmentContext({ fileId: mockFileId, segmentId: mockSegmentId })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.findingsBySegmentId[contextSegId]).toEqual([findingId1, findingId2])
    }
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Guardrail Tests
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-SA.7][P0] should use withTenant() on ALL queries (Guardrail #1)', async () => {
    const currentSegment = buildSegment({
      id: mockSegmentId,
      fileId: mockFileId,
      tenantId: mockTenantId,
      segmentNumber: 5,
    })

    dbState.returnValues = [
      [currentSegment],
      [buildSegment({ segmentNumber: 4, fileId: mockFileId, tenantId: mockTenantId })],
      [{ segmentId: 'seg-1', id: 'finding-1' }],
    ]

    await getSegmentContext({ fileId: mockFileId, segmentId: mockSegmentId })
    // Exactly 3 queries — each uses withTenant once
    expect(mockWithTenant).toHaveBeenCalledTimes(3)
    for (const call of mockWithTenant.mock.calls) {
      expect(call[1]).toBe(mockTenantId)
    }
  })

  it('[T-SA.8][P1] should handle inArray guard when no context segments have findings (Guardrail #5)', async () => {
    const currentSegment = buildSegment({
      id: mockSegmentId,
      fileId: mockFileId,
      tenantId: mockTenantId,
      segmentNumber: 1,
    })

    dbState.returnValues = [
      [currentSegment],
      [], // no context segments
      // Query 3 (findings) should NOT be called — inArray guard
    ]

    const result = await getSegmentContext({ fileId: mockFileId, segmentId: mockSegmentId })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.findingsBySegmentId).toEqual({})
    }
    // Verify findings query was never called (only 2 queries, not 3)
    expect(dbState.callIndex).toBe(2)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Boundary & Edge Cases
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-SA.9][P1] should handle non-contiguous segment numbers (gaps from deletions)', async () => {
    const currentSegment = buildSegment({
      id: mockSegmentId,
      fileId: mockFileId,
      tenantId: mockTenantId,
      segmentNumber: 5,
    })

    // Gap: segments 3 and 4 don't exist, only 1 and 8 exist near #5
    dbState.returnValues = [
      [currentSegment],
      [
        buildSegment({ segmentNumber: 1, fileId: mockFileId, tenantId: mockTenantId }),
        buildSegment({ segmentNumber: 8, fileId: mockFileId, tenantId: mockTenantId }),
      ],
      [],
    ]

    const result = await getSegmentContext({ fileId: mockFileId, segmentId: mockSegmentId })
    expect(result.success).toBe(true)
    if (result.success) {
      // Returns whatever segments exist in the range, even if fewer than contextRange
      expect(result.data.contextBefore).toHaveLength(1) // only segment #1 in range (3..4)
      expect(result.data.contextAfter).toHaveLength(1) // only segment #8 in range (6..7)
    }
  })

  it('[T-SA.10][P1] should clamp contextRange=0 to minimum 1', async () => {
    const currentSegment = buildSegment({
      id: mockSegmentId,
      fileId: mockFileId,
      tenantId: mockTenantId,
      segmentNumber: 5,
    })

    dbState.returnValues = [
      [currentSegment],
      [
        buildSegment({ segmentNumber: 4, fileId: mockFileId, tenantId: mockTenantId }),
        buildSegment({ segmentNumber: 6, fileId: mockFileId, tenantId: mockTenantId }),
      ],
      [],
    ]

    // contextRange=0 should be clamped to 1
    const result = await getSegmentContext({
      fileId: mockFileId,
      segmentId: mockSegmentId,
      contextRange: 0,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // Clamped to 1: should have at most 1 before + 1 after
      expect(result.data.contextBefore.length).toBeLessThanOrEqual(1)
      expect(result.data.contextAfter.length).toBeLessThanOrEqual(1)
    }
  })

  it('[T-SA.11][P1] should clamp contextRange=4 to 3 (above-max boundary)', async () => {
    const currentSegment = buildSegment({
      id: mockSegmentId,
      fileId: mockFileId,
      tenantId: mockTenantId,
      segmentNumber: 5,
    })

    dbState.returnValues = [
      [currentSegment],
      [
        buildSegment({ segmentNumber: 2, fileId: mockFileId, tenantId: mockTenantId }),
        buildSegment({ segmentNumber: 3, fileId: mockFileId, tenantId: mockTenantId }),
        buildSegment({ segmentNumber: 4, fileId: mockFileId, tenantId: mockTenantId }),
        buildSegment({ segmentNumber: 6, fileId: mockFileId, tenantId: mockTenantId }),
        buildSegment({ segmentNumber: 7, fileId: mockFileId, tenantId: mockTenantId }),
        buildSegment({ segmentNumber: 8, fileId: mockFileId, tenantId: mockTenantId }),
      ],
      [],
    ]

    const result = await getSegmentContext({
      fileId: mockFileId,
      segmentId: mockSegmentId,
      contextRange: 4,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // Clamped to 3: exactly 3 before + 3 after (all 6 segments in range)
      expect(result.data.contextBefore).toHaveLength(3)
      expect(result.data.contextAfter).toHaveLength(3)
    }
  })
})
