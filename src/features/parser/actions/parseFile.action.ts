'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { segments } from '@/db/schema/segments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { SEGMENT_BATCH_SIZE } from '@/features/parser/constants'
import { parseExcelBilingual } from '@/features/parser/excelParser'
import { parseXliff } from '@/features/parser/sdlxliffParser'
import type { ParsedSegment } from '@/features/parser/types'
import {
  type ExcelColumnMapping,
  excelColumnMappingSchema,
} from '@/features/parser/validation/excelMappingSchema'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ActionResult } from '@/types/actionResult'

type ParseFileResult = {
  segmentCount: number
  fileId: string
}

/**
 * Server Action: fetch file from Storage → parse → batch insert segments → update file status.
 *
 * File status transitions: uploaded → parsing → parsed | failed
 * Each transition writes an immutable audit log entry.
 *
 * @param columnMapping Required for xlsx files; ignored for XLIFF/SDLXLIFF.
 */
export async function parseFile(
  fileId: string,
  columnMapping?: ExcelColumnMapping,
): Promise<ActionResult<ParseFileResult>> {
  // C3: Validate fileId is a valid UUID before any DB/storage access
  if (!z.string().uuid().safeParse(fileId).success) {
    return { success: false, code: 'INVALID_INPUT', error: 'Invalid file ID format' }
  }

  // 6.2 — Auth check (M3 pattern)
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions to parse files' }
  }

  // 6.5 — Verify file belongs to tenant (withTenant + cross-tenant check)
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), withTenant(files.tenantId, currentUser.tenantId)))
    .limit(1)

  if (!file) {
    return { success: false, code: 'NOT_FOUND', error: 'File not found or access denied' }
  }

  // Idempotency guard — fast-path: detect non-uploadable status from cached SELECT result
  if (file.status !== 'uploaded') {
    return {
      success: false,
      code: 'CONFLICT',
      error: `File cannot be re-parsed: current status is '${file.status}'`,
    }
  }

  // 6.3 — Atomic CAS: transition file status from 'uploaded' to 'parsing'
  // AND status='uploaded' in WHERE prevents TOCTOU race from concurrent parseFile() calls
  const casResult = await db
    .update(files)
    .set({ status: 'parsing' })
    .where(
      and(
        eq(files.id, fileId),
        eq(files.status, 'uploaded'),
        withTenant(files.tenantId, currentUser.tenantId),
      ),
    )
    .returning({ id: files.id })

  if (casResult.length === 0) {
    // Race condition: another concurrent call won the CAS — file no longer in 'uploaded' state
    return {
      success: false,
      code: 'CONFLICT',
      error: `File cannot be re-parsed: current status is '${file.status}'`,
    }
  }

  // Audit log: file.parsing_started (must throw on failure per project-context rule)
  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'file',
    entityId: fileId,
    action: 'file.parsing_started',
    newValue: { fileName: file.fileName, fileType: file.fileType },
  })

  // 6.2 — Fetch file from Supabase Storage
  const admin = createAdminClient()
  const { data: blob, error: downloadError } = await admin.storage
    .from('project-files')
    .download(file.storagePath)

  if (downloadError || !blob) {
    await markFileFailed(fileId, currentUser.tenantId, currentUser.id, file.fileName, {
      reason: downloadError?.message ?? 'Storage download returned null',
    })
    return {
      success: false,
      code: 'STORAGE_ERROR',
      error: `Failed to download file from storage: ${downloadError?.message ?? 'unknown error'}`,
    }
  }

  // ─── Branch by fileType ───────────────────────────────────────────────────
  let parsedSegments: ParsedSegment[]
  let sourceLang: string
  let targetLang: string

  if (file.fileType === 'xlsx') {
    // Excel branch: requires columnMapping
    if (!columnMapping) {
      await markFileFailed(fileId, currentUser.tenantId, currentUser.id, file.fileName, {
        reason: 'Column mapping is required for Excel files',
      })
      return {
        success: false,
        code: 'INVALID_INPUT',
        error: 'Column mapping is required for Excel files',
      }
    }

    // C1: Validate columnMapping via Zod schema — Server Actions receive JSON; TypeScript
    // types are not enforced at runtime. Reject semantically invalid mapping before CAS.
    const mappingValidation = excelColumnMappingSchema.safeParse(columnMapping)
    if (!mappingValidation.success) {
      await markFileFailed(fileId, currentUser.tenantId, currentUser.id, file.fileName, {
        reason: 'Invalid column mapping',
        validationErrors: mappingValidation.error.flatten().fieldErrors,
      })
      return {
        success: false,
        code: 'INVALID_INPUT',
        error: `Invalid column mapping: ${mappingValidation.error.issues[0]?.message ?? 'validation failed'}`,
      }
    }
    columnMapping = mappingValidation.data

    // Read blob as ArrayBuffer (E7: wrap in try/catch)
    let buffer: ArrayBuffer
    try {
      buffer = await blob.arrayBuffer()
    } catch (err) {
      await markFileFailed(fileId, currentUser.tenantId, currentUser.id, file.fileName, {
        reason: err instanceof Error ? err.message : 'Failed to read file content from blob',
      })
      return {
        success: false,
        code: 'STORAGE_ERROR',
        error: 'Failed to read file content from storage blob',
      }
    }

    // Fetch project record for source/target language (Excel has no embedded language metadata)
    const [project] = await db
      .select({ sourceLang: projects.sourceLang, targetLangs: projects.targetLangs })
      .from(projects)
      .where(
        and(eq(projects.id, file.projectId), withTenant(projects.tenantId, currentUser.tenantId)),
      )
      .limit(1)

    if (!project) {
      await markFileFailed(fileId, currentUser.tenantId, currentUser.id, file.fileName, {
        reason: 'Project not found for language resolution',
      })
      return {
        success: false,
        code: 'NOT_FOUND',
        error: 'Project not found',
      }
    }

    sourceLang = project.sourceLang
    // targetLangs is a jsonb string[] — use first element as default
    targetLang = project.targetLangs[0] ?? 'und'

    const parseResult = await parseExcelBilingual(
      buffer,
      columnMapping,
      file.fileSizeBytes,
      sourceLang,
      targetLang,
    )

    if (!parseResult.success) {
      await markFileFailed(fileId, currentUser.tenantId, currentUser.id, file.fileName, {
        reason: parseResult.error.message,
        errorCode: parseResult.error.code,
      })
      return {
        success: false,
        code: 'PARSE_ERROR',
        error: parseResult.error.message,
      }
    }

    parsedSegments = parseResult.data.segments
    // Language may be overridden per-row via languageColumn; use project defaults for batch insert
    // (per-row language is already stored in each ParsedSegment.targetLang)
  } else {
    // XLIFF/SDLXLIFF branch (unchanged)
    let xmlContent: string
    try {
      xmlContent = await blob.text()
    } catch (err) {
      await markFileFailed(fileId, currentUser.tenantId, currentUser.id, file.fileName, {
        reason: err instanceof Error ? err.message : 'Failed to read file content from blob',
      })
      return {
        success: false,
        code: 'STORAGE_ERROR',
        error: 'Failed to read file content from storage blob',
      }
    }

    const fileType = file.fileType === 'sdlxliff' ? 'sdlxliff' : 'xliff'
    const parseResult = parseXliff(xmlContent, fileType, file.fileSizeBytes)

    if (!parseResult.success) {
      await markFileFailed(fileId, currentUser.tenantId, currentUser.id, file.fileName, {
        reason: parseResult.error.message,
        errorCode: parseResult.error.code,
      })
      return {
        success: false,
        code: 'PARSE_ERROR',
        error: parseResult.error.message,
      }
    }

    parsedSegments = parseResult.data.segments
    sourceLang = parseResult.data.sourceLang
    targetLang = parseResult.data.targetLang
  }

  // 6.4 — Batch insert segments (100 per INSERT for memory efficiency)
  try {
    await batchInsertSegments(parsedSegments, file.id, file.projectId, currentUser.tenantId)
  } catch (err) {
    await markFileFailed(fileId, currentUser.tenantId, currentUser.id, file.fileName, {
      reason: err instanceof Error ? err.message : 'Batch insert failed',
    })
    return {
      success: false,
      code: 'DB_ERROR',
      error: 'Failed to save parsed segments to database',
    }
  }

  // 6.3 — Update file status to 'parsed'
  await db
    .update(files)
    .set({ status: 'parsed' })
    .where(and(eq(files.id, fileId), withTenant(files.tenantId, currentUser.tenantId)))

  // Audit log: file.parsed (must throw on failure)
  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'file',
    entityId: fileId,
    action: 'file.parsed',
    newValue: {
      fileName: file.fileName,
      segmentCount: parsedSegments.length,
    },
  })

  return {
    success: true,
    data: {
      segmentCount: parsedSegments.length,
      fileId,
    },
  }
}

