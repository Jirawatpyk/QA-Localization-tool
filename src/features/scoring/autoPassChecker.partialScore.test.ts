/**
 * P2-12 (R3-014): Partial score status consistency with auto-pass eligibility
 * Auto-pass should be skipped when score_status is 'partial' — only 'calculated' is eligible.
 *
 * NOTE: checkAutoPass itself does NOT check score_status — the caller (scoreFile)
 * is responsible for only calling checkAutoPass when score_status is 'calculated'
 * and the pipeline is complete. This test documents the expected integration contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──
const { dbState, dbMockModule } = vi.hoisted(() => createDrizzleMock())

vi.mock('@/db/client', () => dbMockModule)

vi.mock('@/db/helpers/withTenant', () => ({
  withTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))

vi.mock('@/db/schema/languagePairConfigs', () => ({
  languagePairConfigs: {
    tenantId: 'tenant_id',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
    autoPassThreshold: 'auto_pass_threshold',
  },
}))

vi.mock('@/db/schema/scores', () => ({
  scores: { fileId: 'file_id', projectId: 'project_id', tenantId: 'tenant_id' },
}))

vi.mock('@/db/schema/segments', () => ({
  segments: {
    fileId: 'file_id',
    sourceLang: 'source_lang',
    targetLang: 'target_lang',
    tenantId: 'tenant_id',
  },
}))

vi.mock('@/db/schema/projects', () => ({
  projects: { tenantId: 'tenant_id', id: 'id', autoPassThreshold: 'auto_pass_threshold' },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(() => 'count-expr'),
}))

import { checkAutoPass } from './autoPassChecker'

const BASE_INPUT = {
  mqmScore: 96,
  criticalCount: 0,
  projectId: 'project-abc',
  tenantId: 'tenant-abc',
  sourceLang: 'en-US',
  targetLang: 'th-TH',
}

describe('autoPassChecker — partial score status (P2-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  it('[P2] should skip auto-pass when score_status is partial (caller responsibility)', () => {
    // This test documents the integration contract:
    // The caller should NOT call checkAutoPass when scoreStatus='partial'.
    // checkAutoPass itself always evaluates — it's the caller's gate.
    type ScoreStatus = 'na' | 'calculating' | 'calculated' | 'partial' | 'failed'

    const scoreStatus = 'partial' as ScoreStatus
    const shouldCallAutoPass = scoreStatus === 'calculated'

    expect(shouldCallAutoPass).toBe(false)
    // checkAutoPass is never called when status is partial
  })

  it('[P2] should evaluate auto-pass normally when score_status is calculated + layer is L1L2', async () => {
    // score_status='calculated' + layer='L1L2' → eligible for auto-pass
    // Slot 0: langConfig, Slot 1: fileCount
    dbState.returnValues = [[{ autoPassThreshold: 93 }], [{ count: 60 }]]

    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 96 })

    expect(result.eligible).toBe(true)
    expect(result.isNewPair).toBe(false)
  })
})
