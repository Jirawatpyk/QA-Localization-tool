'use server'

import 'server-only'

import { and, eq, sql } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import { projects } from '@/db/schema/projects'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { addToGlossarySchema } from '@/features/review/validation/addToGlossary.schema'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

type AddToGlossaryResult =
  | { created: true; termId: string; glossaryId: string; sourceTerm: string; targetTerm: string }
  | { created: false; duplicate: true; existingTermId: string; existingTarget: string }

export async function addToGlossary(input: unknown): Promise<ActionResult<AddToGlossaryResult>> {
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'QA Reviewer access required' }
  }

  const parsed = addToGlossarySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const {
    findingId,
    projectId,
    sourceLang,
    targetLang,
    sourceTerm,
    targetTerm,
    notes,
    caseSensitive,
  } = parsed.data

  // NFKC normalize source term for dedup check (CJK/Thai rule)
  const normalizedSource = sourceTerm.trim().normalize('NFKC')
  const normalizedTarget = targetTerm.trim().normalize('NFKC')

  // Find existing glossary for this language pair
  const [existingGlossary] = await db
    .select({ id: glossaries.id })
    .from(glossaries)
    .where(
      and(
        eq(glossaries.projectId, projectId),
        eq(glossaries.sourceLang, sourceLang),
        eq(glossaries.targetLang, targetLang),
        withTenant(glossaries.tenantId, currentUser.tenantId),
      ),
    )
    .limit(1)

  let glossaryId: string

  if (existingGlossary) {
    glossaryId = existingGlossary.id
  } else {
    // Auto-create glossary for this language pair
    // Query project name for glossary naming
    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, projectId), withTenant(projects.tenantId, currentUser.tenantId)))
      .limit(1)

    if (!project) {
      return { success: false, code: 'NOT_FOUND', error: 'Project not found' }
    }

    const glossaryName = `${project.name} — ${sourceLang}→${targetLang}`

    try {
      const [newGlossary] = await db
        .insert(glossaries)
        .values({
          tenantId: currentUser.tenantId,
          projectId,
          name: glossaryName,
          sourceLang,
          targetLang,
        })
        .returning()

      if (!newGlossary) {
        return { success: false, code: 'CREATE_FAILED', error: 'Failed to create glossary' }
      }

      glossaryId = newGlossary.id
    } catch {
      // Race condition: another reviewer may have just created the same glossary
      // Re-query to find the one they created
      const [raceGlossary] = await db
        .select({ id: glossaries.id })
        .from(glossaries)
        .where(
          and(
            eq(glossaries.projectId, projectId),
            eq(glossaries.sourceLang, sourceLang),
            eq(glossaries.targetLang, targetLang),
            withTenant(glossaries.tenantId, currentUser.tenantId),
          ),
        )
        .limit(1)

      if (!raceGlossary) {
        return { success: false, code: 'CREATE_FAILED', error: 'Failed to create or find glossary' }
      }

      glossaryId = raceGlossary.id
    }
  }

  // Duplicate detection: case-insensitive exact match via SQL lower()
  // Defense-in-depth: withTenant on both glossaries AND glossaryTerms
  const [existingDup] = await db
    .select({ id: glossaryTerms.id, targetTerm: glossaryTerms.targetTerm })
    .from(glossaryTerms)
    .innerJoin(glossaries, eq(glossaryTerms.glossaryId, glossaries.id))
    .where(
      and(
        eq(glossaryTerms.glossaryId, glossaryId),
        sql`lower(${glossaryTerms.sourceTerm}) = lower(${normalizedSource})`,
        withTenant(glossaries.tenantId, currentUser.tenantId),
        withTenant(glossaryTerms.tenantId, currentUser.tenantId),
      ),
    )
    .limit(1)

  if (existingDup) {
    return {
      success: true,
      data: {
        created: false,
        duplicate: true,
        existingTermId: existingDup.id,
        existingTarget: existingDup.targetTerm,
      },
    }
  }

  // Insert new term (race-safe: handle unique constraint violation)
  let term: typeof glossaryTerms.$inferSelect | undefined
  try {
    const [inserted] = await db
      .insert(glossaryTerms)
      .values({
        glossaryId,
        tenantId: currentUser.tenantId,
        sourceTerm: normalizedSource,
        targetTerm: normalizedTarget,
        caseSensitive: caseSensitive ?? false,
        notes: notes ?? null, // TD-GLOSSARY-001: now persisted
      })
      .returning()

    term = inserted
  } catch (insertErr: unknown) {
    // Check for PostgreSQL unique constraint violation (23505)
    const pgCode =
      (insertErr as { code?: string }).code ??
      (insertErr as { cause?: { code?: string } }).cause?.code
    if (pgCode === '23505') {
      // Race condition: another reviewer inserted the same term concurrently
      const [raceTerm] = await db
        .select({ id: glossaryTerms.id, targetTerm: glossaryTerms.targetTerm })
        .from(glossaryTerms)
        .innerJoin(glossaries, eq(glossaryTerms.glossaryId, glossaries.id))
        .where(
          and(
            eq(glossaryTerms.glossaryId, glossaryId),
            sql`lower(${glossaryTerms.sourceTerm}) = lower(${normalizedSource})`,
            withTenant(glossaries.tenantId, currentUser.tenantId),
            withTenant(glossaryTerms.tenantId, currentUser.tenantId),
          ),
        )
        .limit(1)

      if (raceTerm) {
        return {
          success: true,
          data: {
            created: false,
            duplicate: true,
            existingTermId: raceTerm.id,
            existingTarget: raceTerm.targetTerm,
          },
        }
      }
    }
    return { success: false, code: 'CREATE_FAILED', error: 'Failed to add glossary term' }
  }

  if (!term) {
    return { success: false, code: 'CREATE_FAILED', error: 'Failed to create term' }
  }

  // Audit log
  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'glossary_term',
    entityId: term.id,
    action: 'glossary_term.created_from_review',
    newValue: {
      sourceTerm: term.sourceTerm,
      targetTerm: term.targetTerm,
      findingId,
      notes: notes ?? null,
    },
  })

  // Cache invalidation
  revalidateTag(`glossary-${projectId}`, 'minutes')

  return {
    success: true,
    data: {
      created: true,
      termId: term.id,
      glossaryId,
      sourceTerm: term.sourceTerm,
      targetTerm: term.targetTerm,
    },
  }
}
