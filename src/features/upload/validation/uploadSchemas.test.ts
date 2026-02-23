import { describe, expect, it } from 'vitest'

import { MAX_FILE_SIZE_BYTES } from '@/lib/constants'

import { checkDuplicateSchema, createBatchSchema, fileUploadSchema } from './uploadSchemas'

// Zod v4 enforces RFC4122 — must use valid version 4 UUID format
const VALID_UUID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

describe('fileUploadSchema', () => {
  it('should accept a valid sdlxliff file', () => {
    const result = fileUploadSchema.safeParse({
      fileName: 'report.sdlxliff',
      fileSizeBytes: 1024,
      fileType: 'sdlxliff',
      projectId: VALID_UUID,
    })
    expect(result.success).toBe(true)
  })

  it('should accept a valid xliff file', () => {
    const result = fileUploadSchema.safeParse({
      fileName: 'report.xlf',
      fileSizeBytes: 512,
      fileType: 'xliff',
      projectId: VALID_UUID,
    })
    expect(result.success).toBe(true)
  })

  it('should accept a valid xlsx file', () => {
    const result = fileUploadSchema.safeParse({
      fileName: 'data.xlsx',
      fileSizeBytes: 2048,
      fileType: 'xlsx',
      projectId: VALID_UUID,
    })
    expect(result.success).toBe(true)
  })

  it('should reject a file exceeding 15MB', () => {
    const result = fileUploadSchema.safeParse({
      fileName: 'large.sdlxliff',
      fileSizeBytes: MAX_FILE_SIZE_BYTES + 1,
      fileType: 'sdlxliff',
      projectId: VALID_UUID,
    })
    expect(result.success).toBe(false)
  })

  it('should reject an unsupported file type', () => {
    const result = fileUploadSchema.safeParse({
      fileName: 'doc.pdf',
      fileSizeBytes: 1024,
      fileType: 'pdf',
      projectId: VALID_UUID,
    })
    expect(result.success).toBe(false)
  })

  it('should reject an invalid project ID', () => {
    const result = fileUploadSchema.safeParse({
      fileName: 'report.sdlxliff',
      fileSizeBytes: 1024,
      fileType: 'sdlxliff',
      projectId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('should reject empty file name', () => {
    const result = fileUploadSchema.safeParse({
      fileName: '',
      fileSizeBytes: 1024,
      fileType: 'sdlxliff',
      projectId: VALID_UUID,
    })
    expect(result.success).toBe(false)
  })

  it('should accept a file exactly at 15MB limit', () => {
    const result = fileUploadSchema.safeParse({
      fileName: 'exact.sdlxliff',
      fileSizeBytes: MAX_FILE_SIZE_BYTES,
      fileType: 'sdlxliff',
      projectId: VALID_UUID,
    })
    expect(result.success).toBe(true)
  })
})

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
