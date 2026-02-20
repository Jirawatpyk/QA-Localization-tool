'use server'

import 'server-only'

import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { createMappingSchema } from '@/features/taxonomy/validation/taxonomySchemas'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

import type { Severity, TaxonomyMapping } from '../types'

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

  const [created] = await db
    .insert(taxonomyDefinitions)
    .values({
      category: parsed.data.category,
      parentCategory: parsed.data.parentCategory ?? null,
      internalName: parsed.data.internalName,
      severity: parsed.data.severity,
      description: parsed.data.description,
      isCustom: true, // admin-created entries are custom (seed data uses isCustom: false)
    })
    .returning()

  if (!created) {
    return { success: false, code: 'INSERT_FAILED', error: 'Failed to create mapping' }
  }

  // Audit log uses currentUser.tenantId (admin's tenant) — taxonomy has no tenant_id
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

  revalidateTag('taxonomy', 'minutes')

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
