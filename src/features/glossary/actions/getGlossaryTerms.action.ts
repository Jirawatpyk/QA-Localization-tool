'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { isUuid } from '@/lib/validation/uuid'
import type { ActionResult } from '@/types/actionResult'

type GlossaryTerm = {
  id: string
  glossaryId: string
  sourceTerm: string
  targetTerm: string
  caseSensitive: boolean
  createdAt: Date
}

export async function getGlossaryTerms(glossaryId: string): Promise<ActionResult<GlossaryTerm[]>> {
  if (!glossaryId || !isUuid(glossaryId)) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Invalid glossary ID' }
  }

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

  // Verify glossary belongs to current tenant
  const [glossary] = await db
    .select()
    .from(glossaries)
    .where(
      and(eq(glossaries.id, glossaryId), withTenant(glossaries.tenantId, currentUser.tenantId)),
    )

  if (!glossary) {
    return { success: false, code: 'NOT_FOUND', error: 'Glossary not found' }
  }

  const terms = await db
    .select()
    .from(glossaryTerms)
    .where(eq(glossaryTerms.glossaryId, glossaryId))

  return {
    success: true,
    data: terms.map((t) => ({
      id: t.id,
      glossaryId: t.glossaryId,
      sourceTerm: t.sourceTerm,
      targetTerm: t.targetTerm,
      caseSensitive: t.caseSensitive,
      createdAt: t.createdAt,
    })),
  }
}
