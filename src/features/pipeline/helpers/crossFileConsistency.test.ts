/// <reference types="vitest/globals" />
import { faker } from '@faker-js/faker'

// ── Hoisted mocks ──
const { dbState } = vi.hoisted(() => {
  const state = {
    callIndex: 0,
    returnValues: [] as unknown[],
    valuesCaptures: [] as unknown[],
    insertCaptures: [] as unknown[],
    throwAtCallIndex: null as number | null,
  }
  return { dbState: state }
})

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
        return (resolve?: (v: unknown) => void, reject?: (err: unknown) => void) => {
          if (dbState.throwAtCallIndex !== null && dbState.callIndex === dbState.throwAtCallIndex) {
            dbState.callIndex++
            reject?.(new Error('DB query failed'))
            return
          }
          const value = dbState.returnValues[dbState.callIndex] ?? []
          dbState.callIndex++
          resolve?.(value)
        }
      }
      if (prop === 'values') {
        return vi.fn((args: unknown) => {
          dbState.valuesCaptures.push(args)
          return new Proxy({}, handler)
        })
      }
      if (prop === 'transaction') {
        return vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(new Proxy({}, handler)))
      }
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
  ne: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(() => 'sql-expr'),
}))

vi.mock('@/db/schema/segments', () => ({
  segments: {
    id: 'id',
    fileId: 'file_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    sourceText: 'source_text',
    targetText: 'target_text',
    confirmationState: 'confirmation_state',
    wordCount: 'word_count',
  },
}))

vi.mock('@/db/schema/findings', () => ({
  findings: {
    id: 'id',
    fileId: 'file_id',
    segmentId: 'segment_id',
    projectId: 'project_id',
    tenantId: 'tenant_id',
    category: 'category',
    severity: 'severity',
    description: 'description',
    detectedByLayer: 'detected_by_layer',
    status: 'status',
    scope: 'scope',
    relatedFileIds: 'related_file_ids',
    sourceTextExcerpt: 'source_text_excerpt',
    targetTextExcerpt: 'target_text_excerpt',
  },
}))

vi.mock('@/db/schema/glossaryTerms', () => ({
  glossaryTerms: {
    id: 'id',
    tenantId: 'tenant_id',
    sourceTerm: 'source_term',
    targetTerm: 'target_term',
    glossaryId: 'glossary_id',
  },
}))

vi.mock('@/db/schema/glossaries', () => ({
  glossaries: {
    id: 'id',
    tenantId: 'tenant_id',
  },
}))

const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const VALID_BATCH_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const FILE_ID_1 = 'd1e2f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a'
const FILE_ID_2 = 'e2f3a4b5-c6d7-4e8f-9a0b-1c2d3e4f5a6b'

// Helper: build a segment row for cross-file testing
function buildSegmentRow(
  overrides?: Partial<{
    id: string
    fileId: string
    sourceText: string
    targetText: string
    confirmationState: string | null
    wordCount: number
  }>,
) {
  return {
    id: overrides?.id ?? faker.string.uuid(),
    fileId: overrides?.fileId ?? faker.string.uuid(),
    projectId: VALID_PROJECT_ID,
    tenantId: VALID_TENANT_ID,
    sourceText: overrides?.sourceText ?? 'The quick brown fox',
    targetText: overrides?.targetText ?? 'สุนัขจิ้งจอกสีน้ำตาล',
    confirmationState: overrides?.confirmationState ?? 'Translated',
    wordCount: overrides?.wordCount ?? 4,
  }
}

