import { readFileSync } from 'fs'
import { join } from 'path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Must be first in server-side test files
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { mockSelect, mockDownload, mockStorage } = vi.hoisted(() => {
  const mockDownload = vi.fn()
  const mockStorage = { from: vi.fn(() => ({ download: mockDownload })) }
  const mockSelect = vi.fn()
  return { mockSelect, mockDownload, mockStorage }
})

vi.mock('@/db/client', () => ({
  db: { select: mockSelect },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ storage: mockStorage })),
}))

const { mockRequireRole } = vi.hoisted(() => ({ mockRequireRole: vi.fn() }))
vi.mock('@/lib/auth/requireRole', () => ({ requireRole: mockRequireRole }))

const { mockWithTenant } = vi.hoisted(() => ({
  mockWithTenant: vi.fn((..._args: unknown[]) => 'tenant-filter'),
}))
vi.mock('@/db/helpers/withTenant', () => ({ withTenant: mockWithTenant }))

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  },
}))

// ─── Drizzle chain mock ────────────────────────────────────────────────────
function makeChain(returnValue: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(returnValue),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  return chain
}

// ─── Real Excel fixture helpers ─────────────────────────────────────────────
function readFixtureAsBlob(name: string) {
  const buf = readFileSync(join(process.cwd(), 'src', 'test', 'fixtures', 'excel', name))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return new Blob([ab])
}

// ─── Test helpers ──────────────────────────────────────────────────────────
const mockUser = {
  id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  email: 'test@example.com',
  tenantId: 'b2c3d4e5-f6a1-4b1c-9d2e-4f5a6b7c8d9e',
  role: 'qa_reviewer' as const,
}

const mockFile = {
  id: 'c3d4e5f6-a1b2-4c1d-ae3f-5a6b7c8d9e0f',
  projectId: 'd4e5f6a1-b2c3-4d1e-bf40-6b7c8d9e0f1a',
  tenantId: mockUser.tenantId,
  fileName: 'test.xlsx',
  fileType: 'xlsx',
  fileSizeBytes: 1024,
  storagePath: 'tenant/project/hash/test.xlsx',
  status: 'uploaded',
  fileHash: null,
  uploadedBy: null,
  batchId: null,
  createdAt: new Date(),
}

import { previewExcelColumns } from './previewExcelColumns.action'

describe('previewExcelColumns — UUID validation (C3)', () => {
  it('should return INVALID_INPUT for non-UUID fileId', async () => {
    const result = await previewExcelColumns('not-a-uuid')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INVALID_INPUT')
      expect(result.error).toContain('Invalid file ID format')
    }
  })

  it('should not call requireRole when fileId is invalid', async () => {
    await previewExcelColumns('bad-id')
    expect(mockRequireRole).not.toHaveBeenCalled()
  })
})

