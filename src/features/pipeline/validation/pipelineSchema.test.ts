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
