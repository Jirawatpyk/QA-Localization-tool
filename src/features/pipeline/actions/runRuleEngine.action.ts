'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { NonRetriableError } from 'inngest'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { runL1ForFile } from '@/features/pipeline/helpers/runL1ForFile'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

type RunRuleEngineResult = {
  findingCount: number
  fileId: string
  duration: number
}

/**
 * Server Action: Run L1 rule engine on a parsed file.
 * Thin wrapper — delegates core logic to runL1ForFile() shared helper.
 *
 * Auth, validation, and ActionResult wrapping here.
 * CAS guard, file processing, and status transitions in runL1ForFile().
 */
export async function runRuleEngine(input: {
  fileId: string
}): Promise<ActionResult<RunRuleEngineResult>> {
  if (!z.string().uuid().safeParse(input.fileId).success) {
    return { success: false, code: 'INVALID_INPUT', error: 'Invalid file ID format' }
  }

  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  // Resolve projectId from file (required by runL1ForFile helper signature)
  const [fileRecord] = await db
    .select({ projectId: files.projectId })
    .from(files)
    .where(and(withTenant(files.tenantId, currentUser.tenantId), eq(files.id, input.fileId)))

  if (!fileRecord) {
    return { success: false, code: 'NOT_FOUND', error: 'File not found' }
  }

  try {
    const result = await runL1ForFile({
      fileId: input.fileId,
      projectId: fileRecord.projectId,
      tenantId: currentUser.tenantId,
    })

    return {
      success: true,
      data: {
        findingCount: result.findingCount,
        fileId: input.fileId,
        duration: result.duration,
      },
    }
  } catch (err) {
    if (err instanceof NonRetriableError) {
      return {
        success: false,
        code: 'CONFLICT',
        error: 'File not found, not in parsed state, or already being processed',
      }
    }
    logger.error({ err, fileId: input.fileId }, 'Rule engine failed')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Rule engine processing failed' }
  }
}
