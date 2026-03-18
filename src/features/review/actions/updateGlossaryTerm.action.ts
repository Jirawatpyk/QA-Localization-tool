'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { updateGlossaryTermSchema } from '@/features/review/validation/addToGlossary.schema'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

type UpdateTermResult = {
  termId: string
  targetTerm: string
}

export async function updateGlossaryTerm(input: unknown): Promise<ActionResult<UpdateTermResult>> {
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'QA Reviewer access required' }
  }

  const parsed = updateGlossaryTermSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { termId, targetTerm, projectId } = parsed.data
  const normalizedTarget = targetTerm.trim().normalize('NFKC')

  // Verify term's glossary belongs to tenant via JOIN
  const [existingTerm] = await db
    .select({
      id: glossaryTerms.id,
      targetTerm: glossaryTerms.targetTerm,
      glossaryId: glossaryTerms.glossaryId,
    })
    .from(glossaryTerms)
    .innerJoin(glossaries, eq(glossaryTerms.glossaryId, glossaries.id))
    .where(and(eq(glossaryTerms.id, termId), withTenant(glossaries.tenantId, currentUser.tenantId)))
    .limit(1)

  if (!existingTerm) {
    return { success: false, code: 'NOT_FOUND', error: 'Term not found' }
  }

  const oldTarget = existingTerm.targetTerm

  // Update target term — compound WHERE pins to tenant-verified glossaryId (defense-in-depth)
  const [updated] = await db
    .update(glossaryTerms)
    .set({ targetTerm: normalizedTarget })
    .where(and(eq(glossaryTerms.id, termId), eq(glossaryTerms.glossaryId, existingTerm.glossaryId)))
    .returning()

  if (!updated) {
    return { success: false, code: 'UPDATE_FAILED', error: 'Failed to update term' }
  }

  // Audit log
  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'glossary_term',
    entityId: termId,
    action: 'glossary_term.updated_from_review',
    oldValue: { targetTerm: oldTarget },
    newValue: { targetTerm: normalizedTarget },
  })

  // Cache invalidation
  revalidateTag(`glossary-${projectId}`, 'minutes')

  return {
    success: true,
    data: {
      termId,
      targetTerm: normalizedTarget,
    },
  }
}
