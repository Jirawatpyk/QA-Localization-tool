import { and, eq, isNotNull } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'

import { db } from '@/db/client'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'

/**
 * Cached taxonomy lookup for RSC page-level data loading.
 * Taxonomy is shared reference data (no tenant_id, no RLS per ERD 1.9).
 * Cache tag: 'taxonomy' (flat key — shared across all tenants).
 * Invalidation: every mutation action calls revalidateTag('taxonomy').
 * TTL: 'minutes' preset (~10 min per architecture spec).
 */
export async function getCachedTaxonomyMappings() {
  'use cache'
  cacheTag('taxonomy')
  cacheLife('minutes')

  return await db
    .select()
    .from(taxonomyDefinitions)
    .where(and(eq(taxonomyDefinitions.isActive, true), isNotNull(taxonomyDefinitions.internalName)))
    .orderBy(taxonomyDefinitions.displayOrder)
}