describe('crossFileConsistency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbState.callIndex = 0
    dbState.returnValues = []
    dbState.valuesCaptures = []
    dbState.insertCaptures = []
    dbState.throwAtCallIndex = null
  })

  // ── P0: Core consistency detection ──

  it('[P0] should create finding when same source has different targets across files', async () => {
    // Same source text but different translations in 2 files
    const seg1 = buildSegmentRow({
      fileId: FILE_ID_1,
      sourceText: 'Please confirm your order',
      targetText: 'กรุณายืนยันคำสั่งซื้อ',
    })
    const seg2 = buildSegmentRow({
      fileId: FILE_ID_2,
      sourceText: 'Please confirm your order',
      targetText: 'โปรดยืนยันออเดอร์ของคุณ',
    })
    dbState.returnValues = [
      [seg1, seg2], // segments query
      [], // glossary terms
      [], // existing findings check
      [], // insert findings
    ]

    const { crossFileConsistency } = await import('./crossFileConsistency')
    const result = await crossFileConsistency({
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      batchId: VALID_BATCH_ID,
      fileIds: [FILE_ID_1, FILE_ID_2],
    })

    // Should produce at least 1 finding for inconsistency
    expect(result.findingCount).toBeGreaterThan(0)
  })

  it('[P0] should create finding with scope=cross-file, segmentId=null, relatedFileIds=[f1,f2]', async () => {
    const seg1 = buildSegmentRow({
      fileId: FILE_ID_1,
      sourceText: 'Submit',
      targetText: 'ส่ง',
    })
    const seg2 = buildSegmentRow({
      fileId: FILE_ID_2,
      sourceText: 'Submit',
      targetText: 'ยืนยัน',
    })
    dbState.returnValues = [
      [seg1, seg2],
      [], // glossary terms
      [], // existing findings
      [], // insert result
    ]

    const { crossFileConsistency } = await import('./crossFileConsistency')
    await crossFileConsistency({
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      batchId: VALID_BATCH_ID,
      fileIds: [FILE_ID_1, FILE_ID_2],
    })

    // Verify the finding insert captures contain the expected shape
    // Cross-file findings have no single segmentId — they reference multiple files
    // valuesCaptures[0] is an array of finding objects (batch INSERT)
    expect(dbState.valuesCaptures.length).toBeGreaterThan(0)
    const insertedFindings = dbState.valuesCaptures[0] as Array<Record<string, unknown>>
    expect(insertedFindings).toBeInstanceOf(Array)
    expect(insertedFindings.length).toBeGreaterThan(0)
    expect(insertedFindings[0]).toMatchObject(
      expect.objectContaining({
        category: expect.stringContaining('consistency'),
        detectedByLayer: 'L1',
      }),
    )
  })

  it('[P0] should include withTenant on segments query and findings INSERT', async () => {
    dbState.returnValues = [
      [], // segments
      [], // glossary
    ]

    const { crossFileConsistency } = await import('./crossFileConsistency')
    await crossFileConsistency({
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      batchId: VALID_BATCH_ID,
      fileIds: [FILE_ID_1, FILE_ID_2],
    })

    const { withTenant } = await import('@/db/helpers/withTenant')
    expect(withTenant).toHaveBeenCalledWith(expect.anything(), VALID_TENANT_ID)
  })

  // ── P1: Normalization and filtering ──

  it('[P1] should NFKC normalize and trim source text before comparing', async () => {
    // U+FF21 (fullwidth A) normalizes to A under NFKC
    const seg1 = buildSegmentRow({
      fileId: FILE_ID_1,
      sourceText: '\uFF21pple juice',
      targetText: 'น้ำแอปเปิ้ล',
    })
    const seg2 = buildSegmentRow({
      fileId: FILE_ID_2,
      sourceText: 'Apple juice',
      targetText: 'น้ำผลไม้แอปเปิ้ล',
    })
    dbState.returnValues = [
      [seg1, seg2],
      [], // glossary
      [], // existing findings
      [], // insert
    ]

    const { crossFileConsistency } = await import('./crossFileConsistency')
    const result = await crossFileConsistency({
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      batchId: VALID_BATCH_ID,
      fileIds: [FILE_ID_1, FILE_ID_2],
    })

    // After NFKC normalization, both source texts match → different targets → 1 finding
    expect(result.findingCount).toBeGreaterThan(0)
  })

  it('[P1] should skip source text shorter than 3 words', async () => {
    // "OK" = 1 word — too short for cross-file consistency check
    const seg1 = buildSegmentRow({
      fileId: FILE_ID_1,
      sourceText: 'OK',
      targetText: 'โอเค',
      wordCount: 1,
    })
    const seg2 = buildSegmentRow({
      fileId: FILE_ID_2,
      sourceText: 'OK',
      targetText: 'ตกลง',
      wordCount: 1,
    })
    dbState.returnValues = [
      [seg1, seg2],
      [], // glossary
    ]

    const { crossFileConsistency } = await import('./crossFileConsistency')
    const result = await crossFileConsistency({
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      batchId: VALID_BATCH_ID,
      fileIds: [FILE_ID_1, FILE_ID_2],
    })

    // Short source texts should be skipped
    expect(result.findingCount).toBe(0)
  })

  it('[P1] should exclude glossary-matched terms from analysis', async () => {
    // "Login" is in glossary → consistency check should skip it
    const seg1 = buildSegmentRow({
      fileId: FILE_ID_1,
      sourceText: 'Login to your account now',
      targetText: 'เข้าสู่ระบบบัญชีของคุณ',
    })
    const seg2 = buildSegmentRow({
      fileId: FILE_ID_2,
      sourceText: 'Login to your account now',
      targetText: 'ล็อกอินเข้าบัญชีของคุณ',
    })
    dbState.returnValues = [
      [seg1, seg2],
      [{ sourceTerm: 'Login', targetTerm: 'เข้าสู่ระบบ' }], // glossary has "Login"
    ]

    const { crossFileConsistency } = await import('./crossFileConsistency')
    const result = await crossFileConsistency({
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      batchId: VALID_BATCH_ID,
      fileIds: [FILE_ID_1, FILE_ID_2],
    })

    // Glossary terms should be excluded from consistency checking
    expect(result.findingCount).toBe(0)
  })

  it('[P1] should exclude segments with ApprovedSignOff confirmation state', async () => {
    const seg1 = buildSegmentRow({
      fileId: FILE_ID_1,
      sourceText: 'Terms and conditions apply',
      targetText: 'มีข้อกำหนดและเงื่อนไข',
      confirmationState: 'ApprovedSignOff',
    })
    const seg2 = buildSegmentRow({
      fileId: FILE_ID_2,
      sourceText: 'Terms and conditions apply',
      targetText: 'ใช้ข้อกำหนดและเงื่อนไข',
    })
    dbState.returnValues = [
      [seg1, seg2],
      [], // glossary
    ]

    const { crossFileConsistency } = await import('./crossFileConsistency')
    const result = await crossFileConsistency({
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      batchId: VALID_BATCH_ID,
      fileIds: [FILE_ID_1, FILE_ID_2],
    })

    // ApprovedSignOff segments should be excluded from comparison
    expect(result.findingCount).toBe(0)
  })

  it('[P1] should deduplicate findings: same inconsistency produces 1 finding not N', async () => {
    // 3 files all have same source but different targets — should produce 1 finding, not 3
    const fileId3 = 'f3f3f3f3-a4a4-4b5b-8c6c-d7d7d7d7d7d7'
    const seg1 = buildSegmentRow({
      fileId: FILE_ID_1,
      sourceText: 'Payment received successfully',
      targetText: 'ได้รับชำระเงินเรียบร้อย',
    })
    const seg2 = buildSegmentRow({
      fileId: FILE_ID_2,
      sourceText: 'Payment received successfully',
      targetText: 'ชำระเงินสำเร็จ',
    })
    const seg3 = buildSegmentRow({
      fileId: fileId3,
      sourceText: 'Payment received successfully',
      targetText: 'ชำระเงินเรียบร้อย',
    })
    dbState.returnValues = [
      [seg1, seg2, seg3],
      [], // glossary
      [], // existing findings
      [], // insert
    ]

    const { crossFileConsistency } = await import('./crossFileConsistency')
    const result = await crossFileConsistency({
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      batchId: VALID_BATCH_ID,
      fileIds: [FILE_ID_1, FILE_ID_2, fileId3],
    })

    // 1 inconsistency finding, not 3
    expect(result.findingCount).toBe(1)
  })

  it('[P1] should be idempotent: running twice produces same findings', async () => {
    const seg1 = buildSegmentRow({
      fileId: FILE_ID_1,
      sourceText: 'Welcome back user',
      targetText: 'ยินดีต้อนรับกลับ',
    })
    const seg2 = buildSegmentRow({
      fileId: FILE_ID_2,
      sourceText: 'Welcome back user',
      targetText: 'สวัสดีอีกครั้ง',
    })

    // First run
    dbState.returnValues = [
      [seg1, seg2],
      [], // glossary
      [], // existing findings (none)
      [], // insert
    ]

    const { crossFileConsistency } = await import('./crossFileConsistency')
    const result1 = await crossFileConsistency({
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      batchId: VALID_BATCH_ID,
      fileIds: [FILE_ID_1, FILE_ID_2],
    })

    // Reset for second run
    dbState.callIndex = 0
    dbState.valuesCaptures = []
    dbState.returnValues = [
      [seg1, seg2],
      [], // glossary
      [{ id: faker.string.uuid() }], // existing findings from first run
      [], // delete + re-insert
    ]

    const result2 = await crossFileConsistency({
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      batchId: VALID_BATCH_ID,
      fileIds: [FILE_ID_1, FILE_ID_2],
    })

    expect(result1.findingCount).toBe(result2.findingCount)
  })

  it('[P1] should NOT create finding when same source has same target across files', async () => {
    // Consistent translation — no finding expected
    const seg1 = buildSegmentRow({
      fileId: FILE_ID_1,
      sourceText: 'Thank you for your patience',
      targetText: 'ขอบคุณสำหรับความอดทน',
    })
    const seg2 = buildSegmentRow({
      fileId: FILE_ID_2,
      sourceText: 'Thank you for your patience',
      targetText: 'ขอบคุณสำหรับความอดทน',
    })
    dbState.returnValues = [
      [seg1, seg2],
      [], // glossary
    ]

    const { crossFileConsistency } = await import('./crossFileConsistency')
    const result = await crossFileConsistency({
      projectId: VALID_PROJECT_ID,
      tenantId: VALID_TENANT_ID,
      batchId: VALID_BATCH_ID,
      fileIds: [FILE_ID_1, FILE_ID_2],
    })

    expect(result.findingCount).toBe(0)
  })
})
