import { describe, expect, it } from 'vitest'

const VALID_FILE_ID_1 = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_FILE_ID_2 = 'b2c3d4e5-f6a7-4b2c-8d3e-4f5a6b7c8d9e'
const VALID_PROJECT_ID = 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f'

describe('startProcessingSchema', () => {
  it('should accept valid input with fileIds, projectId, mode', async () => {
    const { startProcessingSchema } = await import('./pipelineSchema')

    const result = startProcessingSchema.safeParse({
      fileIds: [VALID_FILE_ID_1, VALID_FILE_ID_2],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.fileIds).toHaveLength(2)
    expect(result.data.projectId).toBe(VALID_PROJECT_ID)
    expect(result.data.mode).toBe('economy')
  })

  it('should reject empty fileIds array', async () => {
    const { startProcessingSchema } = await import('./pipelineSchema')

    const result = startProcessingSchema.safeParse({
      fileIds: [],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
  })

  it('should reject invalid UUID in fileIds', async () => {
    const { startProcessingSchema } = await import('./pipelineSchema')

    const result = startProcessingSchema.safeParse({
      fileIds: ['not-a-valid-uuid'],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
  })

  it('should reject invalid mode value', async () => {
    const { startProcessingSchema } = await import('./pipelineSchema')

    const result = startProcessingSchema.safeParse({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'turbo',
    })

    expect(result.success).toBe(false)
  })

  it('should accept economy mode', async () => {
    const { startProcessingSchema } = await import('./pipelineSchema')

    const result = startProcessingSchema.safeParse({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.mode).toBe('economy')
  })

  it('should reject fileIds array with more than 100 items', async () => {
    const { startProcessingSchema } = await import('./pipelineSchema')
    const { faker } = await import('@faker-js/faker')

    const manyIds = Array.from({ length: 101 }, () => faker.string.uuid())

    const result = startProcessingSchema.safeParse({
      fileIds: manyIds,
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
  })

  it('should accept thorough mode', async () => {
    const { startProcessingSchema } = await import('./pipelineSchema')

    const result = startProcessingSchema.safeParse({
      fileIds: [VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'thorough',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.mode).toBe('thorough')
  })

  it('should accept exactly 100 fileIds (max boundary)', async () => {
    const { startProcessingSchema } = await import('./pipelineSchema')
    const { faker } = await import('@faker-js/faker')

    const maxIds = Array.from({ length: 100 }, () => faker.string.uuid())

    const result = startProcessingSchema.safeParse({
      fileIds: maxIds,
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(true)
  })

  it('should reject invalid projectId (non-UUID)', async () => {
    const { startProcessingSchema } = await import('./pipelineSchema')

    const result = startProcessingSchema.safeParse({
      fileIds: [VALID_FILE_ID_1],
      projectId: 'not-a-uuid',
      mode: 'economy',
    })

    expect(result.success).toBe(false)
  })

  it('should reject missing projectId', async () => {
    const { startProcessingSchema } = await import('./pipelineSchema')

    const result = startProcessingSchema.safeParse({
      fileIds: [VALID_FILE_ID_1],
      mode: 'economy',
    })

    expect(result.success).toBe(false)
  })

  it('should reject duplicate fileIds', async () => {
    const { startProcessingSchema } = await import('./pipelineSchema')

    const result = startProcessingSchema.safeParse({
      fileIds: [VALID_FILE_ID_1, VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
    // M2: pin the refine error message so regressions are caught immediately
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Duplicate file IDs are not allowed')
    }
  })

  // ── L2: mid-list duplicate ──

  it('should reject mid-list duplicate fileIds (not just head-to-head)', async () => {
    const { startProcessingSchema } = await import('./pipelineSchema')

    const result = startProcessingSchema.safeParse({
      fileIds: [VALID_FILE_ID_1, VALID_FILE_ID_2, VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
      mode: 'economy',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Duplicate file IDs are not allowed')
    }
  })
})

// ── getFilesWordCountSchema ──

describe('getFilesWordCountSchema', () => {
  it('should accept valid input with fileIds and projectId', async () => {
    const { getFilesWordCountSchema } = await import('./pipelineSchema')

    const result = getFilesWordCountSchema.safeParse({
      fileIds: [VALID_FILE_ID_1, VALID_FILE_ID_2],
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.fileIds).toHaveLength(2)
  })

  it('should reject empty fileIds array', async () => {
    const { getFilesWordCountSchema } = await import('./pipelineSchema')

    const result = getFilesWordCountSchema.safeParse({
      fileIds: [],
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
  })

  it('should reject fileIds with more than 100 items', async () => {
    const { getFilesWordCountSchema } = await import('./pipelineSchema')
    const { faker } = await import('@faker-js/faker')

    const manyIds = Array.from({ length: 101 }, () => faker.string.uuid())

    const result = getFilesWordCountSchema.safeParse({
      fileIds: manyIds,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
  })

  it('should accept exactly 100 fileIds (max boundary)', async () => {
    const { getFilesWordCountSchema } = await import('./pipelineSchema')
    const { faker } = await import('@faker-js/faker')

    const maxIds = Array.from({ length: 100 }, () => faker.string.uuid())

    const result = getFilesWordCountSchema.safeParse({
      fileIds: maxIds,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
  })

  it('should reject duplicate fileIds', async () => {
    const { getFilesWordCountSchema } = await import('./pipelineSchema')

    const result = getFilesWordCountSchema.safeParse({
      fileIds: [VALID_FILE_ID_1, VALID_FILE_ID_1],
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Duplicate file IDs are not allowed')
    }
  })

  it('should reject invalid UUID in fileIds', async () => {
    const { getFilesWordCountSchema } = await import('./pipelineSchema')

    const result = getFilesWordCountSchema.safeParse({
      fileIds: ['not-a-valid-uuid'],
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
  })

  it('should reject non-UUID projectId', async () => {
    const { getFilesWordCountSchema } = await import('./pipelineSchema')

    const result = getFilesWordCountSchema.safeParse({
      fileIds: [VALID_FILE_ID_1],
      projectId: 'not-a-uuid',
    })

    expect(result.success).toBe(false)
  })

  it('should reject missing projectId', async () => {
    const { getFilesWordCountSchema } = await import('./pipelineSchema')

    const result = getFilesWordCountSchema.safeParse({
      fileIds: [VALID_FILE_ID_1],
    })

    expect(result.success).toBe(false)
  })
})

// ── updateBudgetAlertThresholdSchema ──

describe('updateBudgetAlertThresholdSchema', () => {
  it('should accept valid input with projectId and thresholdPct', async () => {
    const { updateBudgetAlertThresholdSchema } = await import('./pipelineSchema')

    const result = updateBudgetAlertThresholdSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      thresholdPct: 80,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.thresholdPct).toBe(80)
  })

  it('should accept thresholdPct=1 (min boundary)', async () => {
    const { updateBudgetAlertThresholdSchema } = await import('./pipelineSchema')

    const result = updateBudgetAlertThresholdSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      thresholdPct: 1,
    })

    expect(result.success).toBe(true)
  })

  it('should accept thresholdPct=100 (max boundary)', async () => {
    const { updateBudgetAlertThresholdSchema } = await import('./pipelineSchema')

    const result = updateBudgetAlertThresholdSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      thresholdPct: 100,
    })

    expect(result.success).toBe(true)
  })

  it('should reject thresholdPct=0 (below min)', async () => {
    const { updateBudgetAlertThresholdSchema } = await import('./pipelineSchema')

    const result = updateBudgetAlertThresholdSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      thresholdPct: 0,
    })

    expect(result.success).toBe(false)
  })

  it('should reject thresholdPct=101 (above max)', async () => {
    const { updateBudgetAlertThresholdSchema } = await import('./pipelineSchema')

    const result = updateBudgetAlertThresholdSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      thresholdPct: 101,
    })

    expect(result.success).toBe(false)
  })

  it('should reject float thresholdPct (must be integer)', async () => {
    const { updateBudgetAlertThresholdSchema } = await import('./pipelineSchema')

    const result = updateBudgetAlertThresholdSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      thresholdPct: 50.5,
    })

    expect(result.success).toBe(false)
  })

  it('should reject non-UUID projectId', async () => {
    const { updateBudgetAlertThresholdSchema } = await import('./pipelineSchema')

    const result = updateBudgetAlertThresholdSchema.safeParse({
      projectId: 'not-a-uuid',
      thresholdPct: 80,
    })

    expect(result.success).toBe(false)
  })

  it('should reject missing thresholdPct', async () => {
    const { updateBudgetAlertThresholdSchema } = await import('./pipelineSchema')

    const result = updateBudgetAlertThresholdSchema.safeParse({
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
  })
})

// ── updateModelPinningSchema ──

describe('updateModelPinningSchema', () => {
  it('should accept valid L2 layer with model string', async () => {
    const { updateModelPinningSchema } = await import('./pipelineSchema')

    const result = updateModelPinningSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      layer: 'L2',
      model: 'gpt-4o-mini-2024-07-18',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.layer).toBe('L2')
    expect(result.data.model).toBe('gpt-4o-mini-2024-07-18')
  })

  it('should accept valid L3 layer with model string', async () => {
    const { updateModelPinningSchema } = await import('./pipelineSchema')

    const result = updateModelPinningSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      layer: 'L3',
      model: 'claude-sonnet-4-5-20250929',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.layer).toBe('L3')
  })

  it('should accept null model (clear pinning)', async () => {
    const { updateModelPinningSchema } = await import('./pipelineSchema')

    const result = updateModelPinningSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      layer: 'L2',
      model: null,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.model).toBeNull()
  })

  it('should reject empty string model (must be .min(1) or null)', async () => {
    const { updateModelPinningSchema } = await import('./pipelineSchema')

    const result = updateModelPinningSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      layer: 'L2',
      model: '',
    })

    expect(result.success).toBe(false)
  })

  it('should reject invalid layer value (L1 is not a pinnable layer)', async () => {
    const { updateModelPinningSchema } = await import('./pipelineSchema')

    const result = updateModelPinningSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      layer: 'L1',
      model: 'gpt-4o-mini',
    })

    expect(result.success).toBe(false)
  })

  it('should reject non-UUID projectId', async () => {
    const { updateModelPinningSchema } = await import('./pipelineSchema')

    const result = updateModelPinningSchema.safeParse({
      projectId: 'not-a-uuid',
      layer: 'L2',
      model: 'gpt-4o-mini',
    })

    expect(result.success).toBe(false)
  })

  it('should reject missing layer', async () => {
    const { updateModelPinningSchema } = await import('./pipelineSchema')

    const result = updateModelPinningSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      model: 'gpt-4o-mini',
    })

    expect(result.success).toBe(false)
  })

  it('should reject missing model field entirely', async () => {
    const { updateModelPinningSchema } = await import('./pipelineSchema')

    const result = updateModelPinningSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      layer: 'L2',
    })

    expect(result.success).toBe(false)
  })
})

// ── getProjectAiBudgetSchema ──

describe('getProjectAiBudgetSchema', () => {
  it('should accept valid projectId', async () => {
    const { getProjectAiBudgetSchema } = await import('./pipelineSchema')

    const result = getProjectAiBudgetSchema.safeParse({
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
  })

  it('should reject non-UUID projectId', async () => {
    const { getProjectAiBudgetSchema } = await import('./pipelineSchema')

    const result = getProjectAiBudgetSchema.safeParse({
      projectId: 'not-a-uuid',
    })

    expect(result.success).toBe(false)
  })

  it('should reject missing projectId', async () => {
    const { getProjectAiBudgetSchema } = await import('./pipelineSchema')

    const result = getProjectAiBudgetSchema.safeParse({})

    expect(result.success).toBe(false)
  })
})
