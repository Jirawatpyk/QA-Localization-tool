'use server'

import 'server-only'

import { and, eq, lt, or } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { suppressionRules } from '@/db/schema/suppressionRules'
import type { SuppressionRule } from '@/features/review/types'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

const STALE_SESSION_HOURS = 24

/**
 * Get active suppression rules for a project.
 * Called on file load to populate store's activeSuppressions.
 * Returns rules matching: file scope OR language_pair scope OR all scope.
 */
const uuidSchema = z.string().uuid()

export async function getActiveSuppressions(
  projectId: string,
  fileId: string | null,
): Promise<ActionResult<SuppressionRule[]>> {
  // CR-M11: validate params
  if (!uuidSchema.safeParse(projectId).success) {
    return { success: false, error: 'Invalid project ID', code: 'VALIDATION_ERROR' }
  }
  if (fileId !== null && !uuidSchema.safeParse(fileId).success) {
    return { success: false, error: 'Invalid file ID', code: 'VALIDATION_ERROR' }
  }

  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('qa_reviewer')
  } catch {
    return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }
  }

  const { tenantId } = user

  // AC6 defensive fallback: auto-deactivate session rules older than 24h (Task 10.3)
  const staleThreshold = new Date(Date.now() - STALE_SESSION_HOURS * 60 * 60 * 1000)
  try {
    await db
      .update(suppressionRules)
      .set({ isActive: false })
      .where(
        and(
          eq(suppressionRules.duration, 'session'),
          eq(suppressionRules.isActive, true),
          lt(suppressionRules.createdAt, staleThreshold),
          withTenant(suppressionRules.tenantId, tenantId),
        ),
      )
  } catch (cleanupErr) {
    // Non-critical — stale cleanup is defense-in-depth, don't block loading
    logger.error({ err: cleanupErr }, 'Failed to deactivate stale session suppression rules')
  }

  // Build scope filter: file-specific OR language_pair OR all
  const scopeConditions = fileId
    ? or(
        eq(suppressionRules.fileId, fileId),
        eq(suppressionRules.scope, 'language_pair'),
        eq(suppressionRules.scope, 'all'),
      )
    : or(eq(suppressionRules.scope, 'language_pair'), eq(suppressionRules.scope, 'all'))

  const rows = await db
    .select({
      id: suppressionRules.id,
      projectId: suppressionRules.projectId,
      tenantId: suppressionRules.tenantId,
      pattern: suppressionRules.pattern,
      category: suppressionRules.category,
      scope: suppressionRules.scope,
      duration: suppressionRules.duration,
      reason: suppressionRules.reason,
      fileId: suppressionRules.fileId,
      sourceLang: suppressionRules.sourceLang,
      targetLang: suppressionRules.targetLang,
      matchCount: suppressionRules.matchCount,
      createdBy: suppressionRules.createdBy,
      isActive: suppressionRules.isActive,
      createdAt: suppressionRules.createdAt,
    })
    .from(suppressionRules)
    .where(
      and(
        eq(suppressionRules.projectId, projectId),
        eq(suppressionRules.isActive, true),
        withTenant(suppressionRules.tenantId, tenantId),
        scopeConditions,
      ),
    )

  const rules: SuppressionRule[] = rows.map((r) => ({
    ...r,
    scope: r.scope as SuppressionRule['scope'],
    duration: r.duration as SuppressionRule['duration'],
    createdByName: null, // No JOIN needed for this endpoint
    createdAt: r.createdAt.toISOString(),
  }))

  return { success: true, data: rules }
}
