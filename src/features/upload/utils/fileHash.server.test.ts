vi.mock('server-only', () => ({}))

import { describe, expect, it } from 'vitest'

import { computeFileHash } from './fileHash.server'

describe('computeFileHash', () => {
  it('should return a 64-char hex SHA-256 hash', () => {
    const buffer = Buffer.from('hello world')
    const hash = computeFileHash(buffer)
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should return the correct SHA-256 for a known input', () => {
    const buffer = Buffer.from('hello world')
    const hash = computeFileHash(buffer)
    // SHA-256 of "hello world"
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })

  it('should return consistent hashes for the same input', () => {
    const buffer = Buffer.from('consistent content')
    expect(computeFileHash(buffer)).toBe(computeFileHash(buffer))
  })

  it('should return different hashes for different inputs', () => {
    const hash1 = computeFileHash(Buffer.from('file one'))
    const hash2 = computeFileHash(Buffer.from('file two'))
    expect(hash1).not.toBe(hash2)
  })

  it('should handle empty buffer', () => {
    const buffer = Buffer.alloc(0)
    const hash = computeFileHash(buffer)
    // SHA-256 of empty string
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})
