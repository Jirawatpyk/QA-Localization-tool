/// <reference types="vitest/globals" />
import { describe, expect, it } from 'vitest'

import {
  compareWithXbenchSchema,
  generateParityReportSchema,
  reportMissingCheckSchema,
} from './paritySchemas'

const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_FILE_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

describe('paritySchemas', () => {
  // ── generateParityReportSchema ──

  it('should validate generateParityReport input with projectId and xbenchReportBuffer', () => {
    const result = generateParityReportSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.projectId).toBe(VALID_PROJECT_ID)
  })

  it('should accept optional fileId in generateParityReport', () => {
    // With fileId
    const withFileId = generateParityReportSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
      fileId: VALID_FILE_ID,
    })
    expect(withFileId.success).toBe(true)

    // Without fileId (optional)
    const withoutFileId = generateParityReportSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
    })
    expect(withoutFileId.success).toBe(true)
  })

  it('should reject generateParityReport with invalid projectId', () => {
    const result = generateParityReportSchema.safeParse({
      projectId: 'not-a-uuid',
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
    })
    expect(result.success).toBe(false)
  })

  it('should reject generateParityReport with non-Uint8Array buffer', () => {
    const result = generateParityReportSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: 'string-not-buffer',
    })
    expect(result.success).toBe(false)
  })

  // ── compareWithXbenchSchema ──

  it('should validate compareWithXbench input with projectId and xbenchReportBuffer', () => {
    const result = compareWithXbenchSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.projectId).toBe(VALID_PROJECT_ID)
  })

  it('should accept optional fileId in compareWithXbench', () => {
    const withFileId = compareWithXbenchSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
      fileId: VALID_FILE_ID,
    })
    expect(withFileId.success).toBe(true)

    const withoutFileId = compareWithXbenchSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      xbenchReportBuffer: new Uint8Array([1, 2, 3]),
    })
    expect(withoutFileId.success).toBe(true)
  })

  // ── reportMissingCheckSchema ──

  it('should validate reportMissingCheck with all required fields', () => {
    const result = reportMissingCheckSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      fileReference: 'test-file.sdlxliff',
      segmentNumber: 42,
      expectedDescription: 'Number format inconsistency was not detected by the tool',
      xbenchCheckType: 'Numeric Mismatch',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.segmentNumber).toBe(42)
    expect(result.data.xbenchCheckType).toBe('Numeric Mismatch')
    expect(result.data.expectedDescription).toContain('Number format')
  })

  it('should reject reportMissingCheck with segmentNumber <= 0', () => {
    const zeroResult = reportMissingCheckSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      fileReference: 'test.sdlxliff',
      segmentNumber: 0,
      expectedDescription: 'Missing check',
      xbenchCheckType: 'Tag Mismatch',
    })
    expect(zeroResult.success).toBe(false)

    const negativeResult = reportMissingCheckSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      fileReference: 'test.sdlxliff',
      segmentNumber: -1,
      expectedDescription: 'Missing check',
      xbenchCheckType: 'Tag Mismatch',
    })
    expect(negativeResult.success).toBe(false)
  })

  it('should reject reportMissingCheck with empty expectedDescription', () => {
    const result = reportMissingCheckSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      fileReference: 'test.sdlxliff',
      segmentNumber: 5,
      expectedDescription: '',
      xbenchCheckType: 'Consistency',
    })

    expect(result.success).toBe(false)
  })

  it('should reject reportMissingCheck with empty xbenchCheckType', () => {
    const result = reportMissingCheckSchema.safeParse({
      projectId: VALID_PROJECT_ID,
      fileReference: 'test.sdlxliff',
      segmentNumber: 5,
      expectedDescription: 'Missing check',
      xbenchCheckType: '',
    })

    expect(result.success).toBe(false)
  })
})
