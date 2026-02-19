'use server'

import 'server-only'

import { and, eq, sql } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { createTermSchema } from '@/features/glossary/validation/glossarySchemas'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

type TermResult = {
  id: string
  glossaryId: string
  sourceTerm: string
  targetTerm: string
  caseSensitive: boolean
}

export async function createTerm(input: unknown): Promise<ActionResult<TermResult>> {
  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  const parsed = createTermSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  // Verify glossary belongs to current tenant
  const [glossary] = await db
    .select()
    .from(glossaries)
    .where(
      and(
        eq(glossaries.id, parsed.data.glossaryId),
        withTenant(glossaries.tenantId, currentUser.tenantId),
      ),
    )

  if (!glossary) {
    return { success: false, code: 'NOT_FOUND', error: 'Glossary not found' }
  }

  // NFKC normalize source term for dedup check
  const normalizedSource = parsed.data.sourceTerm.trim().normalize('NFKC')

  // Check for duplicate source term (case-insensitive, SQL-level)
  const [existingDup] = await db
    .select({ id: glossaryTerms.id })
    .from(glossaryTerms)
    .where(
      and(
        eq(glossaryTerms.glossaryId, parsed.data.glossaryId),
        sql`lower(${glossaryTerms.sourceTerm}) = lower(${normalizedSource})`,
      ),
    )
    .limit(1)

  if (existingDup) {
    return { success: false, code: 'DUPLICATE_ENTRY', error: 'Term already exists' }
  }

  const [term] = await db
    .insert(glossaryTerms)
    .values({
      glossaryId: parsed.data.glossaryId,
      sourceTerm: normalizedSource,
      targetTerm: parsed.data.targetTerm.trim().normalize('NFKC'),
      caseSensitive: parsed.data.caseSensitive,
    })
    .returning()

  if (!term) {
    return { success: false, code: 'CREATE_FAILED', error: 'Failed to create term' }
  }

  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'glossary_term',
    entityId: term.id,
    action: 'glossary_term.created',
    newValue: {
      sourceTerm: term.sourceTerm,
      targetTerm: term.targetTerm,
      caseSensitive: term.caseSensitive,
    },
  })

  revalidateTag(`glossary-${glossary.projectId}`, 'minutes')

  return {
    success: true,
    data: {
      id: term.id,
      glossaryId: term.glossaryId,
      sourceTerm: term.sourceTerm,
      targetTerm: term.targetTerm,
      caseSensitive: term.caseSensitive,
    },
  }
}
