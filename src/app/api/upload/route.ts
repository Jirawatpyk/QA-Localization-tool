import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { uploadBatches } from '@/db/schema/uploadBatches'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import {
  ALLOWED_EXTENSIONS,
  LARGE_FILE_WARNING_BYTES,
  UPLOAD_STORAGE_BUCKET,
} from '@/features/upload/constants'
import { computeFileHash } from '@/features/upload/utils/fileHash.server'
import { getFileType } from '@/features/upload/utils/fileType'
import { buildStoragePath } from '@/features/upload/utils/storagePath'
import { requireRole } from '@/lib/auth/requireRole'
import { DEFAULT_BATCH_SIZE, MAX_FILE_SIZE_BYTES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { createAdminClient } from '@/lib/supabase/admin'

const STORAGE_ALREADY_EXISTS_ERROR = 'The resource already exists'
const uuidSchema = z.string().uuid()

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth check
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Check Content-Length BEFORE reading body (fast reject for unreasonably large requests)
  // Allow up to DEFAULT_BATCH_SIZE files × (15MB + 64KB multipart overhead) each
  const contentLength = request.headers.get('content-length')
  if (
    contentLength &&
    parseInt(contentLength, 10) > DEFAULT_BATCH_SIZE * (MAX_FILE_SIZE_BYTES + 65536)
  ) {
    return NextResponse.json(
      { error: 'Request exceeds maximum allowed size for a batch upload' },
      { status: 413 },
    )
  }

  // 3. Parse multipart form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const batchId = formData.get('batchId') as string | null
  const projectId = formData.get('projectId') as string | null

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  // H4: validate projectId and batchId as UUIDs before DB queries
  if (!uuidSchema.safeParse(projectId).success) {
    return NextResponse.json({ error: 'Invalid project ID format' }, { status: 400 })
  }
  if (batchId && !uuidSchema.safeParse(batchId).success) {
    return NextResponse.json({ error: 'Invalid batch ID format' }, { status: 400 })
  }

  // 4. Collect files from FormData
  const fileEntries = formData.getAll('files') as File[]

  // 5. Validate batch size
  if (fileEntries.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }
  if (fileEntries.length > DEFAULT_BATCH_SIZE) {
    return NextResponse.json(
      {
        error: `Maximum ${DEFAULT_BATCH_SIZE} files per batch. Upload remaining files in a separate batch.`,
      },
      { status: 400 },
    )
  }

  // 5a. Verify projectId belongs to the authenticated tenant (cross-tenant FK injection guard)
  const [ownedProject] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(withTenant(projects.tenantId, currentUser.tenantId), eq(projects.id, projectId)))
    .limit(1)

  if (!ownedProject) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // 5b. Verify batchId (if provided) belongs to the authenticated tenant
  if (batchId) {
    const [ownedBatch] = await db
      .select({ id: uploadBatches.id })
      .from(uploadBatches)
      .where(
        and(
          withTenant(uploadBatches.tenantId, currentUser.tenantId),
          eq(uploadBatches.id, batchId),
        ),
      )
      .limit(1)

    if (!ownedBatch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    }
  }

  const admin = createAdminClient()
  const results: Array<{
    fileId: string
    fileName: string
    fileSizeBytes: number
    fileType: string
    fileHash: string
    storagePath: string
    status: string
    batchId: string | null
  }> = []
  const warnings: string[] = []

  for (const file of fileEntries) {
    // 5a. Validate file type
    const fileType = getFileType(file.name)
    if (!fileType) {
      return NextResponse.json(
        { error: `Unsupported format: ${file.name}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 },
      )
    }

    // 5b. Streaming size validation
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File exceeds maximum size of 15MB. Please split the file in your CAT tool`,
          fileName: file.name,
        },
        { status: 413 },
      )
    }

    if (file.size >= LARGE_FILE_WARNING_BYTES) {
      warnings.push(`${file.name}: Large file — processing may be slower`)
    }

    // 5c. Read file bytes + compute SHA-256
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const fileHash = computeFileHash(buffer)

    // 5d. Build storage path + upload to Supabase Storage
    const storagePath = buildStoragePath(currentUser.tenantId, projectId, fileHash, file.name)

    const { error: storageError } = await admin.storage
      .from(UPLOAD_STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (storageError && storageError.message !== STORAGE_ALREADY_EXISTS_ERROR) {
      logger.error(
        {
          fileHash,
          fileName: file.name,
          fileSizeBytes: file.size,
          fileType,
          tenantId: currentUser.tenantId,
          projectId,
          error: storageError.message,
        },
        'Storage upload failed',
      )
      return NextResponse.json(
        { error: 'Storage upload failed', fileName: file.name },
        { status: 500 },
      )
    }

    // 5e. Insert files record via Drizzle with withTenant
    const [fileRecord] = await db
      .insert(files)
      .values({
        tenantId: currentUser.tenantId,
        projectId,
        fileName: file.name,
        fileType,
        fileSizeBytes: file.size,
        fileHash,
        storagePath,
        status: 'uploaded',
        uploadedBy: currentUser.id,
        batchId: batchId ?? undefined,
      })
      .returning()

    if (!fileRecord) {
      // H1: cleanup storage to prevent orphan when DB insert fails
      await admin.storage.from(UPLOAD_STORAGE_BUCKET).remove([storagePath])
      return NextResponse.json(
        { error: 'Failed to record file in database', fileName: file.name },
        { status: 500 },
      )
    }

    // 5f. Write audit log — metadata only, NEVER file content (NFR10)
    // H2: non-fatal — do not abort batch if audit write fails
    try {
      await writeAuditLog({
        tenantId: currentUser.tenantId,
        userId: currentUser.id,
        entityType: 'file',
        entityId: fileRecord.id,
        action: 'file.uploaded',
        newValue: {
          fileId: fileRecord.id,
          fileName: file.name,
          fileSizeBytes: file.size,
          fileType,
          fileHash,
          projectId,
          batchId: batchId ?? null,
        },
      })
    } catch (auditError) {
      logger.error({ auditError, fileId: fileRecord.id }, 'Audit log write failed — non-fatal')
    }

    logger.info(
      {
        fileId: fileRecord.id,
        fileName: file.name,
        fileSizeBytes: file.size,
        fileType,
        fileHash,
        tenantId: currentUser.tenantId,
        projectId,
      },
      'File uploaded successfully',
    )

    results.push({
      fileId: fileRecord.id,
      fileName: file.name,
      fileSizeBytes: file.size,
      fileType,
      fileHash,
      storagePath,
      status: fileRecord.status,
      batchId: fileRecord.batchId,
    })
  }

  return NextResponse.json({
    success: true,
    data: { files: results, batchId: batchId ?? null, warnings },
  })
}
