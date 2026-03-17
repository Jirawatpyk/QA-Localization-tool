/**
 * Story 4.6: getActiveSuppressions Server Action (CR-C2)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const MOCK_RULE = {
  id: 'r1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  projectId: 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e',
  tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  pattern: 'bank, terminology',
  category: 'Terminology',
  scope: 'language_pair',
  duration: 'until_improved',
  reason: 'Auto-generated',
  createdBy: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  isActive: true,
  matchCount: 3,
  fileId: null,
  sourceLang: 'en-US',
  targetLang: 'th-TH',
  createdAt: new Date('2026-03-17'),
}

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
      }),
    ),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/db/client', () => dbMockModule)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))
vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  or: vi.fn((...args: unknown[]) => args),
  lt: vi.fn((...args: unknown[]) => args),
}))
vi.mock('@/db/schema/suppressionRules', () => ({
  suppressionRules: {
    id: 'id',
    tenantId: 'tenant_id',
    projectId: 'project_id',
    pattern: 'pattern',
    category: 'category',
    scope: 'scope',
    duration: 'duration',
    reason: 'reason',
    createdBy: 'created_by',
    isActive: 'is_active',
    matchCount: 'match_count',
    fileId: 'file_id',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
    createdAt: 'created_at',
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { getActiveSuppressions } from './getActiveSuppressions.action'

const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

describe('getActiveSuppressions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.throwAtCallIndex = null
    mockRequireRole.mockResolvedValue({
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      tenantId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      role: 'qa_reviewer',
    })
    // callIndex 0: stale session cleanup UPDATE (resolves void)
    // callIndex 1: SELECT active rules
    dbState.returnValues = [undefined, [MOCK_RULE]]
  })

  it('[P0] should return active suppression rules', async () => {
    const result = await getActiveSuppressions(VALID_PROJECT_ID, VALID_FILE_ID)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveLength(1)
    expect(result.data[0]!.isActive).toBe(true)
  })

  it('[P0] should return UNAUTHORIZED when not authenticated', async () => {
    mockRequireRole.mockRejectedValue(new Error('Unauthorized'))
    const result = await getActiveSuppressions(VALID_PROJECT_ID, VALID_FILE_ID)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('UNAUTHORIZED')
  })

  it('[P0] should return VALIDATION_ERROR for invalid project UUID', async () => {
    const result = await getActiveSuppressions('not-a-uuid', VALID_FILE_ID)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('[P0] should return VALIDATION_ERROR for invalid file UUID', async () => {
    const result = await getActiveSuppressions(VALID_PROJECT_ID, 'not-a-uuid')
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('[P0] should accept null fileId (no file-scope filter)', async () => {
    const result = await getActiveSuppressions(VALID_PROJECT_ID, null)
    expect(result.success).toBe(true)
  })

  it('[P1] should return empty array when no active rules', async () => {
    dbState.returnValues = [undefined, []]
    const result = await getActiveSuppressions(VALID_PROJECT_ID, VALID_FILE_ID)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveLength(0)
  })

  it('[P1] should convert createdAt to ISO string', async () => {
    const result = await getActiveSuppressions(VALID_PROJECT_ID, VALID_FILE_ID)
    if (!result.success) return
    expect(result.data[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('[P1] should deactivate stale session rules before fetching (Task 10.3)', async () => {
    await getActiveSuppressions(VALID_PROJECT_ID, VALID_FILE_ID)
    // R2-M8: exact call count: UPDATE (stale cleanup) + SELECT
    expect(dbState.callIndex).toBe(2)
    // R2-M9: verify stale cleanup payload
    expect(dbState.setCaptures[0]).toMatchObject({ isActive: false })
  })
})
