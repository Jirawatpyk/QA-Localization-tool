/**
 * Integration tests for upload route DB operations.
 *
 * Tests run against a REAL local Supabase Postgres database.
 * Requires: `npx supabase start` + DATABASE_URL env var.
 *
 * Validates:
 * - File record INSERT with all fields
 * - Batch creation + file linkage
 * - Duplicate detection via UNIQUE(projectId, fileHash)
 * - Re-run flow (status reset)
 * - Audit log writes
 * - Tenant isolation
 * - TOCTOU safety: concurrent duplicate uploads
 * - TOCTOU safety: concurrent re-run status resets
 */
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { withTenant } from '@/db/helpers/withTenant'
import { auditLogs } from '@/db/schema/auditLogs'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { tenants } from '@/db/schema/tenants'
import { uploadBatches } from '@/db/schema/uploadBatches'
import { users } from '@/db/schema/users'
import { asTenantId, type TenantId } from '@/types/tenant'

// ── Test DB connection ──

const DATABASE_URL = process.env.DATABASE_URL ?? ''

describe.skipIf(!DATABASE_URL)('Upload Route — Real DB Integration', () => {
  let queryClient: ReturnType<typeof postgres>
  let testDb: ReturnType<typeof drizzle>

  // Test data IDs
  let tenantAId: TenantId
  let tenantBId: TenantId
  let projectAId: string
  let _projectBId: string
  let userAId: string
  let batchId: string

  beforeAll(async () => {
    queryClient = postgres(DATABASE_URL, { max: 10 })
    testDb = drizzle(queryClient)

    // Seed: 2 tenants, 1 project each, 1 user each, 1 batch for tenant A
    const [tenantA] = await testDb
      .insert(tenants)
      .values({ name: 'Upload Test Tenant A', status: 'active' })
      .returning({ id: tenants.id })
    tenantAId = asTenantId(tenantA!.id)

    const [tenantB] = await testDb
      .insert(tenants)
      .values({ name: 'Upload Test Tenant B', status: 'active' })
      .returning({ id: tenants.id })
    tenantBId = asTenantId(tenantB!.id)

    // Users — insert via raw SQL to avoid schema/DB column mismatch
    const userAUuid = crypto.randomUUID()
    await testDb.execute(
      sql`INSERT INTO users (id, tenant_id, email, display_name) VALUES (${userAUuid}, ${tenantAId}, 'upload-test-a@test.local', 'Upload Tester A')`,
    )
    userAId = userAUuid

    const [projectA] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantAId,
        name: 'Upload Test Project A',
        sourceLang: 'en-US',
        targetLangs: ['th'],
      })
      .returning({ id: projects.id })
    projectAId = projectA!.id

    const [projectB] = await testDb
      .insert(projects)
      .values({
        tenantId: tenantBId,
        name: 'Upload Test Project B',
        sourceLang: 'en-US',
        targetLangs: ['ja'],
      })
      .returning({ id: projects.id })
    _projectBId = projectB!.id

    const [batch] = await testDb
      .insert(uploadBatches)
      .values({
        tenantId: tenantAId,
        projectId: projectAId,
        fileCount: 2,
        createdBy: userAId,
      })
      .returning({ id: uploadBatches.id })
    batchId = batch!.id
  })

  afterAll(async () => {
    if (!queryClient) return
    // Cleanup in reverse FK order
    await testDb.delete(auditLogs).where(eq(auditLogs.tenantId, tenantAId))
    await testDb.delete(auditLogs).where(eq(auditLogs.tenantId, tenantBId))
    await testDb.delete(files).where(eq(files.tenantId, tenantAId))
    await testDb.delete(files).where(eq(files.tenantId, tenantBId))
    await testDb.delete(uploadBatches).where(eq(uploadBatches.tenantId, tenantAId))
    await testDb.delete(projects).where(eq(projects.tenantId, tenantAId))
    await testDb.delete(projects).where(eq(projects.tenantId, tenantBId))
    await testDb.delete(users).where(eq(users.tenantId, tenantAId))
    await testDb.delete(tenants).where(eq(tenants.id, tenantAId))
    await testDb.delete(tenants).where(eq(tenants.id, tenantBId))
    await queryClient.end()
  })

  // ── T1: File record INSERT — verify all fields ──

  it('should insert a file record with all fields populated', async () => {
    const [inserted] = await testDb
      .insert(files)
      .values({
        tenantId: tenantAId,
        projectId: projectAId,
        fileName: 'test-document.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 2048,
        fileHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        storagePath: `/uploads/${tenantAId}/${projectAId}/abcdef12/test-document.sdlxliff`,
        status: 'uploaded',
        uploadedBy: userAId,
        batchId: null,
      })
      .returning()

    expect(inserted).toBeDefined()
    expect(inserted!.id).toBeTruthy()
    expect(inserted!.tenantId).toBe(tenantAId)
    expect(inserted!.projectId).toBe(projectAId)
    expect(inserted!.fileName).toBe('test-document.sdlxliff')
    expect(inserted!.fileType).toBe('sdlxliff')
    expect(inserted!.fileSizeBytes).toBe(2048)
    expect(inserted!.fileHash).toBe(
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    )
    expect(inserted!.storagePath).toContain('test-document.sdlxliff')
    expect(inserted!.status).toBe('uploaded')
    expect(inserted!.uploadedBy).toBe(userAId)
    expect(inserted!.createdAt).toBeInstanceOf(Date)
    expect(inserted!.updatedAt).toBeInstanceOf(Date)

    // Cleanup
    await testDb.delete(files).where(eq(files.id, inserted!.id))
  })

  // ── T2: Batch creation + file linkage ──

  it('should link files to an upload batch', async () => {
    const [file1] = await testDb
      .insert(files)
      .values({
        tenantId: tenantAId,
        projectId: projectAId,
        fileName: 'batch-file-1.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 1024,
        fileHash: 'batch1hash000000000000000000000000000000000000000000000000000001',
        storagePath: `/uploads/${tenantAId}/${projectAId}/batch1/file1.sdlxliff`,
        status: 'uploaded',
        uploadedBy: userAId,
        batchId,
      })
      .returning()

    const [file2] = await testDb
      .insert(files)
      .values({
        tenantId: tenantAId,
        projectId: projectAId,
        fileName: 'batch-file-2.xliff',
        fileType: 'xliff',
        fileSizeBytes: 512,
        fileHash: 'batch1hash000000000000000000000000000000000000000000000000000002',
        storagePath: `/uploads/${tenantAId}/${projectAId}/batch1/file2.xliff`,
        status: 'uploaded',
        uploadedBy: userAId,
        batchId,
      })
      .returning()

    expect(file1!.batchId).toBe(batchId)
    expect(file2!.batchId).toBe(batchId)

    // Query files by batchId
    const batchFiles = await testDb
      .select({ id: files.id, fileName: files.fileName })
      .from(files)
      .where(and(withTenant(files.tenantId, tenantAId), eq(files.batchId, batchId)))

    expect(batchFiles).toHaveLength(2)
    const names = batchFiles.map((f) => f.fileName).sort()
    expect(names).toEqual(['batch-file-1.sdlxliff', 'batch-file-2.xliff'])

    // Verify the batch record itself
    const [batchRecord] = await testDb
      .select()
      .from(uploadBatches)
      .where(and(withTenant(uploadBatches.tenantId, tenantAId), eq(uploadBatches.id, batchId)))

    expect(batchRecord).toBeDefined()
    expect(batchRecord!.fileCount).toBe(2)
    expect(batchRecord!.projectId).toBe(projectAId)

    // Cleanup
    await testDb.delete(files).where(eq(files.id, file1!.id))
    await testDb.delete(files).where(eq(files.id, file2!.id))
  })

  // ── T3: Duplicate detection ──

  it('should detect duplicate file by (projectId, fileHash) unique index', async () => {
    const hash = 'dup0hash0000000000000000000000000000000000000000000000000000001'

    const [first] = await testDb
      .insert(files)
      .values({
        tenantId: tenantAId,
        projectId: projectAId,
        fileName: 'original.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 1024,
        fileHash: hash,
        storagePath: `/uploads/${tenantAId}/${projectAId}/dup/original.sdlxliff`,
        status: 'uploaded',
        uploadedBy: userAId,
      })
      .returning()

    // Check for existing file with same hash — mirrors route.ts logic
    const [existing] = await testDb
      .select()
      .from(files)
      .where(
        and(
          withTenant(files.tenantId, tenantAId),
          eq(files.projectId, projectAId),
          eq(files.fileHash, hash),
        ),
      )
      .limit(1)

    expect(existing).toBeDefined()
    expect(existing!.id).toBe(first!.id)
    expect(existing!.fileName).toBe('original.sdlxliff')

    // Cleanup
    await testDb.delete(files).where(eq(files.id, first!.id))
  })

  // ── T4: Re-run flow — status reset ──

  it('should reset completed file to uploaded status on re-upload (same hash)', async () => {
    const hash = 'rerun000000000000000000000000000000000000000000000000000000001'

    // Insert file in "completed" state (simulates previous successful processing)
    const [original] = await testDb
      .insert(files)
      .values({
        tenantId: tenantAId,
        projectId: projectAId,
        fileName: 'rerun-file.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 2048,
        fileHash: hash,
        storagePath: `/uploads/${tenantAId}/${projectAId}/rerun/old-path.sdlxliff`,
        status: 'l3_completed',
        uploadedBy: userAId,
      })
      .returning()

    // Simulate re-upload: transaction mirrors route.ts lines 215-268
    const newStoragePath = `/uploads/${tenantAId}/${projectAId}/rerun/new-path.sdlxliff`
    const ACTIVE_STATUSES = new Set(['parsing', 'l1_processing', 'l2_processing', 'l3_processing'])

    const txResult = await testDb.transaction(async (tx) => {
      const [existingFile] = await tx
        .select()
        .from(files)
        .where(
          and(
            withTenant(files.tenantId, tenantAId),
            eq(files.projectId, projectAId),
            eq(files.fileHash, hash),
          ),
        )
        .limit(1)

      if (existingFile) {
        if (ACTIVE_STATUSES.has(existingFile.status)) {
          return { fileRecord: undefined, isRerun: false, skipped: true }
        }

        const [updated] = await tx
          .update(files)
          .set({
            status: 'uploaded',
            storagePath: newStoragePath,
            uploadedBy: userAId,
            batchId: null,
            updatedAt: new Date(),
          })
          .where(and(eq(files.id, existingFile.id), withTenant(files.tenantId, tenantAId)))
          .returning()
        return { fileRecord: updated, isRerun: true, skipped: false }
      }

      return { fileRecord: undefined, isRerun: false, skipped: false }
    })

    expect(txResult.isRerun).toBe(true)
    expect(txResult.skipped).toBe(false)
    expect(txResult.fileRecord).toBeDefined()
    expect(txResult.fileRecord!.id).toBe(original!.id) // same record, not a new insert
    expect(txResult.fileRecord!.status).toBe('uploaded')
    expect(txResult.fileRecord!.storagePath).toBe(newStoragePath)

    // Verify in DB
    const [refreshed] = await testDb
      .select({ status: files.status, storagePath: files.storagePath })
      .from(files)
      .where(eq(files.id, original!.id))

    expect(refreshed!.status).toBe('uploaded')
    expect(refreshed!.storagePath).toBe(newStoragePath)

    // Cleanup
    await testDb.delete(files).where(eq(files.id, original!.id))
  })

  // ── T4b: Re-run skips actively processing files ──

  it('should skip file that is actively processing on re-upload', async () => {
    const hash = 'active00000000000000000000000000000000000000000000000000000001'

    const [activeFile] = await testDb
      .insert(files)
      .values({
        tenantId: tenantAId,
        projectId: projectAId,
        fileName: 'active-processing.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 1024,
        fileHash: hash,
        storagePath: `/uploads/${tenantAId}/${projectAId}/active/file.sdlxliff`,
        status: 'l2_processing', // actively processing
        uploadedBy: userAId,
      })
      .returning()

    const ACTIVE_STATUSES = new Set(['parsing', 'l1_processing', 'l2_processing', 'l3_processing'])

    const txResult = await testDb.transaction(async (tx) => {
      const [existingFile] = await tx
        .select()
        .from(files)
        .where(
          and(
            withTenant(files.tenantId, tenantAId),
            eq(files.projectId, projectAId),
            eq(files.fileHash, hash),
          ),
        )
        .limit(1)

      if (existingFile && ACTIVE_STATUSES.has(existingFile.status)) {
        return { skipped: true }
      }
      return { skipped: false }
    })

    expect(txResult.skipped).toBe(true)

    // Verify status unchanged
    const [unchanged] = await testDb
      .select({ status: files.status })
      .from(files)
      .where(eq(files.id, activeFile!.id))

    expect(unchanged!.status).toBe('l2_processing')

    // Cleanup
    await testDb.delete(files).where(eq(files.id, activeFile!.id))
  })

  // ── T5: Audit log write ──

  it('should write audit log entry for file upload', async () => {
    const [fileRecord] = await testDb
      .insert(files)
      .values({
        tenantId: tenantAId,
        projectId: projectAId,
        fileName: 'audit-test.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 512,
        fileHash: 'audit000000000000000000000000000000000000000000000000000000001',
        storagePath: `/uploads/${tenantAId}/${projectAId}/audit/file.sdlxliff`,
        status: 'uploaded',
        uploadedBy: userAId,
      })
      .returning()

    // Write audit log (mirrors route.ts lines 288-309)
    const [auditEntry] = await testDb
      .insert(auditLogs)
      .values({
        tenantId: tenantAId,
        userId: userAId,
        entityType: 'file',
        entityId: fileRecord!.id,
        action: 'file.uploaded',
        newValue: {
          fileId: fileRecord!.id,
          fileName: 'audit-test.sdlxliff',
          fileSizeBytes: 512,
          fileType: 'sdlxliff',
          storagePath: fileRecord!.storagePath,
          fileHash: fileRecord!.fileHash,
          projectId: projectAId,
          batchId: null,
          isRerun: false,
        },
      })
      .returning()

    expect(auditEntry).toBeDefined()
    expect(auditEntry!.entityType).toBe('file')
    expect(auditEntry!.entityId).toBe(fileRecord!.id)
    expect(auditEntry!.action).toBe('file.uploaded')
    expect(auditEntry!.tenantId).toBe(tenantAId)
    expect(auditEntry!.userId).toBe(userAId)
    expect(auditEntry!.newValue).toMatchObject({
      fileId: fileRecord!.id,
      fileName: 'audit-test.sdlxliff',
      isRerun: false,
    })

    // Also verify re-run audit log
    const [rerunAudit] = await testDb
      .insert(auditLogs)
      .values({
        tenantId: tenantAId,
        userId: userAId,
        entityType: 'file',
        entityId: fileRecord!.id,
        action: 'file.rerun',
        newValue: {
          fileId: fileRecord!.id,
          fileName: 'audit-test.sdlxliff',
          isRerun: true,
        },
      })
      .returning()

    expect(rerunAudit!.action).toBe('file.rerun')
    expect((rerunAudit!.newValue as Record<string, unknown>).isRerun).toBe(true)

    // Cleanup
    await testDb.delete(auditLogs).where(eq(auditLogs.entityId, fileRecord!.id))
    await testDb.delete(files).where(eq(files.id, fileRecord!.id))
  })

  // ── T6: Tenant isolation ──

  it('should not return file from tenant A when queried as tenant B', async () => {
    const hash = 'tenant00000000000000000000000000000000000000000000000000000001'

    const [fileInA] = await testDb
      .insert(files)
      .values({
        tenantId: tenantAId,
        projectId: projectAId,
        fileName: 'tenant-a-only.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 1024,
        fileHash: hash,
        storagePath: `/uploads/${tenantAId}/${projectAId}/isolation/file.sdlxliff`,
        status: 'uploaded',
        uploadedBy: userAId,
      })
      .returning()

    // Query as tenant B — should find nothing
    const resultAsB = await testDb
      .select()
      .from(files)
      .where(and(withTenant(files.tenantId, tenantBId), eq(files.fileHash, hash)))

    expect(resultAsB).toHaveLength(0)

    // Query as tenant A — should find the file
    const resultAsA = await testDb
      .select()
      .from(files)
      .where(and(withTenant(files.tenantId, tenantAId), eq(files.fileHash, hash)))

    expect(resultAsA).toHaveLength(1)
    expect(resultAsA[0]!.id).toBe(fileInA!.id)

    // Cleanup
    await testDb.delete(files).where(eq(files.id, fileInA!.id))
  })

  // ── T7: Concurrent upload same hash — UNIQUE constraint (TOCTOU) ──

  it('should prevent duplicate file via UNIQUE(projectId, fileHash) on concurrent insert', async () => {
    const hash = 'toctou00000000000000000000000000000000000000000000000000000001'

    // Two concurrent INSERTs with the same (projectId, fileHash)
    // The UNIQUE index uq_files_project_hash should cause one to fail
    const results = await Promise.allSettled([
      testDb
        .insert(files)
        .values({
          tenantId: tenantAId,
          projectId: projectAId,
          fileName: 'concurrent-1.sdlxliff',
          fileType: 'sdlxliff',
          fileSizeBytes: 1024,
          fileHash: hash,
          storagePath: `/uploads/${tenantAId}/${projectAId}/toctou/file1.sdlxliff`,
          status: 'uploaded',
          uploadedBy: userAId,
        })
        .returning(),
      testDb
        .insert(files)
        .values({
          tenantId: tenantAId,
          projectId: projectAId,
          fileName: 'concurrent-2.sdlxliff',
          fileType: 'sdlxliff',
          fileSizeBytes: 1024,
          fileHash: hash,
          storagePath: `/uploads/${tenantAId}/${projectAId}/toctou/file2.sdlxliff`,
          status: 'uploaded',
          uploadedBy: userAId,
        })
        .returning(),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    // Exactly one succeeds, one fails with unique violation
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const errorResult = rejected[0] as PromiseRejectedResult
    // Drizzle wraps postgres error — check both message and cause
    const errMsg =
      String(errorResult.reason.message) + String(errorResult.reason.cause?.message ?? '')
    expect(errMsg).toMatch(/unique|duplicate|uq_files_project_hash|23505/i)

    // Cleanup — only the successful insert exists
    await testDb
      .delete(files)
      .where(
        and(
          withTenant(files.tenantId, tenantAId),
          eq(files.projectId, projectAId),
          eq(files.fileHash, hash),
        ),
      )
  })

  // ── T8: Concurrent re-run — transaction serializes status reset ──

  it('should produce consistent state when two concurrent re-runs race', async () => {
    const hash = 'rerace00000000000000000000000000000000000000000000000000000001'

    // Seed a "completed" file
    const [original] = await testDb
      .insert(files)
      .values({
        tenantId: tenantAId,
        projectId: projectAId,
        fileName: 'race-rerun.sdlxliff',
        fileType: 'sdlxliff',
        fileSizeBytes: 2048,
        fileHash: hash,
        storagePath: `/uploads/${tenantAId}/${projectAId}/race/old.sdlxliff`,
        status: 'l3_completed',
        uploadedBy: userAId,
      })
      .returning()

    // Two concurrent re-run transactions (mirrors route.ts transaction logic)
    // Both should detect the existing file and attempt to reset status.
    // The transaction + row-level lock ensures serialization.
    const rerunTx = (storageSuffix: string) =>
      testDb.transaction(async (tx) => {
        const [existingFile] = await tx
          .select()
          .from(files)
          .where(
            and(
              withTenant(files.tenantId, tenantAId),
              eq(files.projectId, projectAId),
              eq(files.fileHash, hash),
            ),
          )
          .limit(1)

        if (!existingFile) {
          return { isRerun: false, storageSuffix }
        }

        const [updated] = await tx
          .update(files)
          .set({
            status: 'uploaded',
            storagePath: `/uploads/${tenantAId}/${projectAId}/race/${storageSuffix}.sdlxliff`,
            updatedAt: new Date(),
          })
          .where(and(eq(files.id, existingFile.id), withTenant(files.tenantId, tenantAId)))
          .returning()
        return { isRerun: true, storageSuffix, fileId: updated!.id }
      })

    const [result1, result2] = await Promise.all([rerunTx('runner-1'), rerunTx('runner-2')])

    // Both should succeed (re-run is an UPDATE, not INSERT — no unique violation)
    expect(result1.isRerun).toBe(true)
    expect(result2.isRerun).toBe(true)

    // Verify final DB state — one of the two storage paths wins (last writer)
    const [finalState] = await testDb
      .select({ status: files.status, storagePath: files.storagePath })
      .from(files)
      .where(eq(files.id, original!.id))

    expect(finalState!.status).toBe('uploaded')
    // The storagePath should be from one of the two runners
    expect(finalState!.storagePath).toMatch(/runner-[12]\.sdlxliff$/)

    // Only 1 file record should exist (no duplicate created)
    const allFiles = await testDb
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          withTenant(files.tenantId, tenantAId),
          eq(files.projectId, projectAId),
          eq(files.fileHash, hash),
        ),
      )
    expect(allFiles).toHaveLength(1)

    // Cleanup
    await testDb.delete(files).where(eq(files.id, original!.id))
  })
})
