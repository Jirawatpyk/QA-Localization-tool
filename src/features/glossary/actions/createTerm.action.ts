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
import { createBulkNotification, NOTIFICATION_TYPES } from '@/lib/notifications/createNotification'
import { getAdminRecipients } from '@/lib/notifications/recipients'
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
        withTenant(glossaryTerms.tenantId, currentUser.tenantId),
      ),
    )
    .limit(1)

  if (existingDup) {
    return { success: false, code: 'DUPLICATE_ENTRY', error: 'Term already exists' }
  }

  let term
  try {
    const [inserted] = await db
      .insert(glossaryTerms)
      .values({
        glossaryId: parsed.data.glossaryId,
        tenantId: currentUser.tenantId,
        sourceTerm: normalizedSource,
        targetTerm: parsed.data.targetTerm.trim().normalize('NFKC'),
        caseSensitive: parsed.data.caseSensitive,
      })
      .returning()

    term = inserted
  } catch (err) {
    // Defense-in-depth: handle race condition where dedup SELECT passed but concurrent INSERT won
    if ((err as { code?: string }).code === '23505') {
      return { success: false, code: 'DUPLICATE_ENTRY', error: 'Term already exists' }
    }
    throw err
  }

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

  // Notification: glossary_updated (low-impact → admins only, fire-and-forget)
  getAdminRecipients(currentUser.tenantId, currentUser.id)
    .then((recipients) =>
      createBulkNotification({
        tenantId: currentUser.tenantId,
        recipients,
        type: NOTIFICATION_TYPES.GLOSSARY_UPDATED,
        title: 'Glossary term created',
        body: `Term "${term.sourceTerm}" → "${term.targetTerm}" added`,
        ...(glossary.projectId ? { projectId: glossary.projectId } : {}),
        metadata: {
          glossaryId: glossary.id,
          action: 'term_created',
          sourceTerm: term.sourceTerm,
          targetTerm: term.targetTerm,
        },
      }),
    )
    .catch(() => {})

  if (glossary.projectId) {
    revalidateTag(`glossary-${glossary.projectId}`, 'minutes')
  }

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
