'use server'

import 'server-only'

import { and, eq, isNotNull } from 'drizzle-orm'

import { db } from '@/db/client'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

import type { TaxonomyMapping } from '../types'

export async function getTaxonomyMappings(): Promise<ActionResult<TaxonomyMapping[]>> {
  try {
    await requireRole('admin', 'read')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  const rows = await db
    .select()
    .from(taxonomyDefinitions)
    .where(and(eq(taxonomyDefinitions.isActive, true), isNotNull(taxonomyDefinitions.internalName)))
    .orderBy(taxonomyDefinitions.displayOrder)

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      category: r.category,
      parentCategory: r.parentCategory ?? null,
      internalName: r.internalName ?? null,
      severity: r.severity ?? null,
      description: r.description,
      isCustom: r.isCustom,
      isActive: r.isActive,
      displayOrder: r.displayOrder,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  }
}
