'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { glossaries } from '@/db/schema/glossaries'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { requireRole } from '@/lib/auth/requireRole'
import { isUuid } from '@/lib/validation/uuid'
import type { ActionResult } from '@/types/actionResult'

export async function deleteGlossary(glossaryId: string): Promise<ActionResult<{ id: string }>> {
  if (!glossaryId || !isUuid(glossaryId)) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Invalid glossary ID' }
  }

  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  // Fetch glossary with tenant verification
  const [existing] = await db
    .select()
    .from(glossaries)
    .where(
      and(eq(glossaries.id, glossaryId), withTenant(glossaries.tenantId, currentUser.tenantId)),
    )

  if (!existing) {
    return { success: false, code: 'NOT_FOUND', error: 'Glossary not found' }
  }

  // Cascade deletes all glossary_terms automatically (FK onDelete: cascade)
  await db.delete(glossaries).where(eq(glossaries.id, glossaryId))

  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'glossary',
    entityId: glossaryId,
    action: 'glossary.deleted',
    oldValue: {
      name: existing.name,
      sourceLang: existing.sourceLang,
      targetLang: existing.targetLang,
    },
  })

  revalidateTag(`glossary-${existing.projectId}`, 'minutes')

  return { success: true, data: { id: glossaryId } }
}
