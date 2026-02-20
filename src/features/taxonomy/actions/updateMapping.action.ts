'use server'

import 'server-only'

import { eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { updateMappingSchema } from '@/features/taxonomy/validation/taxonomySchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { isUuid } from '@/lib/validation/uuid'
import type { ActionResult } from '@/types/actionResult'

import type { TaxonomyMapping } from '../types'

export async function updateMapping(
  mappingId: string,
  input: unknown,
): Promise<ActionResult<TaxonomyMapping>> {
  if (!mappingId || !isUuid(mappingId)) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Invalid mapping ID' }
  }

  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  const parsed = updateMappingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const [existing] = await db
    .select()
    .from(taxonomyDefinitions)
    .where(eq(taxonomyDefinitions.id, mappingId))
    .limit(1)

  if (!existing) {
    return { success: false, code: 'NOT_FOUND', error: 'Mapping not found' }
  }

  const updateValues: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (parsed.data.category !== undefined) updateValues['category'] = parsed.data.category
  if (parsed.data.parentCategory !== undefined)
    updateValues['parentCategory'] = parsed.data.parentCategory
  if (parsed.data.internalName !== undefined)
    updateValues['internalName'] = parsed.data.internalName
  if (parsed.data.severity !== undefined) updateValues['severity'] = parsed.data.severity
  if (parsed.data.description !== undefined) updateValues['description'] = parsed.data.description
  if (parsed.data.isActive !== undefined) updateValues['isActive'] = parsed.data.isActive

  const [updated] = await db
    .update(taxonomyDefinitions)
    .set(updateValues)
    .where(eq(taxonomyDefinitions.id, mappingId))
    .returning()

  if (!updated) {
    return { success: false, code: 'UPDATE_FAILED', error: 'Failed to update mapping' }
  }

  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'taxonomy_definition',
    entityId: mappingId,
    action: 'taxonomy_definition.updated',
    oldValue: {
      category: existing.category,
      parentCategory: existing.parentCategory,
      internalName: existing.internalName,
      severity: existing.severity,
    },
    newValue: updateValues,
  })

  revalidateTag('taxonomy', 'minutes')

  return {
    success: true,
    data: {
      id: updated.id,
      category: updated.category,
      parentCategory: updated.parentCategory ?? null,
      internalName: updated.internalName ?? null,
      severity: updated.severity ?? null,
      description: updated.description,
      isCustom: updated.isCustom,
      isActive: updated.isActive,
      displayOrder: updated.displayOrder,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  }
}