describe('previewExcelColumns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockUser)
  })

  it('should return FORBIDDEN when user lacks permissions', async () => {
    mockRequireRole.mockRejectedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Insufficient permissions',
    })
    const result = await previewExcelColumns(mockFile.id)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('FORBIDDEN')
    }
  })

  it('should return NOT_FOUND when file does not exist', async () => {
    const chain = makeChain([]) // empty = not found
    mockSelect.mockReturnValue(chain)
    // Must use valid UUID for C3 validation to pass
    const result = await previewExcelColumns('e5f6a1b2-c3d4-4e1f-af50-7c8d9e0f1a2b')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  it('should return INVALID_INPUT for non-xlsx file', async () => {
    const chain = makeChain([{ ...mockFile, fileType: 'sdlxliff' }])
    mockSelect.mockReturnValue(chain)
    const result = await previewExcelColumns(mockFile.id)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('INVALID_INPUT')
    }
  })

  it('should return STORAGE_ERROR when download fails', async () => {
    const chain = makeChain([mockFile])
    mockSelect.mockReturnValue(chain)
    mockDownload.mockResolvedValue({
      data: null,
      error: { message: 'Storage unavailable' },
    })
    const result = await previewExcelColumns(mockFile.id)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('STORAGE_ERROR')
    }
  })

  it('should return STORAGE_ERROR when arrayBuffer fails (E7 pattern)', async () => {
    const chain = makeChain([mockFile])
    mockSelect.mockReturnValue(chain)
    const faultyBlob = { arrayBuffer: vi.fn().mockRejectedValue(new Error('Buffer read error')) }
    mockDownload.mockResolvedValue({ data: faultyBlob, error: null })
    const result = await previewExcelColumns(mockFile.id)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('STORAGE_ERROR')
    }
  })

  it('should return preview data with headers from real fixture', async () => {
    const chain = makeChain([mockFile])
    mockSelect.mockReturnValue(chain)
    const blob = readFixtureAsBlob('bilingual-with-headers.xlsx')
    mockDownload.mockResolvedValue({ data: blob, error: null })

    const result = await previewExcelColumns(mockFile.id)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.headers).toContain('Source')
      expect(result.data.headers).toContain('Target')
      expect(result.data.previewRows.length).toBeGreaterThan(0)
      expect(result.data.totalRows).toBe(10)
      expect(result.data.columnCount).toBeGreaterThan(0)
    }
  })

  it('should auto-detect Source/Target columns', async () => {
    const chain = makeChain([mockFile])
    mockSelect.mockReturnValue(chain)
    const blob = readFixtureAsBlob('bilingual-with-headers.xlsx')
    mockDownload.mockResolvedValue({ data: blob, error: null })

    const result = await previewExcelColumns(mockFile.id)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.suggestedSourceColumn).toBe('Source')
      expect(result.data.suggestedTargetColumn).toBe('Target')
    }
  })

  it('should auto-detect Original/Translation columns', async () => {
    const chain = makeChain([mockFile])
    mockSelect.mockReturnValue(chain)
    const blob = readFixtureAsBlob('bilingual-auto-detect.xlsx')
    mockDownload.mockResolvedValue({ data: blob, error: null })

    const result = await previewExcelColumns(mockFile.id)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.suggestedSourceColumn).toBe('Original')
      expect(result.data.suggestedTargetColumn).toBe('Translation')
    }
  })

  it('should return null suggestions when no keywords match', async () => {
    const chain = makeChain([mockFile])
    mockSelect.mockReturnValue(chain)
    const blob = readFixtureAsBlob('bilingual-no-headers.xlsx')
    mockDownload.mockResolvedValue({ data: blob, error: null })

    const result = await previewExcelColumns(mockFile.id)
    expect(result.success).toBe(true)
    if (result.success) {
      // No header row — raw data is 'Hello', 'สวัสดี' → not matching keywords
      expect(result.data.suggestedSourceColumn).toBeNull()
    }
  })

  it('should return PARSE_ERROR for malformed Excel file', async () => {
    const chain = makeChain([mockFile])
    mockSelect.mockReturnValue(chain)
    const malformedBlob = readFixtureAsBlob('malformed.xlsx')
    mockDownload.mockResolvedValue({ data: malformedBlob, error: null })

    const result = await previewExcelColumns(mockFile.id)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('PARSE_ERROR')
    }
  })

  it('should return PARSE_ERROR when Excel file has no worksheets (H1)', async () => {
    const chain = makeChain([mockFile])
    mockSelect.mockReturnValue(chain)
    const noSheetsBlob = readFixtureAsBlob('no-worksheets.xlsx')
    mockDownload.mockResolvedValue({ data: noSheetsBlob, error: null })

    const result = await previewExcelColumns(mockFile.id)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('PARSE_ERROR')
      expect(result.error).toContain('no worksheets')
    }
  })

  it('should return exactly EXCEL_PREVIEW_ROWS (5) preview rows for fixture with 10 rows (M2)', async () => {
    const chain = makeChain([mockFile])
    mockSelect.mockReturnValue(chain)
    const blob = readFixtureAsBlob('bilingual-with-headers.xlsx')
    mockDownload.mockResolvedValue({ data: blob, error: null })

    const result = await previewExcelColumns(mockFile.id)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.previewRows.length).toBe(5)
    }
  })

  it('should enforce tenant isolation via withTenant', async () => {
    const chain = makeChain([mockFile])
    mockSelect.mockReturnValue(chain)
    const blob = readFixtureAsBlob('bilingual-with-headers.xlsx')
    mockDownload.mockResolvedValue({ data: blob, error: null })

    await previewExcelColumns(mockFile.id)
    expect(mockWithTenant).toHaveBeenCalledWith(expect.anything(), mockUser.tenantId)
  })
})
