import { describe, expect, it, vi, beforeEach } from 'vitest'

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
import { CONSERVATIVE_AUTO_PASS_THRESHOLD, NEW_PAIR_FILE_THRESHOLD } from './constants'

const BASE_INPUT = {
  mqmScore: 96,
  criticalCount: 0,
  projectId: 'project-abc',
  tenantId: 'tenant-abc',
  sourceLang: 'en-US',
  targetLang: 'th-TH',
}

describe('checkAutoPass — boundary values (R3-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  // ── Test 1: score = threshold exactly → eligible (verify >= not >) ──
  it('[P0] should return eligible when score equals configured threshold exactly', async () => {
    // Slot 0: langConfig with threshold 93, Slot 1: fileCount 60
    dbState.returnValues = [[{ autoPassThreshold: 93 }], [{ count: 60 }]]

    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 93, criticalCount: 0 })

    expect(result.eligible).toBe(true)
    expect(result.isNewPair).toBe(false)
    expect(result.fileCount).toBe(60)
  })

  // ── Test 2: score = threshold - 0.01 → NOT eligible (boundary below) ──
  it('[P0] should return not eligible when score is 0.01 below configured threshold', async () => {
    // Slot 0: langConfig with threshold 93, Slot 1: fileCount 60
    dbState.returnValues = [[{ autoPassThreshold: 93 }], [{ count: 60 }]]

    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 92.99, criticalCount: 0 })

    expect(result.eligible).toBe(false)
    expect(result.rationale).toContain('92.99')
    expect(result.rationale).toContain('below')
  })

  // ── Test 3: score = threshold + 0.01 → eligible (boundary above) ──
  it('[P0] should return eligible when score is 0.01 above configured threshold', async () => {
    // Slot 0: langConfig with threshold 93, Slot 1: fileCount 60
    dbState.returnValues = [[{ autoPassThreshold: 93 }], [{ count: 60 }]]

    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 93.01, criticalCount: 0 })

    expect(result.eligible).toBe(true)
    expect(result.isNewPair).toBe(false)
  })

  // ── Test 4: New pair file #49 → blocked (fileCount < 50) ──
  it('[P0] should block auto-pass for new pair when fileCount is 49 (below NEW_PAIR_FILE_THRESHOLD)', async () => {
    // Slot 0: no langConfig, Slot 1: fileCount 49
    dbState.returnValues = [[], [{ count: 49 }]]

    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 100, criticalCount: 0 })

    expect(result.eligible).toBe(false)
    expect(result.isNewPair).toBe(true)
    expect(result.fileCount).toBe(49)
    expect(result.rationale).toContain(`49/${NEW_PAIR_FILE_THRESHOLD}`)
    expect(result.rationale).toContain('mandatory manual review')
  })

  // ── Test 5: New pair file #50 → first eligible (fileCount = 50, project threshold = 90) ──
  it('[P0] should allow auto-pass for new pair when fileCount reaches NEW_PAIR_FILE_THRESHOLD', async () => {
    // Slot 0: no langConfig, Slot 1: fileCount 50, Slot 2: project threshold 90
    dbState.returnValues = [[], [{ count: 50 }], [{ autoPassThreshold: 90 }]]

    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 95, criticalCount: 0 })

    expect(result.eligible).toBe(true)
    expect(result.isNewPair).toBe(true)
    expect(result.fileCount).toBe(NEW_PAIR_FILE_THRESHOLD)
  })

  // ── Test 6: Uncalibrated pair (no config, no project) → uses CONSERVATIVE (99) ──
  it('[P0] should use CONSERVATIVE_AUTO_PASS_THRESHOLD when no langConfig and no project found', async () => {
    // Slot 0: no langConfig, Slot 1: fileCount 60, Slot 2: no project row
    dbState.returnValues = [[], [{ count: 60 }], []]

    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 95, criticalCount: 0 })

    // 95 < CONSERVATIVE_AUTO_PASS_THRESHOLD (99) → not eligible
    expect(result.eligible).toBe(false)
    expect(result.isNewPair).toBe(true)
    expect(CONSERVATIVE_AUTO_PASS_THRESHOLD).toBe(99)
  })

  // ── Test 7: score = 0 → NOT eligible (zero score should never pass with non-zero threshold) ──
  it('[P0] should return not eligible when score is 0 and threshold is 90', async () => {
    // Slot 0: langConfig with threshold 90, Slot 1: fileCount 60
    dbState.returnValues = [[{ autoPassThreshold: 90 }], [{ count: 60 }]]

    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 0, criticalCount: 0 })

    expect(result.eligible).toBe(false)
    expect(result.rationale).toContain('0')
    expect(result.rationale).toContain('below')
  })
})
