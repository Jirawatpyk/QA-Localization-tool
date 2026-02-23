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

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  },
}))

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

function buildUpdateChain() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
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

    it('should write file.parsing_started audit log entry', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()
      buildInsertChain()

      mockDownload.mockResolvedValue({
        data: new Blob([MINIMAL_SDLXLIFF], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'file.parsing_started', entityId: FILE_ID }),
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

    it('should include tenantId in segment batch values (tenant isolation)', async () => {
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

    it('should write file.parse_failed audit log on storage error', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()

      mockDownload.mockResolvedValue({
        data: null,
        error: { message: 'Connection timeout' },
      })

      await parseFile(FILE_ID)

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'file.parse_failed' }),
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

    it('should write file.parse_failed audit log on parse error', async () => {
      buildSelectChain([mockFile])
      buildUpdateChain()

      mockDownload.mockResolvedValue({
        data: new Blob(['<not-xliff><root/></not-xliff>'], { type: 'application/xml' }),
        error: null,
      })

      await parseFile(FILE_ID)

      expect(mockWriteAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'file.parse_failed' }),
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
  })
})
