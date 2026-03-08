'use server'

import 'server-only'

import { eq } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { reorderMappingsSchema } from '@/features/taxonomy/validation/taxonomySchemas'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
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

  // Guardrail #4: guard array[0] access (schema enforces .min(1) but defense-in-depth)
  // CR R1 L1 fix: moved before transaction for correct fail-fast ordering
  const firstItem = parsed.data[0]
  if (!firstItem) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Empty reorder list' }
  }

  // Atomic batch update — all display_order changes in a single transaction (Guardrail #6)
  // NOTE: taxonomyDefinitions has no tenant_id — shared reference data per ERD 1.9.
  // withTenant() is not applicable. Access control enforced by requireRole('admin', 'write').
  // Pipeline all UPDATEs concurrently within the transaction — reduces latency from
  // N × RTT (sequential) to ~1 × RTT (pipelined) for cloud DB with high network latency.
  try {
    const now = new Date()
    await db.transaction(async (tx) => {
      await Promise.all(
        parsed.data.map(({ id, displayOrder }) =>
          tx
            .update(taxonomyDefinitions)
            .set({ displayOrder, updatedAt: now })
            .where(eq(taxonomyDefinitions.id, id)),
        ),
      )
    })
  } catch (err) {
    return {
      success: false,
      code: 'UPDATE_FAILED',
      error: err instanceof Error ? err.message : 'Failed to reorder mappings',
    }
  }

  // CR R1 H2 fix: Guardrail #2 error-path — audit failure after successful DB update
  // must not crash the action or trigger optimistic revert in the caller
  try {
    await writeAuditLog({
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
      entityType: 'taxonomy_definition',
      entityId: firstItem.id,
      action: 'taxonomy_definition.reordered',
      newValue: { order: parsed.data },
    })
  } catch (auditErr) {
    // Non-fatal: DB transaction succeeded — audit is defense-in-depth (Guardrail #2)
    logger.error({ err: auditErr }, 'Audit log failed after taxonomy reorder')
  }

  // U8 fix: revalidateTag failure after successful DB commit must not crash the action
  // or trigger optimistic revert in the caller (same non-fatal pattern as audit log above)
  try {
    revalidateTag('taxonomy', 'minutes')
  } catch (cacheErr) {
    logger.warn({ err: cacheErr }, 'revalidateTag failed after taxonomy reorder')
  }

  return { success: true, data: { updated: parsed.data.length } }
}
