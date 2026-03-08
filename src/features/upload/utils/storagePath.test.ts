import { describe, expect, it } from 'vitest'

import { buildStoragePath } from './storagePath'

describe('buildStoragePath', () => {
  const tenantId = 'abc-123'
  const projectId = 'proj-456'
  const fileHash = 'e3b0c44298fc1c14'
  const fileName = 'report.sdlxliff'

  it('should build a correctly formatted path', () => {
    const path = buildStoragePath(tenantId, projectId, fileHash, fileName)
    expect(path).toBe('abc-123/proj-456/e3b0c44298fc1c14/report.sdlxliff')
  })

  it('should use / as separator', () => {
    const path = buildStoragePath(tenantId, projectId, fileHash, fileName)
    expect(path.split('/')).toHaveLength(4)
  })

  it('should place tenantId as the first segment', () => {
    const path = buildStoragePath(tenantId, projectId, fileHash, fileName)
    expect(path.startsWith(tenantId + '/')).toBe(true)
  })

  it('should place fileName as the last segment', () => {
    const path = buildStoragePath(tenantId, projectId, fileHash, fileName)
    expect(path.endsWith('/' + fileName)).toBe(true)
  })

  it('should work with UUID-format IDs', () => {
    const path = buildStoragePath(
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      'a'.repeat(64),
      'data.xlsx',
    )
    expect(path).toBe(
      '00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/' +
        'a'.repeat(64) +
        '/data.xlsx',
    )
  })

  it('should strip path traversal sequences from fileName', () => {
    const path = buildStoragePath(tenantId, projectId, fileHash, '../../etc/passwd')
    expect(path).not.toContain('..')
    expect(path).not.toContain('etc/passwd')
    // last segment should not escape to parent dirs
    const segments = path.split('/')
    expect(segments).toHaveLength(4)
  })

  it('should strip forward slashes from fileName', () => {
    const path = buildStoragePath(tenantId, projectId, fileHash, 'sub/dir/report.sdlxliff')
    expect(path.split('/')).toHaveLength(4)
  })

  it('should strip backslashes from fileName', () => {
    const path = buildStoragePath(tenantId, projectId, fileHash, 'sub\\dir\\report.sdlxliff')
    expect(path).not.toContain('\\')
    expect(path.split('/')).toHaveLength(4)
  })

  it('should strip null bytes from fileName', () => {
    const path = buildStoragePath(tenantId, projectId, fileHash, 'report\0.sdlxliff')
    expect(path).not.toContain('\0')
  })

  // 2.1-UNIT-004 [P1]: Path traversal guard — deep attack vectors
  it('should sanitize deep path traversal with forward slashes from fileName', () => {
    const path = buildStoragePath(tenantId, projectId, fileHash, '../../etc/passwd.sdlxliff')
    // After sanitization: ".." removed, "/" removed → result is "etcpasswd.sdlxliff"
    expect(path).not.toContain('..')
    // Should still have exactly 4 segments (tenant/project/hash/sanitizedName)
    const segments = path.split('/')
    expect(segments).toHaveLength(4)
    // The last segment (filename) must not contain path separators
    expect(segments[3]).not.toContain('/')
    expect(segments[3]).toBe('etcpasswd.sdlxliff')
  })

  it('should sanitize Windows-style path traversal with backslashes from fileName', () => {
    const path = buildStoragePath(
      tenantId,
      projectId,
      fileHash,
      '..\\..\\windows\\system32.sdlxliff',
    )
    expect(path).not.toContain('..')
    expect(path).not.toContain('\\')
    const segments = path.split('/')
    expect(segments).toHaveLength(4)
    expect(segments[3]).toBe('windowssystem32.sdlxliff')
  })

  it('should not modify a normal filename without traversal characters', () => {
    const normalName = 'my-report_2025.sdlxliff'
    const path = buildStoragePath(tenantId, projectId, fileHash, normalName)
    expect(path).toBe(`${tenantId}/${projectId}/${fileHash}/${normalName}`)
  })
})
