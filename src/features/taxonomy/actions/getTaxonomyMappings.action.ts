'use server'

import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

import type { Severity, TaxonomyMapping } from '../types'

export async function getTaxonomyMappings(): Promise<ActionResult<TaxonomyMapping[]>> {
  try {
    await requireRole('admin', 'read')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  // Admin action: show ALL active mappings (including entries without internalName)
  // so admins can see and edit every entry. Compare: getCachedTaxonomyMappings filters
  // isNotNull(internalName) for QA-engine use only.
  const rows = await db
    .select()
    .from(taxonomyDefinitions)
    .where(eq(taxonomyDefinitions.isActive, true))
    .orderBy(taxonomyDefinitions.displayOrder)

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      category: r.category,
      parentCategory: r.parentCategory ?? null,
      internalName: r.internalName ?? null,
      severity: (r.severity ?? null) as Severity | null,
      description: r.description,
      isCustom: r.isCustom,
      isActive: r.isActive,
      displayOrder: r.displayOrder,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  }
}