// ============================================================
// Helpers
// ============================================================

async function batchInsertSegments(
  parsedSegments: ParsedSegment[],
  fileId: string,
  projectId: string,
  tenantId: string,
): Promise<void> {
  // H7: Wrap all batch inserts in a single transaction — partial failure rolls back all batches
  await db.transaction(async (tx) => {
    for (let i = 0; i < parsedSegments.length; i += SEGMENT_BATCH_SIZE) {
      const batch = parsedSegments.slice(i, i + SEGMENT_BATCH_SIZE)
      const values = batch.map((seg) => ({
        fileId,
        projectId,
        tenantId, // withTenant enforced via explicit value
        segmentNumber: seg.segmentNumber,
        sourceText: seg.sourceText,
        targetText: seg.targetText,
        sourceLang: seg.sourceLang,
        targetLang: seg.targetLang,
        wordCount: seg.wordCount,
        confirmationState: seg.confirmationState,
        matchPercentage: seg.matchPercentage,
        translatorComment: seg.translatorComment,
        inlineTags: seg.inlineTags,
      }))

      await tx.insert(segments).values(values)
    }
  })
}

async function markFileFailed(
  fileId: string,
  tenantId: string,
  userId: string,
  fileName: string,
  errorDetails: Record<string, unknown>,
): Promise<void> {
  // DB update failure must not cascade — the original error must be returned to the caller.
  try {
    await db
      .update(files)
      .set({ status: 'failed' })
      .where(and(eq(files.id, fileId), withTenant(files.tenantId, tenantId)))
  } catch (e) {
    // Intentionally swallowed: DB failure during error recovery must not cascade
    logger.error({ err: e, fileId }, 'markFileFailed: DB update failed')
  }

  // Audit log for failed parsing — non-fatal: audit failure must not mask the original error
  try {
    await writeAuditLog({
      tenantId,
      userId,
      entityType: 'file',
      entityId: fileId,
      action: 'file.parse_failed',
      newValue: {
        fileName,
        ...errorDetails,
      },
    })
  } catch (e) {
    // Intentionally swallowed: writeAuditLog failure on an error path must not cascade
    logger.error({ err: e, fileId }, 'markFileFailed: writeAuditLog failed')
  }
}
