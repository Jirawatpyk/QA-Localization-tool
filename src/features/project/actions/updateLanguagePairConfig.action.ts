'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { updateLanguagePairConfigSchema } from '@/features/project/validation/projectSchemas'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

type LanguagePairConfigResult = {
  id: string
  sourceLang: string
  targetLang: string
  autoPassThreshold: number
  l2ConfidenceMin: number
  l3ConfidenceMin: number
  wordSegmenter: string
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

  let resultRow: typeof languagePairConfigs.$inferSelect

  if (existing) {
    const [updated] = await db
      .update(languagePairConfigs)
      .set({ ...configFields, updatedAt: new Date() })
      .where(
        and(
          eq(languagePairConfigs.id, existing.id),
          withTenant(languagePairConfigs.tenantId, currentUser.tenantId),
        ),
      )
      .returning()

    if (!updated) {
      return { success: false, code: 'UPDATE_FAILED', error: 'Failed to update config' }
    }
    resultRow = updated
  } else {
    const [inserted] = await db
      .insert(languagePairConfigs)
      .values({
        tenantId: currentUser.tenantId,
        sourceLang,
        targetLang,
        autoPassThreshold: configFields.autoPassThreshold ?? 95,
        l2ConfidenceMin: configFields.l2ConfidenceMin ?? 70,
        l3ConfidenceMin: configFields.l3ConfidenceMin ?? 70,
        mutedCategories: configFields.mutedCategories,
        wordSegmenter: configFields.wordSegmenter ?? 'intl',
      })
      .returning()

    if (!inserted) {
      return { success: false, code: 'CREATE_FAILED', error: 'Failed to create config' }
    }
    resultRow = inserted
  }

  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'language_pair_config',
    entityId: resultRow.id,
    action: existing ? 'language_pair_config.updated' : 'language_pair_config.created',
    ...(existing
      ? {
          oldValue: {
            autoPassThreshold: existing.autoPassThreshold,
            l2ConfidenceMin: existing.l2ConfidenceMin,
            l3ConfidenceMin: existing.l3ConfidenceMin,
            wordSegmenter: existing.wordSegmenter,
          },
        }
      : {}),
    newValue: {
      sourceLang: resultRow.sourceLang,
      targetLang: resultRow.targetLang,
      autoPassThreshold: resultRow.autoPassThreshold,
      l2ConfidenceMin: resultRow.l2ConfidenceMin,
      l3ConfidenceMin: resultRow.l3ConfidenceMin,
      wordSegmenter: resultRow.wordSegmenter,
    },
  })

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
      wordSegmenter: resultRow.wordSegmenter,
    },
  }
}
