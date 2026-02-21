'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { requireRole } from '@/lib/auth/requireRole'
import { isUuid } from '@/lib/validation/uuid'
import type { ActionResult } from '@/types/actionResult'

export async function deleteTerm(termId: string): Promise<ActionResult<{ id: string }>> {
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

  // termId tenant-verified via glossaries JOIN + withTenant() above (line 42)
  await db.delete(glossaryTerms).where(eq(glossaryTerms.id, termId))

  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'glossary_term',
    entityId: termId,
    action: 'glossary_term.deleted',
    oldValue: {
      sourceTerm: existing.sourceTerm,
      targetTerm: existing.targetTerm,
      caseSensitive: existing.caseSensitive,
    },
  })

  revalidateTag(`glossary-${existing.projectId}`, 'minutes')

  return { success: true, data: { id: termId } }
}
