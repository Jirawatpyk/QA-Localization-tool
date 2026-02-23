import { beforeEach, describe, expect, it, vi } from 'vitest'

// Must be first in server-side test files
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Use vi.hoisted to hoist mock refs (fixes "Cannot access before initialization" error)
const { mockSelect, mockUpdate, mockInsert, mockDownload, mockStorage } = vi.hoisted(() => {
  const mockDownload = vi.fn()
  const mockStorage = { from: vi.fn(() => ({ download: mockDownload })) }
  const mockInsert = vi.fn()
  const mockUpdate = vi.fn()
  const mockSelect = vi.fn()
  return { mockSelect, mockUpdate, mockInsert, mockDownload, mockStorage }
})

vi.mock('@/db/client', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ storage: mockStorage })),
}))

const { mockRequireRole } = vi.hoisted(() => ({ mockRequireRole: vi.fn() }))
vi.mock('@/lib/auth/requireRole', () => ({ requireRole: mockRequireRole }))

const { mockWriteAuditLog } = vi.hoisted(() => ({ mockWriteAuditLog: vi.fn() }))
vi.mock('@/features/audit/actions/writeAuditLog', () => ({ writeAuditLog: mockWriteAuditLog }))

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

import { MAX_PARSE_SIZE_BYTES } from '@/features/parser/constants'

import { parseFile } from './parseFile.action'

// ============================================================
// Test data
// ============================================================

const TENANT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const USER_ID = 'b1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8e'
const FILE_ID = 'c1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8f'
const PROJECT_ID = 'd1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8a'

const mockUser = {
  id: USER_ID,
  email: 'test@example.com',
  tenantId: TENANT_ID,
  role: 'qa_reviewer' as const,
}

const mockFile = {
  id: FILE_ID,
  projectId: PROJECT_ID,
  tenantId: TENANT_ID,
  fileName: 'test.sdlxliff',
  fileType: 'sdlxliff',
  fileSizeBytes: 1024,
  fileHash: null,
  storagePath: `${TENANT_ID}/${PROJECT_ID}/test.sdlxliff`,
  status: 'uploaded',
  uploadedBy: null,
  batchId: null,
  createdAt: new Date(),
}

const MINIMAL_SDLXLIFF = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2" xmlns:sdl="http://sdl.com/FileTypes/SdlXliff/1.0">
  <file original="test.docx" source-language="en-US" target-language="th-TH" datatype="x-sdlxliff">
    <body>
      <group id="g1">
        <trans-unit id="1">
          <source>Hello world</source>
          <seg-source><mrk mtype="seg" mid="1">Hello world</mrk></seg-source>
          <target><mrk mtype="seg" mid="1">สวัสดีโลก</mrk></target>
          <sdl:seg-defs><sdl:seg id="1" conf="Translated" percent="100" origin="tm"/></sdl:seg-defs>
        </trans-unit>
      </group>
    </body>
  </file>
</xliff>`

const MINIMAL_XLIFF = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="test.docx" source-language="en-US" target-language="de-DE" datatype="plaintext">
    <body>
      <trans-unit id="1">
        <source>Hello world</source>
        <target state="translated">Hallo Welt</target>
      </trans-unit>
    </body>
  </file>
</xliff>`

// ============================================================
// Chain builders
// ============================================================

function buildSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  }
  mockSelect.mockReturnValue(chain)
  return chain
}

function buildUpdateChain(casReturnRows: unknown[] = [{ id: FILE_ID }]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    // mockReturnThis so non-CAS awaits resolve to chain (non-thenable, fine for fire-and-forget)
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(casReturnRows),
  }
  mockUpdate.mockReturnValue(chain)
  return chain
}

function buildInsertChain() {
  const chain = {
    values: vi.fn().mockResolvedValue(undefined),
  }
  mockInsert.mockReturnValue(chain)
  return chain
}

// ============================================================
// Tests
// ============================================================

