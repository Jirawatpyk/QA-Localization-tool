import { and, eq, inArray } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'

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
