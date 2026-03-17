'use server'

import 'server-only'

import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { suppressionRules } from '@/db/schema/suppressionRules'
import { users } from '@/db/schema/users'
import { SUPPRESSION_DURATIONS, SUPPRESSION_SCOPES } from '@/features/review/types'
import type { SuppressionRule } from '@/features/review/types'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

const optionalUuidSchema = z.string().uuid().nullable()

export async function getSuppressionRules(
  projectId: string | null,
): Promise<ActionResult<SuppressionRule[]>> {
  // CR-M11: validate projectId if provided
  if (projectId !== null && !optionalUuidSchema.safeParse(projectId).success) {
    return { success: false, error: 'Invalid project ID', code: 'VALIDATION_ERROR' }
  }

  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('qa_reviewer')
  } catch {
    return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }
  }

  const { tenantId } = user

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
      createdByName: users.displayName,
      isActive: suppressionRules.isActive,
      createdAt: suppressionRules.createdAt,
    })
    .from(suppressionRules)
    .leftJoin(users, eq(suppressionRules.createdBy, users.id))
    .where(
      and(
        // Guardrail #8: optional filter uses null, not ''
        projectId ? eq(suppressionRules.projectId, projectId) : undefined,
        withTenant(suppressionRules.tenantId, tenantId),
      ),
    )
    .orderBy(desc(suppressionRules.createdAt))

  // R2-M4: runtime validation for scope/duration (Guardrail #3)
  const rules: SuppressionRule[] = rows.map((r) => ({
    ...r,
    scope: (SUPPRESSION_SCOPES.has(r.scope) ? r.scope : 'all') as SuppressionRule['scope'],
    duration: (SUPPRESSION_DURATIONS.has(r.duration)
      ? r.duration
      : 'until_improved') as SuppressionRule['duration'],
    createdAt: r.createdAt.toISOString(),
  }))

  return { success: true, data: rules }
}