describe('parseFile action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireRole.mockResolvedValue(mockUser)
    mockWriteAuditLog.mockResolvedValue(undefined)
    // Re-bind mockStorage.from each time since clearAllMocks resets it
    mockStorage.from.mockReturnValue({ download: mockDownload })
  })

  describe('authentication', () => {
    it('should return FORBIDDEN when user lacks qa_reviewer role', async () => {
      mockRequireRole.mockRejectedValue({
        success: false,
        code: 'FORBIDDEN',
        error: 'Insufficient permissions',
      })

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('FORBIDDEN')
    })
  })

  describe('file lookup and tenant isolation', () => {
    it('should return NOT_FOUND when file does not exist for tenant', async () => {
      buildSelectChain([])
      buildUpdateChain()

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('NOT_FOUND')
    })
  })

  describe('successful parse flow', () => {
    it('should return success with correct segmentCount and fileId', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      buildInsertChain()

      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_SDLXLIFF], { type: 'application/xml' }),
        error: null,
      })

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.fileId).toBe(FILE_ID)
      expect(result.data.segmentCount).toBe(1)
    })

    it('should write file.parsing_started audit log entry with fileName and fileType (H8)', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      buildInsertChain()

      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_SDLXLIFF], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'file.parsing_started',
          entityId: FILE_ID,
          newValue: expect.objectContaining({ fileName: 'test.sdlxliff', fileType: 'sdlxliff' }),
        }),
      )
    })

    it('should write file.parsed audit log entry with segmentCount', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      buildInsertChain()

      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_SDLXLIFF], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'file.parsed',
          newValue: expect.objectContaining({ segmentCount: 1 }),
        }),
      )
    })

    it('should update file status to parsing then parsed', async () => {
      buildSelectChain([mockFile])
      const updateChain = buildUpdateChain()
      buildInsertChain()

      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_SDLXLIFF], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(updateChain.set).toHaveBeenCalledWith({ status: 'parsing' })
      expect(updateChain.set).toHaveBeenCalledWith({ status: 'parsed' })
    })

    it('should include all required fields in segment batch values (H6)', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      const insertChain = buildInsertChain()

      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_SDLXLIFF], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            tenantId: TENANT_ID,
            fileId: FILE_ID,
            projectId: PROJECT_ID,
            sourceLang: 'en-US',
            targetLang: 'th-TH',
            segmentNumber: 1,
            wordCount: expect.any(Number),
          }),
        ]),
      )
    })
  })

  describe('storage failure', () => {
    it('should return STORAGE_ERROR when storage download fails', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()

      mockDownload.mockResolvedValue({
        data: null,
        error: { message: 'Bucket not found' },
      })

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('STORAGE_ERROR')
    })

    it('should write file.parse_failed audit log with fileName and reason on storage error (H4, H8)', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()

      mockDownload.mockResolvedValue({
        data: null,
        error: { message: 'Connection timeout' },
      })

      await parseFile(FILE_ID)

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'file.parse_failed',
          newValue: expect.objectContaining({
            fileName: 'test.sdlxliff',
            reason: 'Connection timeout',
          }),
        }),
      )
    })

    it('should mark file as failed on storage error', async () => {
      buildSelectChain([mockFile])
      const updateChain = buildUpdateChain()

      mockDownload.mockResolvedValue({
        data: null,
        error: { message: 'timeout' },
      })

      await parseFile(FILE_ID)

      expect(updateChain.set).toHaveBeenCalledWith({ status: 'failed' })
    })
  })

  describe('parse failure', () => {
    it('should return PARSE_ERROR for invalid XLIFF content', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()

      mockDownload.mockResolvedValue({
        data: new Blob(['<not-xliff><root/></not-xliff>'], { type: 'application/xml' }),
        error: null,
      })

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('PARSE_ERROR')
    })

    it('should write file.parse_failed audit log with reason on parse error (H4)', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()

      mockDownload.mockResolvedValue({
        data: new Blob(['<not-xliff><root/></not-xliff>'], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'file.parse_failed',
          newValue: expect.objectContaining({
            reason: expect.stringContaining('Invalid file format'),
          }),
        }),
      )
    })

    it('should mark file as failed on parse error', async () => {
      buildSelectChain([mockFile])
      const updateChain = buildUpdateChain()

      mockDownload.mockResolvedValue({
        data: new Blob(['<not-xliff><root/></not-xliff>'], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(updateChain.set).toHaveBeenCalledWith({ status: 'failed' })
    })
  })

  describe('batch insert for memory efficiency', () => {
    it('should call insert once for files with segments < SEGMENT_BATCH_SIZE', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      const insertChain = buildInsertChain()

      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_SDLXLIFF], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(insertChain.values).toHaveBeenCalledTimes(1)
    })

    it('should call insert twice when segments exceed SEGMENT_BATCH_SIZE of 100 (H7)', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      const insertChain = buildInsertChain()

      // Generate XLIFF with 101 trans-units (crosses batch boundary at 100)
      const units = Array.from(
        { length: 101 },
        (_, i) =>
          `<trans-unit id="${i + 1}"><source>Segment ${i + 1}</source><target state="translated">Übersetzung ${i + 1}</target></trans-unit>`,
      ).join('\n')
      const largeXml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="large.docx" source-language="en-US" target-language="de-DE" datatype="plaintext">
    <body>${units}</body>
  </file>
</xliff>`

      mockDownload.mockResolvedValue({
        data: new Blob([largeXml], { type: 'application/xml' }),
        error: null,
      })

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segmentCount).toBe(101)
      // SEGMENT_BATCH_SIZE=100 → first insert: segments 1-100, second insert: segment 101
      expect(insertChain.values).toHaveBeenCalledTimes(2)
      // L3: verify second batch also has required tenant/project fields (regression guard)
      const secondBatchCall = insertChain.values.mock.calls[1]?.[0] as
        | Array<Record<string, unknown>>
        | undefined
      expect(secondBatchCall?.[0]).toMatchObject({
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        sourceLang: 'en-US',
        targetLang: 'de-DE',
      })
    })
  })

  describe('idempotency guard (H9)', () => {
    it('should return CONFLICT when file status is already "parsing"', async () => {
      buildSelectChain([{ ...mockFile, status: 'parsing' }])

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('CONFLICT')
      expect(result.error).toContain('parsing')
    })

    it('should return CONFLICT with "parsed" in error message when file status is "parsed" (L7)', async () => {
      buildSelectChain([{ ...mockFile, status: 'parsed' }])

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('CONFLICT')
      expect(result.error).toContain('parsed')
    })

    it('should return CONFLICT with "failed" in error message when file status is "failed" (L7)', async () => {
      buildSelectChain([{ ...mockFile, status: 'failed' }])

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('CONFLICT')
      expect(result.error).toContain('failed')
    })

    it('should return CONFLICT when CAS UPDATE returns empty rows (concurrent race condition) (H2)', async () => {
      buildSelectChain([mockFile])
      const updateChain = buildUpdateChain([]) // CAS returns empty — another call won the race

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('CONFLICT')
      // L1: audit log must NOT be written when CAS fails (return happens before writeAuditLog)
      expect(mockWriteAuditLog).not.toHaveBeenCalled()
      // M1: file must NOT be marked 'failed' — concurrent winner is processing it
      expect(updateChain.set).not.toHaveBeenCalledWith({ status: 'failed' })
      expect(mockWriteAuditLog).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'file.parse_failed' }),
      )
    })
  })

  describe('blob.text() read failure (tH1)', () => {
    it('should return STORAGE_ERROR when blob.text() throws', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      mockDownload.mockResolvedValue({
        data: { text: vi.fn().mockRejectedValue(new Error('OOM: buffer exceeded')) },
        error: null,
      })

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('STORAGE_ERROR')
    })

    it('should mark file as failed with blob error reason when blob.text() throws (tH1, H4)', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      mockDownload.mockResolvedValue({
        data: { text: vi.fn().mockRejectedValue(new Error('encoding error')) },
        error: null,
      })

      await parseFile(FILE_ID)

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'file.parse_failed',
          newValue: expect.objectContaining({
            fileName: 'test.sdlxliff',
            reason: 'encoding error',
          }),
        }),
      )
    })
  })

  describe('file too large — end-to-end through action (tH2)', () => {
    it('should return PARSE_ERROR when file fileSizeBytes exceeds MAX_PARSE_SIZE_BYTES', async () => {
      buildSelectChain([{ ...mockFile, fileSizeBytes: MAX_PARSE_SIZE_BYTES + 1 }])
      buildUpdateChain()
      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_SDLXLIFF], { type: 'application/xml' }),
        error: null,
      })

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('PARSE_ERROR')
      expect(result.error).toContain('15MB')
    })

    it('should write audit log with FILE_TOO_LARGE errorCode when size exceeds limit (tH2, H4)', async () => {
      buildSelectChain([{ ...mockFile, fileSizeBytes: MAX_PARSE_SIZE_BYTES + 1 }])
      buildUpdateChain()
      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_SDLXLIFF], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'file.parse_failed',
          newValue: expect.objectContaining({
            errorCode: 'FILE_TOO_LARGE',
          }),
        }),
      )
    })
  })

  describe('XLIFF fileType branch (tH3)', () => {
    it('should parse XLIFF file successfully when fileType is "xliff"', async () => {
      buildSelectChain([{ ...mockFile, fileType: 'xliff', fileName: 'test.xliff' }])
      buildUpdateChain()
      buildInsertChain()
      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_XLIFF], { type: 'application/xml' }),
        error: null,
      })

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segmentCount).toBe(1)
    })

    it('should insert segments with correct targetLang from XLIFF file (tH3)', async () => {
      buildSelectChain([{ ...mockFile, fileType: 'xliff', fileName: 'test.xliff' }])
      buildUpdateChain()
      const insertChain = buildInsertChain()
      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_XLIFF], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            tenantId: TENANT_ID,
            targetLang: 'de-DE',
          }),
        ]),
      )
    })

    it('should insert XLIFF segments with null matchPercentage and state-derived confirmationState (L3)', async () => {
      // XLIFF 1.2 has no TM percentage — matchPercentage must be null.
      // confirmationState derives from <target state="translated"> → 'Translated', not sdl:seg conf.
      buildSelectChain([{ ...mockFile, fileType: 'xliff', fileName: 'test.xliff' }])
      buildUpdateChain()
      const insertChain = buildInsertChain()
      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_XLIFF], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            matchPercentage: null,
            confirmationState: 'Translated', // XLIFF state="translated" → 'Translated'
          }),
        ]),
      )
    })
  })

  describe('tenant isolation via withTenant (tH5)', () => {
    it('should call withTenant with correct tenantId on every DB operation (tH5)', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      buildInsertChain()
      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_SDLXLIFF], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(mockWithTenant).toHaveBeenCalledWith(expect.anything(), TENANT_ID)
    })

    it('should call withTenant on markFileFailed UPDATE when storage fails (tH5)', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      mockDownload.mockResolvedValue({
        data: null,
        error: { message: 'timeout' },
      })

      await parseFile(FILE_ID)

      expect(mockWithTenant).toHaveBeenCalledWith(expect.anything(), TENANT_ID)
    })
  })

  describe('markFileFailed DB update failure (M2)', () => {
    it('should still return STORAGE_ERROR when markFileFailed db.update() throws (double failure)', async () => {
      // Simulate: storage download fails AND the recovery DB update also fails
      // Correct behaviour: return ActionResult with STORAGE_ERROR (not throw HTTP 500)
      buildSelectChain([mockFile])
      // First mockUpdate call = CAS (returns rows) — second call = markFileFailed update (throws)
      let callCount = 0
      mockUpdate.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // CAS: return rows so CAS succeeds
          return {
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([{ id: FILE_ID }]),
          }
        }
        // markFileFailed db.update: throws
        return {
          set: vi.fn().mockReturnThis(),
          where: vi.fn().mockRejectedValue(new Error('DB unavailable')),
        }
      })

      mockDownload.mockResolvedValue({
        data: null,
        error: { message: 'Storage down' },
      })

      const result = await parseFile(FILE_ID)

      // Must return ActionResult, NOT throw
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('STORAGE_ERROR')
    })
  })

  describe('database failure (H6)', () => {
    it('should return DB_ERROR when segment batch insert throws', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      mockInsert.mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('Connection refused')),
      })

      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_SDLXLIFF], { type: 'application/xml' }),
        error: null,
      })

      const result = await parseFile(FILE_ID)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('DB_ERROR')
    })

    it('should mark file as failed and write audit log with reason on DB insert error (H4, H6, H8)', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      mockInsert.mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('Connection refused')),
      })

      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_SDLXLIFF], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'file.parse_failed',
          newValue: expect.objectContaining({
            fileName: 'test.sdlxliff',
            reason: 'Connection refused',
          }),
        }),
      )
    })
  })
})
