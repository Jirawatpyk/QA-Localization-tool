'use server'

import 'server-only'

import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { segments } from '@/db/schema/segments'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'

type GetFilesWordCountInput = {
  fileIds: string[]
  projectId: string
}

type GetFilesWordCountResult =
  | { success: true; data: { totalWords: number } }
  | { success: false; code: string; error: string }

/**
 * Get total word count for a set of files.
 *
 * Queries SUM(segments.word_count) for given file IDs.
 * Used by ProcessingModeDialog to display word-count-based cost estimates.
 */
export async function getFilesWordCount(
  input: GetFilesWordCountInput,
): Promise<GetFilesWordCountResult> {
  // Auth
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'read')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  const { fileIds, projectId } = input

  // Guard: inArray(col, []) = invalid SQL (Guardrail #5)
  if (fileIds.length === 0) {
    return { success: true, data: { totalWords: 0 } }
  }

  try {
    const [result] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${segments.wordCount}), 0)`,
      })
      .from(segments)
      .where(
        and(
          withTenant(segments.tenantId, currentUser.tenantId),
          eq(segments.projectId, projectId),
          inArray(segments.fileId, fileIds),
        ),
      )

    return {
      success: true,
      data: { totalWords: Number(result?.total ?? 0) },
    }
  } catch (err) {
    logger.error({ err, fileIds }, 'Failed to get files word count')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to get word count' }
  }
}
