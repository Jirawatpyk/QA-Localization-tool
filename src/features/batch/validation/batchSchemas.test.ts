/// <reference types="vitest/globals" />
import { describe, expect, it } from 'vitest'

import { getBatchSummarySchema, getFileHistorySchema } from './batchSchemas'

const VALID_BATCH_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'

describe('batchSchemas', () => {
  it('should validate getBatchSummary input with valid batchId and projectId', () => {
    const result = getBatchSummarySchema.safeParse({
      batchId: VALID_BATCH_ID,
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.batchId).toBe(VALID_BATCH_ID)
    expect(result.data.projectId).toBe(VALID_PROJECT_ID)
  })

  it('should reject getBatchSummary input with missing batchId', () => {
    const result = getBatchSummarySchema.safeParse({
      projectId: VALID_PROJECT_ID,
    })

    expect(result.success).toBe(false)
  })

  it('should validate getFileHistory input with valid projectId', () => {
    const result = getFileHistorySchema.safeParse({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.projectId).toBe(VALID_PROJECT_ID)
    expect(result.data.filter).toBe('all')
  })

  it('should accept getFileHistory filter values: all, passed, needs_review, failed', () => {
    const validFilters = ['all', 'passed', 'needs_review', 'failed'] as const

    for (const filter of validFilters) {
      const result = getFileHistorySchema.safeParse({
        projectId: VALID_PROJECT_ID,
        filter,
      })
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.filter).toBe(filter)
    }
  })

  it('should reject getFileHistory with invalid filter value', () => {
    const result = getFileHistorySchema.safeParse({
      projectId: VALID_PROJECT_ID,
      filter: 'invalid_filter',
    })

    expect(result.success).toBe(false)
  })

  it('should accept optional page parameter', () => {
    const result = getFileHistorySchema.safeParse({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
      page: 2,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.page).toBe(2)
  })

  it('should reject page <= 0', () => {
    const result = getFileHistorySchema.safeParse({
      projectId: VALID_PROJECT_ID,
      filter: 'all',
      page: 0,
    })

    expect(result.success).toBe(false)
  })
})
