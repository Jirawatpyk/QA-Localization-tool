'use server'

import 'server-only'

import { eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
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

  // Suppress unused variable warning — requireRole needed for auth check side-effect
  void currentUser

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

  revalidateTag('taxonomy', 'minutes')

  return { success: true, data: { updated: parsed.data.length } }
}
