/// <reference types="vitest/globals" />
import { describe, expect, it } from 'vitest'

const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

describe('paritySchemas', () => {
  it.skip('[P1] should validate generateParityReport input with projectId and xbenchReportFile', async () => {
    const { generateParityReportSchema } = await import('./paritySchemas')

    const result = generateParityReportSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      xbenchReportFile: 'report.xlsx',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.projectId).toBe(VALID_PROJECT_ID)
  })

  it.skip('[P1] should accept optional fileId in generateParityReport', async () => {
    const { generateParityReportSchema } = await import('./paritySchemas')

    // With fileId
    const withFileId = generateParityReportSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      xbenchReportFile: 'report.xlsx',
      fileId: VALID_FILE_ID,
    })
    expect(withFileId.success).toBe(true)

    // Without fileId (optional)
    const withoutFileId = generateParityReportSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      xbenchReportFile: 'report.xlsx',
    })
    expect(withoutFileId.success).toBe(true)
  })

  it.skip('[P1] should validate reportMissingCheck with all required fields', async () => {
    const { reportMissingCheckSchema } = await import('./paritySchemas')

    const result = reportMissingCheckSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      fileId: VALID_FILE_ID,
      segmentNumber: 42,
      expectedCategory: 'accuracy',
      expectedDescription: 'Number format inconsistency was not detected by the tool',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.segmentNumber).toBe(42)
    expect(result.data.expectedCategory).toBe('accuracy')
    expect(result.data.expectedDescription).toContain('Number format')
  })

  it.skip('[P1] should reject reportMissingCheck with segmentNumber <= 0', async () => {
    const { reportMissingCheckSchema } = await import('./paritySchemas')

    // segmentNumber = 0
    const zeroResult = reportMissingCheckSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      fileId: VALID_FILE_ID,
      segmentNumber: 0,
      expectedCategory: 'accuracy',
      expectedDescription: 'Missing check',
    })
    expect(zeroResult.success).toBe(false)

    // segmentNumber = -1
    const negativeResult = reportMissingCheckSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      fileId: VALID_FILE_ID,
      segmentNumber: -1,
      expectedCategory: 'accuracy',
      expectedDescription: 'Missing check',
    })
    expect(negativeResult.success).toBe(false)
  })

  it.skip('[P1] should reject reportMissingCheck with empty expectedDescription', async () => {
    const { reportMissingCheckSchema } = await import('./paritySchemas')

    const result = reportMissingCheckSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      fileId: VALID_FILE_ID,
      segmentNumber: 5,
      expectedCategory: 'terminology',
      expectedDescription: '',
    })

    expect(result.success).toBe(false)
  })
})
