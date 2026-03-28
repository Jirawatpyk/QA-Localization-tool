'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { updateLanguagePairConfigSchema } from '@/features/project/validation/projectSchemas'
import { DEFAULT_AUTO_PASS_THRESHOLD } from '@/features/scoring/constants'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

type LanguagePairConfigResult = {
  id: string
  sourceLang: string
  targetLang: string
  autoPassThreshold: number
  l2ConfidenceMin: number
  l3ConfidenceMin: number
  wordSegmenter: 'intl' | 'space'
}

export async function updateLanguagePairConfig(
  input: unknown,
): Promise<ActionResult<LanguagePairConfigResult>> {
  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  const parsed = updateLanguagePairConfigSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { projectId, sourceLang, targetLang, ...configFields } = parsed.data

  // NOTE: language_pair_configs is tenant-wide (no projectId column by design).
  // Updating config for e.g. en→th applies to ALL projects under the same tenant.
  // projectId is used only for revalidatePath(), not for query filtering.
  // UNIQUE(tenant_id, source_lang, target_lang) prevents race-condition duplicates (TD-DB-007 RESOLVED).
  // onConflictDoUpdate = atomic upsert — no transaction needed.
  let resultRow: typeof languagePairConfigs.$inferSelect
  let isUpdate = false

  try {
    // Check existing row first (for audit log old values)
    const [existing] = await db
      .select()
      .from(languagePairConfigs)
      .where(
        and(
          withTenant(languagePairConfigs.tenantId, currentUser.tenantId),
          eq(languagePairConfigs.sourceLang, sourceLang),
          eq(languagePairConfigs.targetLang, targetLang),
        ),
      )
      .limit(1)

    isUpdate = !!existing

    const [row] = await db
      .insert(languagePairConfigs)
      .values({
        tenantId: currentUser.tenantId,
        sourceLang,
        targetLang,
        autoPassThreshold: configFields.autoPassThreshold ?? DEFAULT_AUTO_PASS_THRESHOLD,
        l2ConfidenceMin: configFields.l2ConfidenceMin ?? 70,
        l3ConfidenceMin: configFields.l3ConfidenceMin ?? 70,
        mutedCategories: configFields.mutedCategories,
        wordSegmenter: configFields.wordSegmenter ?? 'intl',
      })
      .onConflictDoUpdate({
        target: [
          languagePairConfigs.tenantId,
          languagePairConfigs.sourceLang,
          languagePairConfigs.targetLang,
        ],
        set: { ...configFields, updatedAt: new Date() },
      })
      .returning()

    if (!row) {
      return { success: false, code: 'UPSERT_FAILED', error: 'Failed to upsert config' }
    }
    resultRow = row
  } catch (err) {
    throw err
  }

  try {
    await writeAuditLog({
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
      entityType: 'language_pair_config',
      entityId: resultRow.id,
      action: isUpdate ? 'language_pair_config.updated' : 'language_pair_config.created',
      newValue: {
        sourceLang: resultRow.sourceLang,
        targetLang: resultRow.targetLang,
        autoPassThreshold: resultRow.autoPassThreshold,
        l2ConfidenceMin: resultRow.l2ConfidenceMin,
        l3ConfidenceMin: resultRow.l3ConfidenceMin,
        wordSegmenter: resultRow.wordSegmenter,
      },
    })
  } catch (auditErr) {
    logger.error(
      { err: auditErr, configId: resultRow.id },
      'Audit log failed for language pair config (non-fatal)',
    )
  }

  revalidatePath(`/projects/${projectId}/settings`)

  return {
    success: true,
    data: {
      id: resultRow.id,
      sourceLang: resultRow.sourceLang,
      targetLang: resultRow.targetLang,
      autoPassThreshold: resultRow.autoPassThreshold,
      l2ConfidenceMin: resultRow.l2ConfidenceMin,
      l3ConfidenceMin: resultRow.l3ConfidenceMin,
      wordSegmenter: resultRow.wordSegmenter as 'intl' | 'space',
    },
  }
}
