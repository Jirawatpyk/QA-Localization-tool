'use server'

import 'server-only'

import { and, eq, sql } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { updateTermSchema } from '@/features/glossary/validation/glossarySchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { isUuid } from '@/lib/validation/uuid'
import type { ActionResult } from '@/types/actionResult'

type TermResult = {
  id: string
  glossaryId: string
  sourceTerm: string
  targetTerm: string
  caseSensitive: boolean
}

export async function updateTerm(
  termId: string,
  input: unknown,
): Promise<ActionResult<TermResult>> {
  // Validate termId is a valid UUID
  if (!termId || !isUuid(termId)) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Invalid term ID' }
  }

  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  const parsed = updateTermSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  // Fetch existing term with tenant verification via glossary JOIN
  const [existing] = await db
    .select({
      id: glossaryTerms.id,
      glossaryId: glossaryTerms.glossaryId,
      sourceTerm: glossaryTerms.sourceTerm,
      targetTerm: glossaryTerms.targetTerm,
      caseSensitive: glossaryTerms.caseSensitive,
      projectId: glossaries.projectId,
    })
    .from(glossaryTerms)
    .innerJoin(glossaries, eq(glossaryTerms.glossaryId, glossaries.id))
    .where(and(eq(glossaryTerms.id, termId), withTenant(glossaries.tenantId, currentUser.tenantId)))

  if (!existing) {
    return { success: false, code: 'NOT_FOUND', error: 'Term not found' }
  }

  // Prepare update values with NFKC normalization
  const updateValues: Record<string, unknown> = {}
  if (parsed.data.sourceTerm !== undefined) {
    updateValues['sourceTerm'] = parsed.data.sourceTerm.trim().normalize('NFKC')
  }
  if (parsed.data.targetTerm !== undefined) {
    updateValues['targetTerm'] = parsed.data.targetTerm.trim().normalize('NFKC')
  }
  if (parsed.data.caseSensitive !== undefined) {
    updateValues['caseSensitive'] = parsed.data.caseSensitive
  }

  // Check for duplicate source term when sourceTerm is being changed (case-insensitive, exclude self)
  if (updateValues['sourceTerm']) {
    const [existingDup] = await db
      .select({ id: glossaryTerms.id })
      .from(glossaryTerms)
      .where(
        and(
          eq(glossaryTerms.glossaryId, existing.glossaryId),
          sql`lower(${glossaryTerms.sourceTerm}) = lower(${updateValues['sourceTerm'] as string})`,
          sql`${glossaryTerms.id} != ${termId}`,
        ),
      )
      .limit(1)

    if (existingDup) {
      return { success: false, code: 'DUPLICATE_ENTRY', error: 'Term already exists' }
    }
  }

  const [updated] = await db
    .update(glossaryTerms)
    .set(updateValues)
    .where(eq(glossaryTerms.id, termId))
    .returning()

  if (!updated) {
    return { success: false, code: 'UPDATE_FAILED', error: 'Failed to update term' }
  }

  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'glossary_term',
    entityId: termId,
    action: 'glossary_term.updated',
    oldValue: {
      sourceTerm: existing.sourceTerm,
      targetTerm: existing.targetTerm,
      caseSensitive: existing.caseSensitive,
    },
    newValue: updateValues,
  })

  revalidateTag(`glossary-${existing.projectId}`, 'minutes')

  return {
    success: true,
    data: {
      id: updated.id,
      glossaryId: updated.glossaryId,
      sourceTerm: updated.sourceTerm,
      targetTerm: updated.targetTerm,
      caseSensitive: updated.caseSensitive,
    },
  }
}
