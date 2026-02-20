'use server'

import 'server-only'

import { eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { reorderMappingsSchema } from '@/features/taxonomy/validation/taxonomySchemas'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

export async function reorderMappings(input: unknown): Promise<ActionResult<{ updated: number }>> {
  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  const parsed = reorderMappingsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  // Update each mapping's display_order in sequence
  for (const { id, displayOrder } of parsed.data) {
    await db
      .update(taxonomyDefinitions)
      .set({ displayOrder, updatedAt: new Date() })
      .where(eq(taxonomyDefinitions.id, id))
  }

  // Audit log: single entry recording the full new order (FR54)

  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'taxonomy_definition',
    entityId: parsed.data[0]!.id,
    action: 'taxonomy_definition.reordered',
    newValue: { order: parsed.data },
  })

  revalidateTag('taxonomy', 'minutes')

  return { success: true, data: { updated: parsed.data.length } }
}
