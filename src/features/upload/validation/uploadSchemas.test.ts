import { describe, expect, it } from 'vitest'

// Zod v4 enforces RFC4122 — must use valid version 4 UUID format
const VALID_UUID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

import { checkDuplicateSchema, createBatchSchema } from './uploadSchemas'

describe('checkDuplicateSchema', () => {
  it('should accept a valid SHA-256 hash and project ID', () => {
    const result = checkDuplicateSchema.safeParse({
      fileHash: 'a'.repeat(64),
      projectId: VALID_UUID,
    })
    expect(result.success).toBe(true)
  })

  it('should reject a hash shorter than 64 chars', () => {
    const result = checkDuplicateSchema.safeParse({
      fileHash: 'abc123',
      projectId: VALID_UUID,
    })
    expect(result.success).toBe(false)
  })

  it('should reject a hash longer than 64 chars', () => {
    const result = checkDuplicateSchema.safeParse({
      fileHash: 'a'.repeat(65),
      projectId: VALID_UUID,
    })
    expect(result.success).toBe(false)
  })

  it('should reject an invalid project ID', () => {
    const result = checkDuplicateSchema.safeParse({
      fileHash: 'a'.repeat(64),
      projectId: 'bad-id',
    })
    expect(result.success).toBe(false)
  })
})

describe('createBatchSchema', () => {
  it('should accept a valid batch with 50 files', () => {
    const result = createBatchSchema.safeParse({
      projectId: VALID_UUID,
      fileCount: 50,
    })
    expect(result.success).toBe(true)
  })

  it('should reject a batch exceeding 50 files', () => {
    const result = createBatchSchema.safeParse({
      projectId: VALID_UUID,
      fileCount: 51,
    })
    expect(result.success).toBe(false)
  })

  it('should reject a batch with 0 files', () => {
    const result = createBatchSchema.safeParse({
      projectId: VALID_UUID,
      fileCount: 0,
    })
    expect(result.success).toBe(false)
  })
})
