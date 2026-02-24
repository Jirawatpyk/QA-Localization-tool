import { and, eq, inArray } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import type { GlossaryTermRecord } from '@/features/pipeline/engine/types'

/**
 * Load all glossary terms for a project's glossaries.
 * Used by the matching engine (Story 1.5) and term display.
 * Cached per project with "use cache" + cacheTag.
 */
export async function getCachedGlossaryTerms(projectId: string, tenantId: string) {
  'use cache'
  cacheTag(`glossary-${projectId}`)
  cacheLife('minutes')

  const projectGlossaries = await db
    .select({ id: glossaries.id })
    .from(glossaries)
    .where(and(eq(glossaries.projectId, projectId), withTenant(glossaries.tenantId, tenantId)))

  if (projectGlossaries.length === 0) return []

  const glossaryIds = projectGlossaries.map((g) => g.id)

  const terms = await db
    .select()
    .from(glossaryTerms)
    .where(inArray(glossaryTerms.glossaryId, glossaryIds))

  return terms
}

/**
 * Load glossary terms for a project using a single JOIN query.
 * Non-cached version — safe for Inngest runtime (no "use cache" RSC directive).
 * Used by runL1ForFile() and other server-side helpers outside RSC.
 */
export async function getGlossaryTerms(
  projectId: string,
  tenantId: string,
): Promise<GlossaryTermRecord[]> {
  return await db
    .select({
      id: glossaryTerms.id,
      glossaryId: glossaryTerms.glossaryId,
      sourceTerm: glossaryTerms.sourceTerm,
      targetTerm: glossaryTerms.targetTerm,
      caseSensitive: glossaryTerms.caseSensitive,
      createdAt: glossaryTerms.createdAt,
    })
    .from(glossaryTerms)
    .innerJoin(glossaries, eq(glossaryTerms.glossaryId, glossaries.id))
    .where(and(eq(glossaries.projectId, projectId), withTenant(glossaries.tenantId, tenantId)))
}

/**
 * Load glossary metadata for a project.
 * Cached per project with "use cache" + cacheTag.
 */
export async function getCachedGlossaries(projectId: string, tenantId: string) {
  'use cache'
  cacheTag(`glossary-${projectId}`)
  cacheLife('minutes')

  return await db
    .select()
    .from(glossaries)
    .where(and(eq(glossaries.projectId, projectId), withTenant(glossaries.tenantId, tenantId)))
}
