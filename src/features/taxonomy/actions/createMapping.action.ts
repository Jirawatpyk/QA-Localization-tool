'use server'

import 'server-only'

import { sql } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import type { Severity, TaxonomyMapping } from '@/features/taxonomy/types'
import { createMappingSchema } from '@/features/taxonomy/validation/taxonomySchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

export async function createMapping(input: unknown): Promise<ActionResult<TaxonomyMapping>> {
  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  const parsed = createMappingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  // Assign displayOrder = max + 1 so new mappings appear at the end
  const [maxRow] = await db
    .select({ max: sql<number>`COALESCE(MAX(${taxonomyDefinitions.displayOrder}), -1)` })
    .from(taxonomyDefinitions)

  const [created] = await db
    .insert(taxonomyDefinitions)
    .values({
      category: parsed.data.category,
      parentCategory: parsed.data.parentCategory ?? null,
      internalName: parsed.data.internalName,
      severity: parsed.data.severity,
      description: parsed.data.description,
      isCustom: true, // admin-created entries are custom (seed data uses isCustom: false)
      displayOrder: (maxRow?.max ?? -1) + 1,
    })
    .returning()

  if (!created) {
    return { success: false, code: 'INSERT_FAILED', error: 'Failed to create mapping' }
  }

  // Guardrail #2: audit + cache non-fatal on happy path
  try {
    await writeAuditLog({
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
      entityType: 'taxonomy_definition',
      entityId: created.id,
      action: 'taxonomy_definition.created',
      newValue: {
        category: created.category,
        parentCategory: created.parentCategory,
        internalName: created.internalName,
        severity: created.severity,
      },
    })
  } catch (auditErr) {
    logger.error({ err: auditErr }, 'Audit log failed after taxonomy create')
  }

  try {
    revalidateTag('taxonomy', 'minutes')
  } catch (cacheErr) {
    logger.warn({ err: cacheErr }, 'revalidateTag failed after taxonomy create')
  }

  return {
    success: true,
    data: {
      id: created.id,
      category: created.category,
      parentCategory: created.parentCategory ?? null,
      internalName: created.internalName ?? null,
      severity: (created.severity ?? null) as Severity | null,
      description: created.description,
      isCustom: created.isCustom,
      isActive: created.isActive,
      displayOrder: created.displayOrder,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
  }
}
