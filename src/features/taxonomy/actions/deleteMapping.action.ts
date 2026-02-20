'use server'

import 'server-only'

import { eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { requireRole } from '@/lib/auth/requireRole'
import { isUuid } from '@/lib/validation/uuid'
import type { ActionResult } from '@/types/actionResult'

// Soft delete: sets is_active = false, retains record for audit history
export async function deleteMapping(mappingId: string): Promise<ActionResult<{ id: string }>> {
  if (!mappingId || !isUuid(mappingId)) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Invalid mapping ID' }
  }

  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  const [existing] = await db
    .select()
    .from(taxonomyDefinitions)
    .where(eq(taxonomyDefinitions.id, mappingId))
    .limit(1)

  if (!existing) {
    return { success: false, code: 'NOT_FOUND', error: 'Mapping not found' }
  }

  if (!existing.isActive) {
    return { success: false, code: 'ALREADY_DELETED', error: 'Mapping is already inactive' }
  }

  await db
    .update(taxonomyDefinitions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(taxonomyDefinitions.id, mappingId))

  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'taxonomy_definition',
    entityId: mappingId,
    action: 'taxonomy_definition.deleted',
    oldValue: {
      category: existing.category,
      internalName: existing.internalName,
      isActive: true,
    },
    newValue: { isActive: false },
  })

  revalidateTag('taxonomy', 'minutes')

  return { success: true, data: { id: mappingId } }
}
