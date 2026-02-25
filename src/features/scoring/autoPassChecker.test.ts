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

describe('checkAutoPass', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
  })

  // ── Language pair config exists ──
  it('should return eligible when score >= threshold and no criticals', async () => {
    // 0: langConfig → [{autoPassThreshold: 93}], 1: fileCount → [{count: 60}]
    dbState.returnValues = [[{ autoPassThreshold: 93 }], [{ count: 60 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 96 })
    expect(result.eligible).toBe(true)
    expect(result.isNewPair).toBe(false)
  })

  it('should return not eligible when score below configured threshold', async () => {
    dbState.returnValues = [[{ autoPassThreshold: 98 }], [{ count: 60 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 95 })
    expect(result.eligible).toBe(false)
    expect(result.rationale).toContain('below configured threshold')
  })

  it('should return not eligible when critical count > 0 even if score is high', async () => {
    dbState.returnValues = [[{ autoPassThreshold: 90 }], [{ count: 60 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 99, criticalCount: 1 })
    expect(result.eligible).toBe(false)
    expect(result.rationale).toContain('Critical findings')
  })

  it('should return eligible at exactly threshold (boundary)', async () => {
    dbState.returnValues = [[{ autoPassThreshold: 95 }], [{ count: 70 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 95 })
    expect(result.eligible).toBe(true)
  })

  it('should include fileCount in result when config exists', async () => {
    dbState.returnValues = [[{ autoPassThreshold: 93 }], [{ count: 120 }]]
    const result = await checkAutoPass({ ...BASE_INPUT })
    expect(result.fileCount).toBe(120)
  })

  it('should use language pair threshold not project threshold when config exists', async () => {
    // Lang pair threshold = 93, project threshold would be 95 (higher)
    dbState.returnValues = [[{ autoPassThreshold: 93 }], [{ count: 60 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 94 })
    // 94 >= 93 → eligible with lang pair threshold
    expect(result.eligible).toBe(true)
  })

  // ── New language pair (no config) — first 50 files ──
  it('should disable auto-pass for new pair when fileCount < 50', async () => {
    // 0: langConfig → [], 1: fileCount → [{count: 30}]
    dbState.returnValues = [[], [{ count: 30 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 100 })
    expect(result.eligible).toBe(false)
    expect(result.isNewPair).toBe(true)
    expect(result.rationale).toContain('mandatory manual review')
    expect(result.fileCount).toBe(30)
  })

  it('should disable auto-pass for new pair when fileCount = 0 (very first file)', async () => {
    dbState.returnValues = [[], [{ count: 0 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 100 })
    expect(result.eligible).toBe(false)
    expect(result.isNewPair).toBe(true)
  })

  it('should disable auto-pass for new pair when fileCount = 49 (file 50 = last blocked)', async () => {
    // fileCount=49 means 49 already scored → this is file 50 (still in first-50 block)
    dbState.returnValues = [[], [{ count: NEW_PAIR_FILE_THRESHOLD - 1 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 100 })
    expect(result.eligible).toBe(false)
    expect(result.rationale).toContain(`${NEW_PAIR_FILE_THRESHOLD - 1}/${NEW_PAIR_FILE_THRESHOLD}`)
  })

  it('should be eligible for new pair when fileCount = 50 (file 51 = first eligible)', async () => {
    // fileCount=50 means 50 already scored → this is file 51 (first auto-pass candidate per AC #6)
    // Uses < threshold (not <=) so fileCount=50 falls through to project threshold check
    dbState.returnValues = [[], [{ count: NEW_PAIR_FILE_THRESHOLD }], [{ autoPassThreshold: 95 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 97 })
    expect(result.eligible).toBe(true)
    expect(result.isNewPair).toBe(true)
    expect(result.fileCount).toBe(NEW_PAIR_FILE_THRESHOLD)
  })

  it('should include file number in rationale for new pair', async () => {
    dbState.returnValues = [[], [{ count: 25 }]]
    const result = await checkAutoPass({ ...BASE_INPUT })
    expect(result.rationale).toContain('25/50')
  })

  // ── New pair established (fileCount >= 50) → fall back to project threshold ──
  it('should be eligible for new pair at file 52 (fileCount=51) if score meets project threshold', async () => {
    // fileCount=51 means 51 already scored → this is file 52, also eligible
    // 0: langConfig → [], 1: fileCount → [{count: 51}], 2: project → [{autoPassThreshold: 95}]
    dbState.returnValues = [[], [{ count: 51 }], [{ autoPassThreshold: 95 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 97 })
    expect(result.eligible).toBe(true)
    expect(result.isNewPair).toBe(true) // still new pair (no config)
    expect(result.fileCount).toBe(51)
  })

  it('should fall back to project auto_pass_threshold for established new pair', async () => {
    // Project threshold = 98 → score 96 should NOT be eligible
    dbState.returnValues = [[], [{ count: 60 }], [{ autoPassThreshold: 98 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 96 })
    expect(result.eligible).toBe(false)
    expect(result.rationale).toContain('project threshold')
  })

  it('should not be eligible for established new pair when criticals exist', async () => {
    dbState.returnValues = [[], [{ count: 60 }], [{ autoPassThreshold: 95 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 99, criticalCount: 2 })
    expect(result.eligible).toBe(false)
    expect(result.rationale).toContain('Critical findings')
  })

  it('should use CONSERVATIVE_AUTO_PASS_THRESHOLD when project not found', async () => {
    // No project record → conservative fallback
    dbState.returnValues = [[], [{ count: 60 }], []]
    const result = await checkAutoPass({
      ...BASE_INPUT,
      mqmScore: CONSERVATIVE_AUTO_PASS_THRESHOLD - 1,
    })
    expect(result.eligible).toBe(false)
  })

  it('should be eligible at exactly CONSERVATIVE_AUTO_PASS_THRESHOLD when project missing', async () => {
    dbState.returnValues = [[], [{ count: 60 }], []]
    const result = await checkAutoPass({
      ...BASE_INPUT,
      mqmScore: CONSERVATIVE_AUTO_PASS_THRESHOLD,
      criticalCount: 0,
    })
    expect(result.eligible).toBe(true)
  })

  // ── isNewPair flag ──
  it('should set isNewPair false when language_pair_configs entry exists', async () => {
    dbState.returnValues = [[{ autoPassThreshold: 93 }], [{ count: 100 }]]
    const result = await checkAutoPass({ ...BASE_INPUT })
    expect(result.isNewPair).toBe(false)
  })

  it('should set isNewPair true when no language_pair_configs entry', async () => {
    dbState.returnValues = [[], [{ count: 5 }]]
    const result = await checkAutoPass({ ...BASE_INPUT })
    expect(result.isNewPair).toBe(true)
  })

  // ── Rationale content ──
  it('should include score and threshold in eligible rationale', async () => {
    dbState.returnValues = [[{ autoPassThreshold: 93 }], [{ count: 60 }]]
    const result = await checkAutoPass({ ...BASE_INPUT, mqmScore: 96 })
    expect(result.eligible).toBe(true)
    expect(result.rationale).toContain('96')
    expect(result.rationale).toContain('93')
  })

  it('should handle count=null from DB (coalesce to 0)', async () => {
    dbState.returnValues = [[], [{ count: null }]]
    const result = await checkAutoPass({ ...BASE_INPUT })
    expect(result.fileCount).toBe(0)
    expect(result.eligible).toBe(false)
  })
})
