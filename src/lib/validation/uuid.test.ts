import { describe, expect, it } from 'vitest'

import { isUuid } from '@/lib/validation/uuid'

describe('isUuid', () => {
  it('should accept valid lowercase UUID', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('should accept valid uppercase UUID', () => {
    expect(isUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('should accept valid mixed-case UUID', () => {
    expect(isUuid('550e8400-E29B-41d4-a716-446655440000')).toBe(true)
  })

  it('should reject non-UUID string', () => {
    expect(isUuid('not-a-uuid')).toBe(false)
  })

  it('should reject short numeric string', () => {
    expect(isUuid('123')).toBe(false)
  })

  it('should reject empty string', () => {
    expect(isUuid('')).toBe(false)
  })

  it('should reject SQL injection pattern', () => {
    expect(isUuid("'; DROP TABLE--")).toBe(false)
  })

  it('should reject SQL injection OR pattern', () => {
    expect(isUuid("1' OR '1'='1")).toBe(false)
  })

  it('should reject XSS pattern', () => {
    expect(isUuid('<script>alert(1)</script>')).toBe(false)
  })

  it('should reject path traversal pattern', () => {
    expect(isUuid('../../etc/passwd')).toBe(false)
  })

  it('should reject UUID without hyphens', () => {
    expect(isUuid('550e8400e29b41d4a716446655440000')).toBe(false)
  })

  it('should reject UUID with extra characters', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false)
  })

  it('should reject "undefined" string', () => {
    expect(isUuid('undefined')).toBe(false)
  })

  it('should reject "null" string', () => {
    expect(isUuid('null')).toBe(false)
  })
})
